const express = require('express');
const { body, validationResult } = require('express-validator');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const Invitation = require('../models/Invitation');
const { auth } = require('../middleware/auth');
const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');

const router = express.Router();

// Create a new invitation
router.post('/', auth, [
  body('guestName').trim().isLength({ min: 1, max: 100 }),
  body('guestRole').isIn(['Ninong', 'Ninang', 'Best Man', 'Bridesmaid', 'General Guest']),
  body('customMessage').trim().isLength({ min: 1, max: 1000 }),
  body('invitationType').isIn(['personalized', 'general'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { guestName, guestRole, customMessage, invitationType } = req.body;

    // Generate unique QR code
    const qrCodeId = uuidv4();
    const invitationUrl = `${process.env.FRONTEND_URL}/invitation/${qrCodeId}`;
    
    // Generate QR code as buffer
    const qrCodeBuffer = await QRCode.toBuffer(invitationUrl, {
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: 300,
      margin: 2
    });

    // Upload QR code to Cloudinary
    const stream = Readable.from(qrCodeBuffer);
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'wedding-qr-codes',
          public_id: `qr-${qrCodeId}`,
          format: 'png'
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.pipe(uploadStream);
    });

    // Create invitation
    const invitation = new Invitation({
      guestName,
      guestRole,
      customMessage,
      qrCode: qrCodeId,
      qrCodePath: uploadResult.secure_url,
      invitationType,
      createdBy: req.user._id
    });

    await invitation.save();

    res.status(201).json({
      message: 'Invitation created successfully',
      invitation: {
        id: invitation._id,
        guestName: invitation.guestName,
        guestRole: invitation.guestRole,
        qrCode: invitation.qrCode,
        qrCodeUrl: uploadResult.secure_url,
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

    res.json({
      invitations,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
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

    res.json({
      invitation: {
        id: invitation._id,
        guestName: invitation.guestName,
        guestRole: invitation.guestRole,
        customMessage: invitation.customMessage,
        invitationType: invitation.invitationType,
        isOpened: invitation.isOpened,
        openedAt: invitation.openedAt
      }
    });
  } catch (error) {
    console.error('Get invitation by QR error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update invitation
router.put('/:id', auth, [
  body('guestName').trim().isLength({ min: 1, max: 100 }),
  body('guestRole').isIn(['Ninong', 'Ninang', 'Best Man', 'Bridesmaid', 'General Guest']),
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

    // Delete QR code from Cloudinary
    try {
      if (invitation.qrCodePath && invitation.qrCodePath.includes('cloudinary')) {
        const publicId = invitation.qrCodePath.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`wedding-qr-codes/${publicId}`);
      }
    } catch (cloudinaryError) {
      console.warn('Could not delete QR code from Cloudinary:', cloudinaryError.message);
    }

    await invitation.deleteOne();

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
