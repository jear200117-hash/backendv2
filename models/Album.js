const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const albumSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  coverImage: {
    type: String,
    default: null
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved' // Host albums are auto-approved
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: {
    type: Date,
    default: Date.now
  },
  rejectionReason: {
    type: String,
    trim: true,
    maxlength: 200
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true // Only hosts can create albums now
  },
  guestEmail: {
    type: String,
    trim: true,
    maxlength: 100,
    default: null
  },
  // QR Code related fields
  qrCode: {
    type: String,
    unique: true,
    required: true
  },
  qrCodeUrl: {
    type: String,
    default: null
  },
  uploadUrl: {
    type: String,
    required: true
  },
  mediaCount: {
    type: Number,
    default: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for better query performance
albumSchema.index({ isPublic: 1, isFeatured: 1 });
albumSchema.index({ createdBy: 1 });
albumSchema.index({ approvalStatus: 1 });
albumSchema.index({ qrCode: 1 }); // Index for QR code lookups

// Method to generate QR code and upload URL
albumSchema.methods.generateQRCode = function() {
  const qrCode = uuidv4();
  const uploadUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/upload/${qrCode}`;
  
  this.qrCode = qrCode;
  this.uploadUrl = uploadUrl;
  
  return { qrCode, uploadUrl };
};

// Method to update media count
albumSchema.methods.updateMediaCount = function() {
  console.log('Updating media count for album:', {
    albumId: this._id,
    currentCount: this.mediaCount
  });
  
  return this.model('Media').countDocuments({ album: this._id })
    .then(count => {
      console.log('Media count result:', {
        albumId: this._id,
        oldCount: this.mediaCount,
        newCount: count
      });
      
      this.mediaCount = count;
      this.lastUpdated = new Date();
      return this.save();
    });
};

module.exports = mongoose.model('Album', albumSchema);
