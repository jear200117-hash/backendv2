require('dotenv').config();
const http = require('http');
const { google } = require('googleapis');

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const redirectUri = 'http://localhost:51789/oauth2callback';

if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in .env');
  process.exit(1);
}

async function main() {
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const scopes = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file'
  ];

  const authorizeUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes
  });

  const server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/oauth2callback')) {
      const url = new URL(req.url, redirectUri);
      const code = url.searchParams.get('code');
      try {
        const { tokens } = await oauth2.getToken(code);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Success. You can close this window.');
        console.log('\nCopy these to your .env:');
        if (tokens.refresh_token) {
          console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
        } else {
          console.warn('No refresh_token returned. Ensure you used prompt=consent and access_type=offline, and no prior consent exists.');
        }
        console.log(`Access token (debug): ${tokens.access_token ? 'received' : 'n/a'}`);
        server.close();
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error exchanging code. Check console.');
        console.error('Token exchange error:', e.message);
        server.close();
      }
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Waiting for OAuth callback...');
    }
  });

  server.listen(51789, async () => {
    console.log('Copy and open this URL in your browser to authorize:');
    console.log(authorizeUrl);
  });
}

main();


