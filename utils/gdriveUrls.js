function buildDriveViewUrl(fileId, width = 0) {
  if (!fileId) return null;
  // lh3 CDN supports sizing like =w800. If width is 0, omit sizing.
  return width > 0
    ? `https://lh3.googleusercontent.com/d/${fileId}=w${width}`
    : `https://lh3.googleusercontent.com/d/${fileId}`;
}

function buildDriveDownloadUrl(fileId) {
  if (!fileId) return null;
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

module.exports = { buildDriveViewUrl, buildDriveDownloadUrl };





