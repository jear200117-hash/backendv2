require('dotenv').config();
const { drive } = require('../config/googleDrive');

async function shareFolderWithUser(folderId, userEmail, role = 'reader') {
  if (!folderId) throw new Error('Missing folderId');
  if (!userEmail) throw new Error('Missing userEmail');

  // Create a user permission so the folder shows up under "Shared with me"
  await drive.permissions.create({
    fileId: folderId,
    sendNotificationEmail: true,
    requestBody: {
      type: 'user',
      role, // 'reader' or 'writer'
      emailAddress: userEmail
    }
  });
}

async function main() {
  const userEmail = process.argv[2] || process.env.SHARE_TARGET_EMAIL;
  if (!userEmail) {
    console.error('Usage: node scripts/shareGoogleDriveFolders.js you@example.com');
    process.exit(1);
  }

  const folderIds = [
    process.env.WEDDING_MEDIA_FOLDER_ID,
    process.env.WEDDING_QR_FOLDER_ID,
    process.env.WEDDING_THUMBNAIL_FOLDER_ID,
    process.env.WEDDING_LOGO_FOLDER_ID
  ].filter(Boolean);

  if (folderIds.length === 0) {
    console.error('No folder IDs found in env. Fill them in and retry.');
    process.exit(1);
  }

  console.log(`Sharing ${folderIds.length} folders with ${userEmail}...`);
  for (const id of folderIds) {
    try {
      await shareFolderWithUser(id, userEmail, 'reader');
      console.log(`Shared folder ${id} with ${userEmail}`);
    } catch (err) {
      console.error(`Failed to share folder ${id}:`, err.message);
    }
  }
  console.log('Done. Check Google Drive → Shared with me.');
}

main();





