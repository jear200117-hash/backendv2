const QRCode = require('qrcode');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

/**
 * Generate QR code with logo overlay in the center
 * @param {string} url - URL to encode in QR code
 * @param {Object} options - QR code options
 * @param {string} logoPath - Path to logo image (optional)
 * @param {Object} logoOptions - Logo overlay options
 * @returns {Promise<Buffer>} - QR code image buffer
 */
async function generateQRWithLogo(url, options = {}, logoPath = null, logoOptions = {}) {
  const {
    width = 300,
    margin = 2,
    color = { dark: '#000000', light: '#FFFFFF' },
    errorCorrectionLevel = 'M'
  } = options;

  const {
    logoSize = Math.floor(width * 0.2), // 20% of QR code size
    logoMargin = Math.floor(width * 0.05), // 5% margin around logo
    logoBackground = '#FFFFFF',
    logoBorderRadius = 8
  } = logoOptions;

  try {
    // Generate QR code as buffer
    const qrCodeBuffer = await QRCode.toBuffer(url, {
      color,
      width,
      margin,
      errorCorrectionLevel,
      type: 'png'
    });

    // If no logo provided, return plain QR code
    if (!logoPath) {
      return qrCodeBuffer;
    }

    // Resolve logo buffer: support local path and remote URL (e.g., Google Drive)
    let logoSourceBuffer;
    try {
      // Remote URL (http/https)
      if (/^https?:\/\//i.test(logoPath)) {
        const response = await fetch(logoPath);
        if (!response.ok) {
          throw new Error(`Failed to fetch logo from URL: ${logoPath} (status ${response.status})`);
        }
        const arrayBuf = await response.arrayBuffer();
        logoSourceBuffer = Buffer.from(arrayBuf);
      } else {
        // Convert URL path to file system path if needed
        let actualLogoPath = logoPath;
        if (logoPath.startsWith('/uploads/logos/')) {
          actualLogoPath = path.join(__dirname, '..', logoPath);
        }
        if (!fs.existsSync(actualLogoPath)) {
          console.error('Logo file not found:', actualLogoPath);
          throw new Error(`Logo file not found: ${logoPath}`);
        }
        logoSourceBuffer = fs.readFileSync(actualLogoPath);
      }
    } catch (e) {
      console.error('Error loading logo source:', e);
      throw e;
    }

    // Load and process logo
    const logoBuffer = await sharp(logoSourceBuffer)
      .resize(logoSize, logoSize, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toBuffer();

    // Create logo with background and border radius
    const logoWithBackground = await sharp({
      create: {
        width: logoSize + (logoMargin * 2),
        height: logoSize + (logoMargin * 2),
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .composite([{
        input: logoBuffer,
        top: logoMargin,
        left: logoMargin
      }])
      .png()
      .toBuffer();

    // Calculate position for logo (center of QR code)
    const qrSize = width;
    const logoWidth = logoSize + (logoMargin * 2);
    const logoHeight = logoSize + (logoMargin * 2);
    
    const logoX = Math.floor((qrSize - logoWidth) / 2);
    const logoY = Math.floor((qrSize - logoHeight) / 2);

    // Overlay logo on QR code
    const finalQRCode = await sharp(qrCodeBuffer)
      .composite([{
        input: logoWithBackground,
        top: logoY,
        left: logoX
      }])
      .png()
      .toBuffer();

    return finalQRCode;
  } catch (error) {
    console.error('Error generating QR code with logo:', error);
    throw error;
  }
}

/**
 * Generate QR code with text monogram in the center
 * @param {string} url - URL to encode in QR code
 * @param {Object} options - QR code options
 * @param {string} monogram - Text to display in center
 * @param {Object} monogramOptions - Monogram styling options
 * @returns {Promise<Buffer>} - QR code image buffer
 */
async function generateQRWithMonogram(url, options = {}, monogram = 'M&E', monogramOptions = {}) {
  const {
    width = 300,
    margin = 2,
    color = { dark: '#000000', light: '#FFFFFF' },
    errorCorrectionLevel = 'M'
  } = options;

  const {
    fontSize = Math.floor(width * 0.15), // 15% of QR code size
    fontFamily = 'Arial, sans-serif',
    textColor = '#000000',
    backgroundColor = '#FFFFFF',
    borderRadius = 8,
    padding = Math.floor(width * 0.05) // 5% padding
  } = monogramOptions;

  try {
    // Generate QR code as buffer
    const qrCodeBuffer = await QRCode.toBuffer(url, {
      color,
      width,
      margin,
      errorCorrectionLevel,
      type: 'png'
    });

    // Calculate monogram container size
    const containerSize = fontSize + (padding * 2);
    const containerX = Math.floor((width - containerSize) / 2);
    const containerY = Math.floor((width - containerSize) / 2);

    // Create monogram text SVG with proper XML encoding
    const svgText = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${containerSize}" height="${containerSize}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${containerSize}" height="${containerSize}" 
        fill="${backgroundColor}" 
        rx="${borderRadius}" 
        ry="${borderRadius}"/>
  <text x="50%" y="50%" 
        text-anchor="middle" 
        dominant-baseline="middle" 
        font-family="${fontFamily}" 
        font-size="${fontSize}" 
        font-weight="bold" 
        fill="${textColor}">
    ${monogram.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
  </text>
</svg>`;

    // Convert SVG to buffer
    const monogramBuffer = await sharp(Buffer.from(svgText))
      .png()
      .toBuffer();

    // Overlay monogram on QR code
    const finalQRCode = await sharp(qrCodeBuffer)
      .composite([{
        input: monogramBuffer,
        top: containerY,
        left: containerX
      }])
      .png()
      .toBuffer();

    return finalQRCode;
  } catch (error) {
    console.error('Error generating QR code with monogram:', error);
    throw error;
  }
}

/**
 * Generate QR code with custom center content
 * @param {string} url - URL to encode in QR code
 * @param {Object} options - QR code options
 * @param {string} centerType - Type of center content: 'logo', 'monogram', or 'none'
 * @param {Object} centerOptions - Center content options
 * @returns {Promise<Buffer>} - QR code image buffer
 */
async function generateCustomQR(url, options = {}, centerType = 'none', centerOptions = {}) {
  switch (centerType) {
    case 'logo':
      return generateQRWithLogo(url, options, centerOptions.logoPath, centerOptions);
    case 'monogram':
      return generateQRWithMonogram(url, options, centerOptions.monogram, centerOptions);
    case 'none':
    default:
      return QRCode.toBuffer(url, {
        color: options.color || { dark: '#000000', light: '#FFFFFF' },
        width: options.width || 300,
        margin: options.margin || 2,
        errorCorrectionLevel: options.errorCorrectionLevel || 'M',
        type: 'png'
      });
  }
}

module.exports = {
  generateQRWithLogo,
  generateQRWithMonogram,
  generateCustomQR
};
