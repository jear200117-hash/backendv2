const express = require('express');
const router = express.Router();
const Invitation = require('../models/Invitation');
const { auth } = require('../middleware/auth');

// Submit RSVP response
router.post('/submit/:qrCode', async (req, res) => {
  try {
    const { qrCode } = req.params;
    const { status, attendeeCount, guestNames, email, phone } = req.body;

    // Validate required fields
    if (!status || !['attending', 'not_attending'].includes(status)) {
      return res.status(400).json({ 
        error: 'Valid RSVP status is required (attending or not_attending)' 
      });
    }

    // Find invitation by QR code
    const invitation = await Invitation.findOne({ qrCode, isActive: true });
    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // Check if RSVP has already been submitted (one-time only)
    if (invitation.rsvp.status && invitation.rsvp.status !== 'pending') {
      return res.status(400).json({ 
        error: 'RSVP has already been submitted and cannot be changed. Please contact the hosts if you need to make changes.' 
      });
    }

    // Validate required fields for attending status
    if (status === 'attending') {
      if (!attendeeCount || attendeeCount < 1) {
        return res.status(400).json({ 
          error: 'Attendee count must be at least 1 for attending guests' 
        });
      }

      // Validate email and phone for attending guests
      if (!email || !email.trim()) {
        return res.status(400).json({ 
          error: 'Email address is required for attending guests' 
        });
      }

      if (!phone || !phone.trim()) {
        return res.status(400).json({ 
          error: 'Phone number is required for attending guests' 
        });
      }

      // Validate guest names
      if (!guestNames || guestNames.length < 1 || !guestNames[0].trim()) {
        return res.status(400).json({ 
          error: 'Guest name is required for attending guests' 
        });
      }
    }

    // Get client IP and User Agent
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || 
                     (req.connection.socket ? req.connection.socket.remoteAddress : null);
    const userAgent = req.get('User-Agent') || '';

    // Submit RSVP
    const rsvpData = {
      status,
      attendeeCount: status === 'attending' ? attendeeCount : 0,
      guestNames: status === 'attending' ? (guestNames || []) : [],
      email: status === 'attending' ? (email || '') : '',
      phone: status === 'attending' ? (phone || '') : ''
    };

    await invitation.submitRSVP(rsvpData, clientIP, userAgent);

    // Mark invitation as opened if not already
    if (!invitation.isOpened) {
      await invitation.markAsOpened(clientIP, userAgent);
    }

    res.json({
      message: 'RSVP submitted successfully',
      rsvp: {
        status: invitation.rsvp.status,
        attendeeCount: invitation.rsvp.attendeeCount,
        respondedAt: invitation.rsvp.respondedAt,
        email: invitation.rsvp.email,
        phone: invitation.rsvp.phone,
        guestNames: invitation.rsvp.guestNames
      }
    });

  } catch (error) {
    console.error('RSVP submission error:', error);
    res.status(500).json({ error: 'Failed to submit RSVP' });
  }
});

// Get RSVP status for a specific invitation
router.get('/status/:qrCode', async (req, res) => {
  try {
    const { qrCode } = req.params;

    const invitation = await Invitation.findOne({ qrCode, isActive: true })
      .select('guestName qrCode qrCodePath rsvp.status rsvp.attendeeCount rsvp.respondedAt rsvp.email rsvp.phone rsvp.guestNames');

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    res.json({
      guestName: invitation.guestName,
      qrCode: invitation.qrCode,
      qrCodePath: invitation.qrCodePath,
      rsvp: {
        status: invitation.rsvp.status,
        attendeeCount: invitation.rsvp.attendeeCount,
        respondedAt: invitation.rsvp.respondedAt,
        email: invitation.rsvp.email,
        phone: invitation.rsvp.phone,
        guestNames: invitation.rsvp.guestNames
      }
    });

  } catch (error) {
    console.error('RSVP status error:', error);
    res.status(500).json({ error: 'Failed to get RSVP status' });
  }
});

// Get all RSVP responses (protected route for hosts)
router.get('/all', auth, async (req, res) => {
  try {
    const { status, role, search } = req.query;
    
    // Build query filters
    const filters = { createdBy: req.user.id };
    
    if (status && status !== 'all') {
      filters['rsvp.status'] = status;
    }
    
    if (role && role !== 'all') {
      filters.guestRole = role;
    }
    
    if (search) {
      filters.guestName = { $regex: search, $options: 'i' };
    }

    const invitations = await Invitation.find(filters)
      .select('guestName guestRole qrCode qrCodePath rsvp invitationType createdAt')
      .sort({ 'rsvp.respondedAt': -1, createdAt: -1 });

    // Calculate statistics
    const stats = {
      total: invitations.length,
      pending: invitations.filter(inv => inv.rsvp.status === 'pending').length,
      attending: invitations.filter(inv => inv.rsvp.status === 'attending').length,
      notAttending: invitations.filter(inv => inv.rsvp.status === 'not_attending').length,
      totalAttendees: invitations
        .filter(inv => inv.rsvp.status === 'attending')
        .reduce((sum, inv) => sum + inv.rsvp.attendeeCount, 0)
    };

    res.json({
      invitations,
      stats
    });

  } catch (error) {
    console.error('RSVP list error:', error);
    res.status(500).json({ error: 'Failed to get RSVP responses' });
  }
});

// Get RSVP details for a specific invitation (protected route for hosts)
router.get('/details/:id', auth, async (req, res) => {
  try {
    const invitation = await Invitation.findOne({ 
      _id: req.params.id, 
      createdBy: req.user.id 
    });

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    res.json({
      guestName: invitation.guestName,
      guestRole: invitation.guestRole,
      rsvp: invitation.rsvp,
      isOpened: invitation.isOpened,
      openedAt: invitation.openedAt,
      invitationType: invitation.invitationType,
      createdAt: invitation.createdAt
    });

  } catch (error) {
    console.error('RSVP details error:', error);
    res.status(500).json({ error: 'Failed to get RSVP details' });
  }
});

// Update RSVP status (protected route for hosts - manual override)
router.put('/update/:id', auth, async (req, res) => {
  try {
    const { status, attendeeCount, notes } = req.body;

    const invitation = await Invitation.findOne({ 
      _id: req.params.id, 
      createdBy: req.user.id 
    });

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    // Update RSVP status
    if (status) {
      invitation.rsvp.status = status;
    }
    
    if (attendeeCount !== undefined) {
      invitation.rsvp.attendeeCount = attendeeCount;
    }

    if (notes) {
      invitation.rsvp.specialRequests = notes;
    }

    await invitation.save();

    res.json({
      message: 'RSVP updated successfully',
      rsvp: invitation.rsvp
    });

  } catch (error) {
    console.error('RSVP update error:', error);
    res.status(500).json({ error: 'Failed to update RSVP' });
  }
});

module.exports = router;
