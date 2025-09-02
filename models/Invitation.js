const mongoose = require('mongoose');

const invitationSchema = new mongoose.Schema({
  guestName: {
    type: String,
    required: true,
    trim: true
  },
  guestRole: {
    type: String,
    required: true,
    enum: ['Ninong', 'Ninang', 'Best Man', 'Bridesmaid', 'General Guest'],
    default: 'General Guest'
  },
  customMessage: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  qrCode: {
    type: String,
    required: true,
    unique: true
  },
  qrCodePath: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isOpened: {
    type: Boolean,
    default: false
  },
  openedAt: {
    type: Date
  },
  openedBy: {
    ip: String,
    userAgent: String,
    timestamp: Date
  },
  invitationType: {
    type: String,
    enum: ['personalized', 'general'],
    default: 'personalized'
  },
  rsvp: {
    status: {
      type: String,
      enum: ['pending', 'attending', 'not_attending'],
      default: 'pending'
    },
    attendeeCount: {
      type: Number,
      min: 0,
      max: 10,
      default: 1
    },
    
    respondedAt: {
      type: Date
    },
    respondedBy: {
      ip: String,
      userAgent: String,
      timestamp: Date
    },
            guestNames: [{
          type: String,
          trim: true,
          maxlength: 100
        }],
        email: {
          type: String,
          trim: true,
          maxlength: 255
        },
        phone: {
          type: String,
          trim: true,
          maxlength: 20
        }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for active invitations
invitationSchema.index({ isActive: 1 });

// Virtual for invitation URL
invitationSchema.virtual('invitationUrl').get(function() {
  return `${process.env.FRONTEND_URL}/invitation/${this.qrCode}`;
});

// Method to mark invitation as opened
invitationSchema.methods.markAsOpened = function(ip, userAgent) {
  this.isOpened = true;
  this.openedAt = new Date();
  this.openedBy = {
    ip,
    userAgent,
    timestamp: new Date()
  };
  return this.save();
};

// Method to submit RSVP response
invitationSchema.methods.submitRSVP = function(rsvpData, ip, userAgent) {
  this.rsvp.status = rsvpData.status;
  this.rsvp.attendeeCount = rsvpData.attendeeCount || 1;
  
        this.rsvp.guestNames = rsvpData.guestNames || [];
      this.rsvp.email = rsvpData.email || '';
      this.rsvp.phone = rsvpData.phone || '';
  this.rsvp.respondedAt = new Date();
  this.rsvp.respondedBy = {
    ip,
    userAgent,
    timestamp: new Date()
  };
  return this.save();
};

module.exports = mongoose.model('Invitation', invitationSchema);
