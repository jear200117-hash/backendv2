const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  url: {
    type: String,
    required: true
  },
  thumbnailUrl: {
    type: String,
    default: null
  },
  mediaType: {
    type: String,
    enum: ['image', 'video'],
    required: true
  },
  album: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Album',
    required: true
  },
  uploadedBy: {
    type: String,
    required: true,
    trim: true
  },
  uploadedFrom: {
    ip: String,
    userAgent: String,
    timestamp: Date
  },
  isApproved: {
    type: Boolean,
    default: true
  },
  metadata: {
    width: Number,
    height: Number,
    duration: Number, // for videos
    format: String
  },
  tags: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true
});

// Indexes for better query performance
mediaSchema.index({ album: 1, isApproved: 1 });
mediaSchema.index({ mediaType: 1 });
mediaSchema.index({ uploadedBy: 1 });
mediaSchema.index({ createdAt: -1 });

// Virtual for file extension
mediaSchema.virtual('extension').get(function() {
  return this.originalName.split('.').pop().toLowerCase();
});

// Method to check if file is image
mediaSchema.methods.isImage = function() {
  return this.mediaType === 'image';
};

// Method to check if file is video
mediaSchema.methods.isVideo = function() {
  return this.mediaType === 'video';
};

// Method to get file size in human readable format
mediaSchema.methods.getFileSize = function() {
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  if (this.size === 0) return '0 Bytes';
  const i = Math.floor(Math.log(this.size) / Math.log(1024));
  return Math.round(this.size / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
};

module.exports = mongoose.model('Media', mediaSchema);
