const { drive, FOLDERS } = require('../config/googleDrive');
const sharp = require('sharp');
const mime = require('mime-types');
const { Readable } = require('stream');

class GoogleDriveService {
  constructor() {
    this.rateLimitDelay = 200; // 200ms between requests (5 req/sec) - well under Google's 100 req/100sec limit
    this.lastRequestTime = 0;
    this.maxRetries = 3;
    this.retryDelay = 2000; // 2 seconds base delay for retries
  }

  // Rate limiting helper
  async rateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      await new Promise(resolve => 
        setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest)
      );
    }
    
    this.lastRequestTime = Date.now();
  }

  // Retry helper for handling 429 errors
  async withRetry(operation, retryCount = 0) {
    try {
      await this.rateLimit();
      return await operation();
    } catch (error) {
      if (error.code === 429 && retryCount < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(2, retryCount); // Exponential backoff
        console.log(`Rate limited, retrying in ${delay}ms (attempt ${retryCount + 1}/${this.maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.withRetry(operation, retryCount + 1);
      }
      throw error;
    }
  }

  // Create folder if it doesn't exist
  async createFolder(folderName, parentFolderId = null) {
    return this.withRetry(async () => {
      // Check if folder already exists
      const query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder'`;
      const parentQuery = parentFolderId ? ` and '${parentFolderId}' in parents` : '';
      
      const response = await drive.files.list({
        q: query + parentQuery,
        fields: 'files(id, name)',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true
      });

      if (response.data.files.length > 0) {
        return response.data.files[0];
      }

      // Create folder
      const folderMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentFolderId ? [parentFolderId] : undefined
      };

      const folder = await drive.files.create({
        resource: folderMetadata,
        fields: 'id, name, webViewLink',
        supportsAllDrives: true
      });

      // Set public sharing permissions
      await this.setPublicPermissions(folder.data.id);
      
      return folder.data;
    });
  }

  // Set public sharing permissions
  async setPublicPermissions(fileId) {
    return this.withRetry(async () => {
      await drive.permissions.create({
        fileId: fileId,
        resource: {
          role: 'reader',
          type: 'anyone'
        },
        supportsAllDrives: true
      });
    });
  }

  // Upload file to Google Drive
  async uploadFile(fileBuffer, fileName, folderId, mimeType, isPublic = true) {
    return this.withRetry(async () => {
      const fileMetadata = {
        name: fileName,
        parents: [folderId]
      };

      const media = {
        mimeType: mimeType,
        body: Readable.from(fileBuffer)
      };

      const file = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, name, webViewLink, webContentLink, size, mimeType',
        supportsAllDrives: true
      });

      // Set public sharing if requested
      if (isPublic) {
        await this.setPublicPermissions(file.data.id);
      }

      return {
        id: file.data.id,
        name: file.data.name,
        webViewLink: file.data.webViewLink,
        webContentLink: file.data.webContentLink,
        size: file.data.size,
        mimeType: file.data.mimeType
      };
    });
  }

  // Generate and upload thumbnail
  async generateThumbnail(fileBuffer, originalFileName, folderId) {
    try {
      // Generate thumbnail using Sharp
      const thumbnailBuffer = await sharp(fileBuffer)
        .resize(300, 300, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      const thumbnailFileName = `thumb_${originalFileName.replace(/\.[^/.]+$/, '')}.jpg`;
      
      return await this.uploadFile(
        thumbnailBuffer,
        thumbnailFileName,
        folderId,
        'image/jpeg',
        true
      );
    } catch (error) {
      console.error('Error generating thumbnail:', error);
      throw error;
    }
  }

  // Upload media file with thumbnail
  async uploadMedia(fileBuffer, originalName, albumId, uploadedBy) {
    try {
      // Create album-specific folder
      const albumFolderName = `album-${albumId}`;
      const albumFolder = await this.createFolder(albumFolderName, FOLDERS.WEDDING_MEDIA);
      
      // Generate unique filename
      const timestamp = Date.now();
      const fileExtension = originalName.split('.').pop();
      const uniqueFileName = `${timestamp}-${originalName}`;
      
      // Detect MIME type
      const mimeType = mime.lookup(originalName) || 'application/octet-stream';
      
      // Upload main file
      const fileInfo = await this.uploadFile(
        fileBuffer,
        uniqueFileName,
        albumFolder.id,
        mimeType,
        true
      );

      let thumbnailInfo = null;
      
      // Generate thumbnail for images
      if (mimeType.startsWith('image/')) {
        thumbnailInfo = await this.generateThumbnail(
          fileBuffer,
          uniqueFileName,
          FOLDERS.WEDDING_THUMBNAIL
        );
      }

      return {
        fileInfo,
        thumbnailInfo,
        albumFolder
      };
    } catch (error) {
      console.error('Error uploading media:', error);
      throw error;
    }
  }

  // Upload QR code
  async uploadQRCode(qrCodeBuffer, qrCodeId) {
    try {
      const fileName = `qr-${qrCodeId}.png`;
      
      return await this.uploadFile(
        qrCodeBuffer,
        fileName,
        FOLDERS.WEDDING_QR,
        'image/png',
        true
      );
    } catch (error) {
      console.error('Error uploading QR code:', error);
      throw error;
    }
  }

  // Upload logo
  async uploadLogo(fileBuffer, originalName) {
    try {
      const timestamp = Date.now();
      const fileExtension = originalName.split('.').pop();
      const fileName = `logo-${timestamp}-${originalName}`;
      
      const mimeType = mime.lookup(originalName) || 'image/png';
      
      return await this.uploadFile(
        fileBuffer,
        fileName,
        FOLDERS.WEDDING_LOGO,
        mimeType,
        false // Logos are private
      );
    } catch (error) {
      console.error('Error uploading logo:', error);
      throw error;
    }
  }

  // Delete file
  async deleteFile(fileId) {
    await this.rateLimit();
    
    try {
      await drive.files.delete({
        fileId: fileId,
        supportsAllDrives: true
      });
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  }

  // Get file info
  async getFileInfo(fileId) {
    await this.rateLimit();
    
    try {
      const file = await drive.files.get({
        fileId: fileId,
        fields: 'id, name, webViewLink, webContentLink, size, mimeType',
        supportsAllDrives: true
      });
      
      return file.data;
    } catch (error) {
      console.error('Error getting file info:', error);
      throw error;
    }
  }

  // List files in folder
  async listFiles(folderId, pageSize = 100) {
    await this.rateLimit();
    
    try {
      const response = await drive.files.list({
        q: `'${folderId}' in parents`,
        fields: 'files(id, name, webViewLink, webContentLink, size, mimeType, createdTime)',
        pageSize: pageSize,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true
      });
      
      return response.data.files;
    } catch (error) {
      console.error('Error listing files:', error);
      throw error;
    }
  }

  // Initialize folder structure
  async initializeFolders() {
    try {
      console.log('Initializing Google Drive folder structure...');
      
      // Create main folders
      const mediaFolder = await this.createFolder('WeddingMedia');
      const qrFolder = await this.createFolder('WeddingQRs');
      const thumbnailFolder = await this.createFolder('WeddingThumbnails');
      const logoFolder = await this.createFolder('WeddingLogos');
      
      console.log('Google Drive folders initialized successfully');
      
      return {
        mediaFolder,
        qrFolder,
        thumbnailFolder,
        logoFolder
      };
    } catch (error) {
      console.error('Error initializing folders:', error);
      throw error;
    }
  }
}

module.exports = new GoogleDriveService();
