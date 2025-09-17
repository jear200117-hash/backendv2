const express = require('express');
const { body, validationResult } = require('express-validator');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const Invitation = require('../models/Invitation');
const { auth } = require('../middleware/auth');
const googleDriveService = require('../services/googleDriveService');
const { generateCustomQR } = require('../utils/qrWithLogo');
const { buildDriveViewUrl, buildDriveDownloadUrl } = require('../utils/gdriveUrls');
const path = require('path');

const router = express.Router();

// Create a new invitation
router.post('/', auth, [
  body('guestName').trim().isLength({ min: 1, max: 100 }),
  body('guestRole').isIn([
    'Ninong', 'Ninang', 'Best Man', 'Bridesmaid', 'General Guest',
    'Father of the Groom', 'Mother of the Groom', 'Father of the Bride', 'Mother of the Bride',
    'Groomsman', 'Flower Girl', 'Ring Bearer', 'Arras Bearer', 'Bible Bearer',
    'Maid of Honor', 'Little Bride', 'Male', 'Female', 'Groom', 'Bride'
  ]),
  body('customMessage').trim().isLength({ min: 1, max: 1000 }),
  body('invitationType').isIn(['personalized', 'general'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      guestName, 
      guestRole, 
      customMessage, 
      invitationType,
      qrCenterType = 'monogram',
      qrCenterOptions = {}
    } = req.body;

    // Generate unique QR code
    const qrCodeId = uuidv4();
    const invitationUrl = `${process.env.FRONTEND_URL}/invitation/${qrCodeId}`;
    
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

    // Generate QR code with custom center content
    const qrCodeBuffer = await generateCustomQR(invitationUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    }, qrCenterType, centerOptions);

    // Upload QR code to Google Drive
    const uploadResult = await googleDriveService.uploadQRCode(qrCodeBuffer, qrCodeId);

    // Create invitation
    const invitation = new Invitation({
      guestName,
      guestRole,
      customMessage,
      qrCode: qrCodeId,
      qrCodePath: buildDriveViewUrl(uploadResult.id, 800) || uploadResult.webContentLink,
      qrCodeFileId: uploadResult.id,
      invitationType,
      createdBy: req.user._id
    });

    await invitation.save();

    // Emit realtime create
    try {
      req.app.get('io')?.emit('invitations:created', {
        id: invitation._id,
        guestName: invitation.guestName,
        guestRole: invitation.guestRole,
        qrCode: invitation.qrCode
      });
    } catch (_) {}

    res.status(201).json({
      message: 'Invitation created successfully',
      invitation: {
        id: invitation._id,
        guestName: invitation.guestName,
        guestRole: invitation.guestRole,
        qrCode: invitation.qrCode,
        qrCodeUrl: buildDriveViewUrl(uploadResult.id, 800) || uploadResult.webContentLink,
        qrCodeDownloadUrl: buildDriveDownloadUrl(uploadResult.id),
        invitationUrl
      }
    });
  } catch (error) {
    console.error('Create invitation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all invitations (host only)
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, role } = req.query;
    
    const filter = { createdBy: req.user._id };
    if (status) filter.isActive = status === 'active';
    if (role && role !== 'all') filter.guestRole = role;

    const invitations = await Invitation.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Invitation.countDocuments(filter);

    const payload = {
      invitations,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    };

    try {
      const crypto = require('crypto');
      const bodyString = JSON.stringify(payload);
      const etag = 'W/"' + crypto.createHash('sha1').update(bodyString).digest('hex') + '"';
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch && ifNoneMatch === etag) {
        return res.status(304).end();
      }
      res.set('ETag', etag);
      res.set('Cache-Control', 'private, max-age=0, must-revalidate');
    } catch (_) {}

    res.json(payload);
  } catch (error) {
    console.error('Get invitations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get invitation by QR code (public)
router.get('/qr/:qrCode', async (req, res) => {
  try {
    const { qrCode } = req.params;
    
    const invitation = await Invitation.findOne({ 
      qrCode, 
      isActive: true 
    }).select('-qrCodePath -createdBy');

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // Mark as opened if not already opened
    if (!invitation.isOpened) {
      invitation.markAsOpened(req.ip, req.get('User-Agent'));
    }
    
    const payload = {
      invitation: {
        id: invitation._id,
        guestName: invitation.guestName,
        guestRole: invitation.guestRole,
        customMessage: invitation.customMessage,
        invitationType: invitation.invitationType,
        isOpened: invitation.isOpened,
        openedAt: invitation.openedAt,
        rsvp: invitation.rsvp
      }
    };
    try {
      const crypto = require('crypto');
      const bodyString = JSON.stringify(payload);
      const etag = 'W/"' + crypto.createHash('sha1').update(bodyString).digest('hex') + '"';
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch && ifNoneMatch === etag) {
        return res.status(304).end();
      }
      res.set('ETag', etag);
      res.set('Cache-Control', 'private, max-age=0, must-revalidate');
    } catch (_) {}

    res.json(payload);
  } catch (error) {
    console.error('Get invitation by QR error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update invitation
router.put('/:id', auth, [
  body('guestName').trim().isLength({ min: 1, max: 100 }),
  body('guestRole').isIn([
    'Ninong', 'Ninang', 'Best Man', 'Bridesmaid', 'General Guest',
    'Father of the Groom', 'Mother of the Groom', 'Father of the Bride', 'Mother of the Bride',
    'Groomsman', 'Flower Girl', 'Ring Bearer', 'Arras Bearer', 'Bible Bearer',
    'Maid of Honor', 'Little Bride', 'Male', 'Female', 'Groom', 'Bride'
  ]),
  body('customMessage').trim().isLength({ min: 1, max: 1000 }),
  body('isActive').isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { guestName, guestRole, customMessage, isActive } = req.body;

    const invitation = await Invitation.findOne({ 
      _id: id, 
      createdBy: req.user._id 
    });

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    invitation.guestName = guestName;
    invitation.guestRole = guestRole;
    invitation.customMessage = customMessage;
    invitation.isActive = isActive;

    await invitation.save();

    // Emit realtime update
    try {
      req.app.get('io')?.emit('invitations:updated', {
        id: invitation._id,
        isActive: invitation.isActive
      });
    } catch (_) {}

    res.json({
      message: 'Invitation updated successfully',
      invitation: {
        id: invitation._id,
        guestName: invitation.guestName,
        guestRole: invitation.guestRole,
        qrCode: invitation.qrCode,
        qrCodeUrl: invitation.qrCodePath
      }
    });
  } catch (error) {
    console.error('Update invitation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete invitation
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const invitation = await Invitation.findOne({ 
      _id: id, 
      createdBy: req.user._id 
    });

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // Delete QR code from Google Drive
    if (invitation.qrCodeFileId) {
      try {
        await googleDriveService.deleteFile(invitation.qrCodeFileId);
        console.log('Deleted QR code from Google Drive:', invitation.qrCodeFileId);
      } catch (gdriveError) {
        console.warn('Could not delete QR code from Google Drive:', gdriveError.message);
      }
    }

    await invitation.deleteOne();

    // Emit realtime delete
    try {
      req.app.get('io')?.emit('invitations:deleted', { id });
    } catch (_) {}

    res.json({ message: 'Invitation deleted successfully' });
  } catch (error) {
    console.error('Delete invitation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get invitation statistics
router.get('/stats', auth, async (req, res) => {
  try {
    const stats = await Invitation.aggregate([
      { $match: { createdBy: req.user._id } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: ['$isActive', 1, 0] } },
          opened: { $sum: { $cond: ['$isOpened', 1, 0] } },
          byRole: {
            $push: {
              role: '$guestRole',
              count: 1
            }
          }
        }
      }
    ]);

    const roleStats = await Invitation.aggregate([
      { $match: { createdBy: req.user._id } },
      {
        $group: {
          _id: '$guestRole',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({
      stats: stats[0] || { total: 0, active: 0, opened: 0 },
      roleStats
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
