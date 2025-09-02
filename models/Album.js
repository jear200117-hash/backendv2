const mongoose = require('mongoose');

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
    default: 'pending'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  rejectionReason: {
    type: String,
    trim: true,
    maxlength: 200
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  guestEmail: {
    type: String,
    trim: true,
    maxlength: 100,
    default: null
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
