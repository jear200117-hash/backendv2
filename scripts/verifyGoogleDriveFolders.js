require('dotenv').config();
const { drive } = require('../config/googleDrive');

async function ensurePublicReader(fileId) {
  const res = await drive.permissions.list({ fileId, supportsAllDrives: true });
  const hasAnyone = (res.data.permissions || []).some(p => p.type === 'anyone' && p.role === 'reader');
}

async function getInfo(fileId) {
  const { data } = await drive.files.get({
    fileId,
    fields: 'id, name, webViewLink, webContentLink, mimeType, parents',
    supportsAllDrives: true
  });
  return data;
}

async function createProbeFile(folderId) {
  const content = Buffer.from(`probe ${new Date().toISOString()}`);
  const { Readable } = require('stream');
  const { data } = await drive.files.create({
    requestBody: { name: `probe-${Date.now()}.txt`, parents: [folderId] },
    media: { mimeType: 'text/plain', body: Readable.from(content) },
    supportsAllDrives: true
  });
  await ensurePublicReader(data.id);
  return data;
}

async function verifyFolder(folderId, label) {
  if (!folderId) {
    console.log(`${label}: missing env id`);
    return;
  }
  try {
    await ensurePublicReader(folderId);
    const info = await getInfo(folderId);
    console.log(`${label}: ${info.name} (${info.id})`);
    console.log(`  webViewLink: ${info.webViewLink}`);
    // create a probe file to double-check access
    const probe = await createProbeFile(folderId);
    const probeInfo = await getInfo(probe.id);
    console.log(`  probe file: ${probeInfo.name} → ${probeInfo.webViewLink}`);
  } catch (e) {
    console.error(`${label}: ERROR`, e.message);
  }
}

async function main() {
  const folders = [
    { id: process.env.WEDDING_MEDIA_FOLDER_ID, label: 'Media' },
    { id: process.env.WEDDING_QR_FOLDER_ID, label: 'QRs' },
    { id: process.env.WEDDING_THUMBNAIL_FOLDER_ID, label: 'Thumbnails' },
    { id: process.env.WEDDING_LOGO_FOLDER_ID, label: 'Logos' }
  ];
  for (const f of folders) {
    await verifyFolder(f.id, f.label);
  }
}

main();


