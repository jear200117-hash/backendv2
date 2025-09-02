const express = require('express');
const { body, validationResult } = require('express-validator');
const Album = require('../models/Album');
const Media = require('../models/Media');
const { auth, optionalAuth } = require('../middleware/auth');

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

    const { name, description, isPublic = true, coverImage } = req.body;

    console.log('Host album creation request body:', req.body);
    console.log('Cover image received:', coverImage);
    console.log('Cover image type:', typeof coverImage);

    // Only hosts can create albums through this endpoint
    if (req.user.role !== 'host') {
      return res.status(403).json({ error: 'Only hosts can create albums through this endpoint' });
    }

    const album = new Album({
      name,
      description,
      isPublic,
      coverImage, // Add cover image
      approvalStatus: 'approved', // Host albums are auto-approved
      createdBy: req.user._id
    });

    console.log('Album object before save:', album);

    await album.save();
    
    console.log('Album saved successfully. Saved album data:', {
      id: album._id,
      name: album.name,
      coverImage: album.coverImage,
      coverImageType: typeof album.coverImage
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
        createdAt: album.createdAt
      }
    });
  } catch (error) {
    console.error('Create album error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new album (guest - no authentication required)
router.post('/guest', [
  body('name').trim().isLength({ min: 1, max: 100 }),
  body('description').optional().trim().isLength({ max: 500 }),
  body('isPublic').optional().isBoolean(),
  body('guestEmail').trim().isEmail().isLength({ max: 100 }),
  body('coverImage').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, isPublic = true, guestEmail, coverImage } = req.body;

    console.log('Guest album creation request body:', req.body);
    console.log('Cover image received:', coverImage);
    console.log('Cover image type:', typeof coverImage);

    console.log('Creating guest album:', {
      name,
      guestEmail,
      approvalStatus: 'pending',
      coverImage
    });

    const album = new Album({
      name,
      description,
      isPublic,
      coverImage, // Add cover image
      approvalStatus: 'pending', // Guest albums always need approval
      createdBy: null, // No user account
      guestEmail: guestEmail // Store guest email for reference
    });

    await album.save();
    
    console.log('Guest album saved successfully. Saved album data:', {
      id: album._id,
      name: album.name,
      coverImage: album.coverImage,
      coverImageType: typeof album.coverImage
    });

    res.status(201).json({
      message: 'Album created successfully and pending host approval',
      album: {
        id: album._id,
        name: album.name,
        description: album.description,
        coverImage: album.coverImage,
        isPublic: album.isPublic,
        approvalStatus: album.approvalStatus,
        mediaCount: album.mediaCount,
        createdAt: album.createdAt
      }
    });
  } catch (error) {
    console.error('Create guest album error:', error);
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
      filter = {};
    }
    
    if (featured === 'true') {
      filter.isFeatured = true;
    }

    const albums = await Album.find(filter)
      .sort({ isFeatured: -1, lastUpdated: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('createdBy', 'email');

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

// Get pending albums for host approval
router.get('/pending', auth, async (req, res) => {
  try {
    if (req.user.role !== 'host') {
      return res.status(403).json({ error: 'Access denied. Host only.' });
    }

    const pendingAlbums = await Album.find({ approvalStatus: 'pending' })
      .populate('createdBy', 'email')
      .sort({ createdAt: -1 });

    // Format pending albums to show creator info
    const formattedPendingAlbums = pendingAlbums.map(album => ({
      ...album.toObject(),
      creatorInfo: album.createdBy 
        ? { type: 'user', email: album.createdBy.email }
        : { type: 'guest', email: album.guestEmail }
    }));

    res.json({ pendingAlbums: formattedPendingAlbums });
  } catch (error) {
    console.error('Get pending albums error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve or reject album (host only)
router.put('/:id/approve', auth, [
  body('action').isIn(['approve', 'reject']),
  body('rejectionReason').optional().trim().isLength({ max: 200 })
], async (req, res) => {
  try {
    if (req.user.role !== 'host') {
      return res.status(403).json({ error: 'Access denied. Host only.' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { action, rejectionReason } = req.body;

    const album = await Album.findById(id);
    
    if (!album) {
      return res.status(404).json({ error: 'Album not found' });
    }

    if (action === 'approve') {
      album.approvalStatus = 'approved';
      album.approvedBy = req.user._id;
      album.approvedAt = new Date();
      album.rejectionReason = undefined;
    } else {
      album.approvalStatus = 'rejected';
      album.rejectionReason = rejectionReason || 'No reason provided';
      album.approvedBy = undefined;
      album.approvedAt = undefined;
    }

    await album.save();

    res.json({
      message: `Album ${action}d successfully`,
      album: {
        id: album._id,
        name: album.name,
        approvalStatus: album.approvalStatus,
        approvedAt: album.approvedAt,
        rejectionReason: album.rejectionReason
      }
    });
  } catch (error) {
    console.error('Album approval error:', error);
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

    // Check if album is public, approved, or user is host
    if (!album.isPublic && (!req.user || req.user.role !== 'host')) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Hosts can see all albums (including pending ones)
    if (req.user && req.user.role === 'host') {
      // Host can see everything
    } else {
      // Guests can only see approved albums
      if (album.approvalStatus !== 'approved') {
        return res.status(403).json({ error: 'Album is pending approval' });
      }
    }

    // Get media for this album
    let mediaFilter = { album: id };
    
    // Hosts can see all media, guests only see media in approved albums
    if (!req.user || req.user.role !== 'host') {
      // For guests, only show media in approved albums
      if (album.approvalStatus !== 'approved') {
        mediaFilter.isApproved = true;
      }
    }
    
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

    res.json({
      album: {
        id: album._id,
        name: album.name,
        description: album.description,
        coverImage: album.coverImage,
        isFeatured: album.isFeatured,
        mediaCount: album.mediaCount,
        createdAt: album.createdAt,
        lastUpdated: album.lastUpdated
      },
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
