const express = require('express');
const { body, validationResult } = require('express-validator');
const Media = require('../models/Media');
const Album = require('../models/Album');
const { upload, handleUploadError } = require('../middleware/upload');
const { buildDriveViewUrl, buildDriveDownloadUrl } = require('../utils/gdriveUrls');
const { auth } = require('../middleware/auth');
const googleDriveService = require('../services/googleDriveService');

const router = express.Router();

// Note: All media files are now stored in Google Drive

// Helper function to generate unique filename for Google Drive
const generateUniqueFilename = (originalName) => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 10);
  const extension = originalName.split('.').pop();
  return `${timestamp}-${randomString}.${extension}`;
};

// Upload media to album via QR code (guest - no authentication required)
router.post('/upload/qr/:qrCode', upload.array('media', 10), handleUploadError, async (req, res) => {
  try {
    const { qrCode } = req.params;
    const { uploadedBy } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    if (!uploadedBy || uploadedBy.trim() === '') {
      return res.status(400).json({ error: 'Guest name is required' });
    }

    // Find album by QR code
    const album = await Album.findOne({ qrCode });
    if (!album) {
      return res.status(404).json({ error: 'Album not found' });
    }

    console.log('Uploading to album via QR code:', {
      qrCode,
      albumId: album._id,
      albumName: album.name,
      albumPublic: album.isPublic,
      filesCount: files.length,
      uploadedBy
    });

    // Check if album is public and approved
    if (!album.isPublic || album.approvalStatus !== 'approved') {
      return res.status(403).json({ error: 'Album is not available for uploads' });
    }

    const uploadedMedia = [];

    for (const file of files) {
      try {
        // Debug: Check if file.buffer exists
        if (!file.buffer) {
          console.error('File buffer is undefined for file:', file.originalname);
          throw new Error('File buffer is undefined');
        }
        
        console.log('Uploading to Google Drive:', {
          filename: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
          bufferLength: file.buffer.length
        });
        
        // Upload to Google Drive
        const uploadResult = await googleDriveService.uploadMedia(
          file.buffer,
          file.originalname,
          album._id,
          uploadedBy
        );

        console.log('Google Drive upload result:', {
          fileId: uploadResult.fileInfo.id,
          webContentLink: uploadResult.fileInfo.webContentLink,
          size: uploadResult.fileInfo.size
        });

        const mediaType = file.mimetype.startsWith('image/') ? 'image' : 'video';
        
        const media = new Media({
          filename: uploadResult.fileInfo.name,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          url: buildDriveViewUrl(uploadResult.fileInfo.id, 1600) || uploadResult.fileInfo.webContentLink,
          thumbnailUrl: (uploadResult.thumbnailInfo?.id ? buildDriveViewUrl(uploadResult.thumbnailInfo.id, 300) : null) || uploadResult.thumbnailInfo?.webContentLink || null,
          googleDriveFileId: uploadResult.fileInfo.id,
          googleDriveThumbnailId: uploadResult.thumbnailInfo?.id || null,
          mediaType,
          album: album._id,
          uploadedBy,
          uploadedFrom: {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            timestamp: new Date()
          }
        });

        await media.save();
        uploadedMedia.push(media);
        console.log('Guest media saved successfully:', {
          mediaId: media._id,
          filename: media.filename,
          album: media.album,
          uploadedBy: media.uploadedBy
        });
      } catch (uploadError) {
        console.error('Media upload error:', uploadError);
        // Continue with other files even if one fails
      }
    }

    console.log('Final upload result:', {
      totalFiles: files.length,
      uploadedCount: uploadedMedia.length,
      albumId: album._id,
      qrCode
    });

    // Update album media count
    await album.updateMediaCount();
    
    // Refresh album data to get updated count
    const updatedAlbum = await Album.findById(album._id);
    console.log('Album updated:', {
      albumId: album._id,
      mediaCount: updatedAlbum.mediaCount,
      originalCount: album.mediaCount
    });

    console.log('Upload response:', {
      message: `${uploadedMedia.length} media files uploaded successfully`,
      mediaCount: uploadedMedia.length,
      albumId: album._id,
      qrCode
    });

    // Emit realtime media upload (guest)
    try {
      req.app.get('io')?.emit('media:uploaded', {
        albumId: album._id,
        count: uploadedMedia.length
      });
    } catch (_) {}

    res.status(201).json({
      message: `${uploadedMedia.length} media files uploaded successfully`,
      media: uploadedMedia.map(media => ({
        id: media._id,
        url: media.url,
        thumbnailUrl: media.thumbnailUrl,
        mediaType: media.mediaType,
        originalName: media.originalName,
        uploadedBy: media.uploadedBy,
        createdAt: media.createdAt
      }))
    });
  } catch (error) {
    console.error('Upload media error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload media to album (host - authenticated)
router.post('/host/upload/:albumId', auth, upload.array('media', 10), handleUploadError, [
  body('uploadedBy').trim().isLength({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { albumId } = req.params;
    const { uploadedBy } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Check if album exists
    const album = await Album.findById(albumId);
    if (!album) {
      return res.status(404).json({ error: 'Album not found' });
    }

    // Hosts can upload to any album
    const uploadedMedia = [];

    for (const file of files) {
      try {
        // Debug: Check if file.buffer exists
        if (!file.buffer) {
          console.error('File buffer is undefined for file:', file.originalname);
          throw new Error('File buffer is undefined');
        }
        
        console.log('Uploading to Google Drive (host):', {
          filename: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
          bufferLength: file.buffer.length
        });
        
        // Upload to Google Drive
        const uploadResult = await googleDriveService.uploadMedia(
          file.buffer,
          file.originalname,
          albumId,
          uploadedBy || req.user.email
        );

        console.log('Google Drive upload result (host):', {
          fileId: uploadResult.fileInfo.id,
          webContentLink: uploadResult.fileInfo.webContentLink,
          size: uploadResult.fileInfo.size
        });

        const mediaType = file.mimetype.startsWith('image/') ? 'image' : 'video';
        
        const media = new Media({
          filename: uploadResult.fileInfo.name,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          url: buildDriveViewUrl(uploadResult.fileInfo.id, 1600) || uploadResult.fileInfo.webContentLink,
          thumbnailUrl: (uploadResult.thumbnailInfo?.id ? buildDriveViewUrl(uploadResult.thumbnailInfo.id, 300) : null) || uploadResult.thumbnailInfo?.webContentLink || null,
          googleDriveFileId: uploadResult.fileInfo.id,
          googleDriveThumbnailId: uploadResult.thumbnailInfo?.id || null,
          mediaType,
          album: albumId,
          uploadedBy: uploadedBy || req.user.email, // Use host email if not specified
          uploadedFrom: {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            timestamp: new Date()
          }
        });

        await media.save();
        uploadedMedia.push(media);
      } catch (uploadError) {
        console.error('Media upload error:', uploadError);
        // Continue with other files even if one fails
      }
    }

    // Update album media count
    await album.updateMediaCount();

    // Emit realtime media upload (host)
    try {
      req.app.get('io')?.emit('media:uploaded', {
        albumId: albumId,
        count: uploadedMedia.length
      });
    } catch (_) {}

    res.status(201).json({
      message: `${uploadedMedia.length} media files uploaded successfully`,
      media: uploadedMedia.map(media => ({
        id: media._id,
        url: media.url,
        thumbnailUrl: media.thumbnailUrl,
        mediaType: media.mediaType,
        originalName: media.originalName,
        uploadedBy: media.uploadedBy,
        createdAt: media.createdAt
      }))
    });
  } catch (error) {
    console.error('Host upload media error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all media (with filtering)
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20, album, type, approved } = req.query;
    
    const filter = {};
    if (album) filter.album = album;
    if (type) filter.mediaType = type;
    if (approved !== undefined) filter.isApproved = approved === 'true';

    const media = await Media.find(filter)
      .populate('album', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Media.countDocuments(filter);

    res.json({
      media,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });
  } catch (error) {
    console.error('Get media error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get media by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const media = await Media.findById(id).populate('album', 'name isPublic');
    
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Check if media is in public album or user is host
    if (!media.album.isPublic && (!req.user || req.user.role !== 'host')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ media });
  } catch (error) {
    console.error('Get media error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve/reject media (host only)
router.put('/:id/approve', auth, [
  body('isApproved').isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { isApproved } = req.body;

    const media = await Media.findById(id);
    
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    media.isApproved = isApproved;
    await media.save();

    // Update album media count
    const album = await Album.findById(media.album);
    if (album) {
      await album.updateMediaCount();
    }

    // Emit realtime approval update
    try {
      req.app.get('io')?.emit('media:approved', {
        id: media._id,
        albumId: media.album,
        isApproved: media.isApproved
      });
    } catch (_) {}

    res.json({
      message: `Media ${isApproved ? 'approved' : 'rejected'} successfully`,
      media: {
        id: media._id,
        isApproved: media.isApproved
      }
    });
  } catch (error) {
    console.error('Approve media error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete media (host only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const media = await Media.findById(id);
    
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Delete from Google Drive if file exists
    if (media.googleDriveFileId) {
      try {
        await googleDriveService.deleteFile(media.googleDriveFileId);
        console.log('Deleted main file from Google Drive:', media.googleDriveFileId);
      } catch (gdriveError) {
        console.warn('Could not delete main file from Google Drive:', gdriveError);
      }
    }

    // Delete thumbnail from Google Drive if exists
    if (media.googleDriveThumbnailId) {
      try {
        await googleDriveService.deleteFile(media.googleDriveThumbnailId);
        console.log('Deleted thumbnail from Google Drive:', media.googleDriveThumbnailId);
      } catch (gdriveError) {
        console.warn('Could not delete thumbnail from Google Drive:', gdriveError);
      }
    }

    await media.deleteOne();

    // Update album media count
    const album = await Album.findById(media.album);
    if (album) {
      await album.updateMediaCount();
    }

    // Emit realtime delete
    try {
      req.app.get('io')?.emit('media:deleted', { id, albumId: album?._id });
    } catch (_) {}

    res.json({ message: 'Media deleted successfully' });
  } catch (error) {
    console.error('Delete media error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add tags to media
router.put('/:id/tags', auth, [
  body('tags').isArray().custom((tags) => {
    return tags.every(tag => typeof tag === 'string' && tag.trim().length > 0);
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { tags } = req.body;

    const media = await Media.findById(id);
    
    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    media.tags = tags.map(tag => tag.trim());
    await media.save();

    res.json({
      message: 'Tags updated successfully',
      tags: media.tags
    });
  } catch (error) {
    console.error('Update tags error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get media statistics
router.get('/stats/overview', auth, async (req, res) => {
  try {
    const stats = await Media.aggregate([
      {
        $group: {
          _id: null,
          totalMedia: { $sum: 1 },
          approvedMedia: { $sum: { $cond: ['$isApproved', 1, 0] } },
          pendingMedia: { $sum: { $cond: [{ $not: '$isApproved' }, 1, 0] } },
          totalSize: { $sum: '$size' },
          imageCount: { $sum: { $cond: [{ $eq: ['$mediaType', 'image'] }, 1, 0] } },
          videoCount: { $sum: { $cond: [{ $eq: ['$mediaType', 'video'] }, 1, 0] } }
        }
      }
    ]);

    const recentUploads = await Media.find({ isApproved: true })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('originalName mediaType uploadedBy createdAt')
      .populate('album', 'name');

    const topUploaders = await Media.aggregate([
      { $match: { isApproved: true } },
      {
        $group: {
          _id: '$uploadedBy',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      stats: stats[0] || { 
        totalMedia: 0, 
        approvedMedia: 0, 
        pendingMedia: 0, 
        totalSize: 0,
        imageCount: 0,
        videoCount: 0
      },
      recentUploads,
      topUploaders
    });
  } catch (error) {
    console.error('Get media stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
