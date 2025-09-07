const express = require('express');
const { body, validationResult } = require('express-validator');
const Album = require('../models/Album');
const Media = require('../models/Media');
const { auth, optionalAuth } = require('../middleware/auth');
const QRCode = require('qrcode');
const { generateCustomQR } = require('../utils/qrWithLogo');
const path = require('path');

const router = express.Router();

// Create a new album (host only)
router.post('/', auth, [
  body('name').trim().isLength({ min: 1, max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('isPublic').optional().isBoolean(),
  body('coverImage').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      name, 
      description, 
      isPublic = true, 
      coverImage,
      qrCenterType = 'monogram',
      qrCenterOptions = {}
    } = req.body;

    console.log('Host album creation request body:', req.body);

    // Only hosts can create albums through this endpoint
    if (req.user.role !== 'host') {
      return res.status(403).json({ error: 'Only hosts can create albums through this endpoint' });
    }

    const album = new Album({
      name,
      description,
      isPublic,
      coverImage,
      approvalStatus: 'approved', // Host albums are auto-approved
      createdBy: req.user._id
    });

    // Generate QR code and upload URL
    const { qrCode, uploadUrl } = album.generateQRCode();

    // Set default monogram for wedding
    const centerOptions = {
      ...qrCenterOptions,
      monogram: qrCenterOptions.monogram || 'M&E'
    };

    // Convert logo URL path to file system path if needed
    if (qrCenterType === 'logo' && centerOptions.logoPath) {
      if (centerOptions.logoPath.startsWith('/uploads/logos/')) {
        centerOptions.logoPath = path.join(__dirname, '..', centerOptions.logoPath);
      }
    }

    // Generate QR code image with custom center content
    try {
      const qrCodeBuffer = await generateCustomQR(uploadUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      }, qrCenterType, centerOptions);

      const qrCodeDataURL = `data:image/png;base64,${qrCodeBuffer.toString('base64')}`;
      album.qrCodeUrl = qrCodeDataURL;
    } catch (qrError) {
      console.error('QR code generation error:', qrError);
      // Continue without QR code image, but keep the QR code string
    }

    await album.save();
    
    console.log('Album saved successfully with QR code:', {
      id: album._id,
      name: album.name,
      qrCode: album.qrCode,
      uploadUrl: album.uploadUrl
    });

    res.status(201).json({
      message: 'Album created successfully',
      album: {
        id: album._id,
        name: album.name,
        description: album.description,
        coverImage: album.coverImage,
        isPublic: album.isPublic,
        approvalStatus: album.approvalStatus,
        mediaCount: album.mediaCount,
        qrCode: album.qrCode,
        qrCodeUrl: album.qrCodeUrl,
        uploadUrl: album.uploadUrl,
        createdAt: album.createdAt
      }
    });
  } catch (error) {
    console.error('Create album error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get album by QR code (for guest upload page)
router.get('/qr/:qrCode', async (req, res) => {
  try {
    const { qrCode } = req.params;

    const album = await Album.findOne({ qrCode }).populate('createdBy', 'email');
    
    if (!album) {
      return res.status(404).json({ error: 'Album not found' });
    }

    // Check if album is public and approved
    if (!album.isPublic || album.approvalStatus !== 'approved') {
      return res.status(403).json({ error: 'Album is not available for uploads' });
    }

    res.json({
      album: {
        id: album._id,
        name: album.name,
        description: album.description,
        coverImage: album.coverImage,
        mediaCount: album.mediaCount,
        uploadUrl: album.uploadUrl
      }
    });
  } catch (error) {
    console.error('Get album by QR code error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all albums (public albums for guests, all for host)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, featured } = req.query;
    
    let filter = { isPublic: true, approvalStatus: 'approved' };
    
    // If user is authenticated (host), show all albums
    if (req.user && req.user.role === 'host') {
      filter = { approvalStatus: 'approved' }; // Hosts see all approved albums
    }
    
    if (featured === 'true') {
      filter.isFeatured = true;
    }

    const albums = await Album.find(filter)
      .sort({ isFeatured: -1, lastUpdated: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('createdBy', 'email')
      .select('-qrCode -uploadUrl'); // Don't expose QR codes in public listing

    const total = await Album.countDocuments(filter);

    res.json({
      albums,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Get albums error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get host albums with QR codes (host only)
router.get('/host', auth, async (req, res) => {
  try {
    if (req.user.role !== 'host') {
      return res.status(403).json({ error: 'Access denied. Host only.' });
    }

    const albums = await Album.find({ createdBy: req.user._id })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'email');

    res.json({ albums });
  } catch (error) {
    console.error('Get host albums error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Regenerate QR code for album (host only)
router.put('/:id/regenerate-qr', auth, async (req, res) => {
  try {
    if (req.user.role !== 'host') {
      return res.status(403).json({ error: 'Access denied. Host only.' });
    }

    const { id } = req.params;

    const album = await Album.findOne({ 
      _id: id, 
      createdBy: req.user._id 
    });
    
    if (!album) {
      return res.status(404).json({ error: 'Album not found' });
    }

    // Generate new QR code and upload URL
    const { qrCode, uploadUrl } = album.generateQRCode();

    // Generate new QR code image
    try {
      const qrCodeDataURL = await QRCode.toDataURL(uploadUrl, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      album.qrCodeUrl = qrCodeDataURL;
    } catch (qrError) {
      console.error('QR code generation error:', qrError);
    }

    await album.save();

    res.json({
      message: 'QR code regenerated successfully',
      album: {
        id: album._id,
        name: album.name,
        qrCode: album.qrCode,
        qrCodeUrl: album.qrCodeUrl,
        uploadUrl: album.uploadUrl
      }
    });
  } catch (error) {
    console.error('Regenerate QR code error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get album by ID with media
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const album = await Album.findById(id);
    
    if (!album) {
      return res.status(404).json({ error: 'Album not found' });
    }

    // Check if album is public and approved
    if (!album.isPublic || album.approvalStatus !== 'approved') {
      return res.status(403).json({ error: 'Album is not available' });
    }

    // Get media for this album
    const mediaFilter = { album: id };
    
    console.log('Album media query:', {
      albumId: id,
      mediaFilter,
      userRole: req.user?.role,
      albumApprovalStatus: album.approvalStatus
    });
    
    const media = await Media.find(mediaFilter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalMedia = await Media.countDocuments(mediaFilter);
    
    console.log('Media query result:', {
      mediaCount: media.length,
      totalMedia,
      filter: mediaFilter
    });

    // Prepare album response (don't expose QR codes to guests)
    const albumResponse = {
      id: album._id,
      name: album.name,
      description: album.description,
      coverImage: album.coverImage,
      isFeatured: album.isFeatured,
      mediaCount: album.mediaCount,
      createdAt: album.createdAt,
      lastUpdated: album.lastUpdated
    };

    // Include QR code info for hosts
    if (req.user && req.user.role === 'host' && album.createdBy.toString() === req.user._id.toString()) {
      albumResponse.qrCode = album.qrCode;
      albumResponse.qrCodeUrl = album.qrCodeUrl;
      albumResponse.uploadUrl = album.uploadUrl;
    }

    res.json({
      album: albumResponse,
      media,
      totalPages: Math.ceil(totalMedia / limit),
      currentPage: parseInt(page),
      totalMedia
    });
  } catch (error) {
    console.error('Get album error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update album (host only)
router.put('/:id', auth, [
  body('name').trim().isLength({ min: 1, max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('isPublic').optional().isBoolean(),
  body('isFeatured').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { name, description, isPublic, isFeatured } = req.body;

    const album = await Album.findOne({ 
      _id: id, 
      createdBy: req.user._id 
    });

    if (!album) {
      return res.status(404).json({ error: 'Album not found' });
    }

    album.name = name;
    if (description !== undefined) album.description = description;
    if (isPublic !== undefined) album.isPublic = isPublic;
    if (isFeatured !== undefined) album.isFeatured = isFeatured;

    await album.save();

    res.json({
      message: 'Album updated successfully',
      album: {
        id: album._id,
        name: album.name,
        description: album.description,
        isPublic: album.isPublic,
        isFeatured: album.isFeatured
      }
    });
  } catch (error) {
    console.error('Update album error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete album (host only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const album = await Album.findOne({ 
      _id: id, 
      createdBy: req.user._id 
    });

    if (!album) {
      return res.status(404).json({ error: 'Album not found' });
    }

    // Delete all media in this album
    await Media.deleteMany({ album: id });

    await album.deleteOne();

    res.json({ message: 'Album deleted successfully' });
  } catch (error) {
    console.error('Delete album error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Set album cover image
router.put('/:id/cover', auth, [
  body('coverImage').isURL()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { coverImage } = req.body;

    const album = await Album.findOne({ 
      _id: id, 
      createdBy: req.user._id 
    });

    if (!album) {
      return res.status(404).json({ error: 'Album not found' });
    }

    album.coverImage = coverImage;
    await album.save();

    res.json({
      message: 'Album cover updated successfully',
      coverImage: album.coverImage
    });
  } catch (error) {
    console.error('Update album cover error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get album statistics (host only)
router.get('/stats/overview', auth, async (req, res) => {
  try {
    // Hosts see stats for all albums
    const stats = await Album.aggregate([
      {
        $group: {
          _id: null,
          totalAlbums: { $sum: 1 },
          publicAlbums: { $sum: { $cond: ['$isPublic', 1, 0] } },
          featuredAlbums: { $sum: { $cond: ['$isFeatured', 1, 0] } },
          pendingAlbums: { $sum: { $cond: [{ $eq: ['$approvalStatus', 'pending'] }, 1, 0] } },
          totalMedia: { $sum: '$mediaCount' }
        }
      }
    ]);

    const recentAlbums = await Album.find()
      .sort({ lastUpdated: -1 })
      .limit(5)
      .select('name mediaCount lastUpdated approvalStatus');

    res.json({
      stats: stats[0] || { totalAlbums: 0, publicAlbums: 0, featuredAlbums: 0, pendingAlbums: 0, totalMedia: 0 },
      recentAlbums
    });
  } catch (error) {
    console.error('Get album stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
