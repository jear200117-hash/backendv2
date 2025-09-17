const { google } = require('googleapis');
const { JWT, OAuth2Client } = require('google-auth-library');

// Build auth client: prefer OAuth user if env is present, else service account
function buildAuthClient() {
  const scopes = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file'
  ];

  if (process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    const oauth2 = new OAuth2Client(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      'http://localhost' // redirect not used here; token is pre-obtained
    );
    oauth2.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
    return oauth2;
  }

  // Fallback: service account
  return new JWT({
    email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
    key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes
  });
}

const auth = buildAuthClient();

// Initialize Google Drive API
const drive = google.drive({ version: 'v3', auth });

// Folder IDs configuration (may be undefined before initialization)
const FOLDERS = {
  WEDDING_MEDIA: process.env.WEDDING_MEDIA_FOLDER_ID,
  WEDDING_QR: process.env.WEDDING_QR_FOLDER_ID,
  WEDDING_THUMBNAIL: process.env.WEDDING_THUMBNAIL_FOLDER_ID,
  WEDDING_LOGO: process.env.WEDDING_LOGO_FOLDER_ID
};

// Validate credentials only; folder IDs are optional for initialization
const validateCredentials = () => {
  const required = [
    'GOOGLE_DRIVE_CLIENT_EMAIL',
    'GOOGLE_DRIVE_PRIVATE_KEY'
  ];

  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};

// Initialize and validate
try {
  validateCredentials();
  const missingFolders = Object.entries(FOLDERS)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missingFolders.length) {
    console.warn(`Google Drive folder IDs missing (ok for first-time setup): ${missingFolders.join(', ')}`);
  } else {
    console.log('Google Drive configuration validated successfully');
  }
} catch (error) {
  console.error('Google Drive configuration error:', error.message);
  throw error;
}

module.exports = {
  drive,
  auth,
  FOLDERS
};
