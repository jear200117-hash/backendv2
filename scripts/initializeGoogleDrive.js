require('dotenv').config();
const googleDriveService = require('../services/googleDriveService');

async function initializeGoogleDrive() {
  try {
    console.log('🚀 Initializing Google Drive folders...');
    
    // Initialize folder structure
    const folders = await googleDriveService.initializeFolders();
    
    console.log('✅ Google Drive folders created successfully!');
    console.log('\n📁 Folder Information:');
    console.log(`WeddingMedia: ${folders.mediaFolder.id}`);
    console.log(`WeddingQRs: ${folders.qrFolder.id}`);
    console.log(`WeddingThumbnails: ${folders.thumbnailFolder.id}`);
    console.log(`WeddingLogos: ${folders.logoFolder.id}`);
    
    console.log('\n📋 Add these to your .env file:');
    console.log(`WEDDING_MEDIA_FOLDER_ID=${folders.mediaFolder.id}`);
    console.log(`WEDDING_QR_FOLDER_ID=${folders.qrFolder.id}`);
    console.log(`WEDDING_THUMBNAIL_FOLDER_ID=${folders.thumbnailFolder.id}`);
    console.log(`WEDDING_LOGO_FOLDER_ID=${folders.logoFolder.id}`);
    
    console.log('\n🔗 Folder URLs:');
    console.log(`WeddingMedia: ${folders.mediaFolder.webViewLink}`);
    console.log(`WeddingQRs: ${folders.qrFolder.webViewLink}`);
    console.log(`WeddingThumbnails: ${folders.thumbnailFolder.webViewLink}`);
    console.log(`WeddingLogos: ${folders.logoFolder.webViewLink}`);
    
    console.log('\n✨ Setup complete! You can now start using Google Drive for file storage.');
    
  } catch (error) {
    console.error('❌ Error initializing Google Drive:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('1. Check your Google Drive API credentials');
    console.error('2. Ensure the service account has proper permissions');
    console.error('3. Verify your environment variables are set correctly');
    process.exit(1);
  }
}

// Run initialization
initializeGoogleDrive();
