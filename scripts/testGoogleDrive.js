require('dotenv').config();
const googleDriveService = require('../services/googleDriveService');

async function testGoogleDrive() {
  try {
    console.log('🔍 Testing Google Drive connection...');
    
    // Test basic connection by listing files in root
    console.log('📁 Testing folder creation...');
    const testFolder = await googleDriveService.createFolder('test-connection-' + Date.now());
    console.log('✅ Folder created successfully:', testFolder.name);
    
    // Clean up test folder
    console.log('🧹 Cleaning up test folder...');
    await googleDriveService.deleteFile(testFolder.id);
    console.log('✅ Test folder deleted');
    
    console.log('🎉 Google Drive connection is working!');
    
  } catch (error) {
    console.error('❌ Google Drive test failed:');
    console.error('Error:', error.message);
    
    if (error.message.includes('Missing required environment variables')) {
      console.log('\n🔧 Fix: Add missing environment variables to your .env file:');
      console.log('For Service Account:');
      console.log('GOOGLE_DRIVE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com');
      console.log('GOOGLE_DRIVE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nYOUR_KEY\\n-----END PRIVATE KEY-----\\n"');
      console.log('\nFor OAuth2:');
      console.log('GOOGLE_OAUTH_CLIENT_ID=your-client-id');
      console.log('GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret');
      console.log('GOOGLE_OAUTH_REFRESH_TOKEN=your-refresh-token');
    } else if (error.message.includes('invalid_grant')) {
      console.log('\n🔧 Fix: Your refresh token has expired. Generate a new one:');
      console.log('1. Run: node scripts/getGoogleOAuthToken.js');
      console.log('2. Follow the browser prompts');
      console.log('3. Copy the new refresh token to your .env file');
    } else if (error.message.includes('invalid_client')) {
      console.log('\n🔧 Fix: Check your OAuth client credentials');
    } else {
      console.log('\n🔧 General troubleshooting:');
      console.log('1. Verify Google Drive API is enabled in Google Cloud Console');
      console.log('2. Check your service account permissions');
      console.log('3. Ensure your .env file is in the correct location');
    }
  }
}

testGoogleDrive();
