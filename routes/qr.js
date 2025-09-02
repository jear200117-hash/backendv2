const express = require('express');
const QRCode = require('qrcode');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Generate QR code for any URL (host only)
router.post('/generate', auth, async (req, res) => {
  try {
    const { url, size = 300, margin = 2 } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(url, {
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: parseInt(size),
      margin: parseInt(margin)
    });

    res.json({
      qrCode: qrCodeDataUrl,
      url
    });
  } catch (error) {
    console.error('Generate QR code error:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Generate QR code as image file (host only)
router.post('/generate-file', auth, async (req, res) => {
  try {
    const { url, size = 300, margin = 2 } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Generate QR code as buffer
    const qrCodeBuffer = await QRCode.toBuffer(url, {
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: parseInt(size),
      margin: parseInt(margin),
      type: 'png'
    });

    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': 'attachment; filename=qr-code.png'
    });

    res.send(qrCodeBuffer);
  } catch (error) {
    console.error('Generate QR file error:', error);
    res.status(500).json({ error: 'Failed to generate QR code file' });
  }
});

// Batch generate QR codes for multiple URLs (host only)
router.post('/batch-generate', auth, async (req, res) => {
  try {
    const { urls, size = 300, margin = 2 } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'URLs array is required' });
    }

    if (urls.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 URLs allowed per batch' });
    }

    const qrCodes = [];

    for (const url of urls) {
      try {
        const qrCodeDataUrl = await QRCode.toDataURL(url, {
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          },
          width: parseInt(size),
          margin: parseInt(margin)
        });

        qrCodes.push({
          url,
          qrCode: qrCodeDataUrl,
          success: true
        });
      } catch (qrError) {
        qrCodes.push({
          url,
          error: 'Failed to generate QR code',
          success: false
        });
      }
    }

    res.json({
      message: `Generated ${qrCodes.filter(qr => qr.success).length} QR codes`,
      qrCodes
    });
  } catch (error) {
    console.error('Batch generate QR codes error:', error);
    res.status(500).json({ error: 'Failed to generate QR codes' });
  }
});

// Get QR code configuration options
router.get('/options', (req, res) => {
  res.json({
    sizes: [200, 300, 400, 500, 600],
    margins: [1, 2, 3, 4],
    colors: {
      dark: ['#000000', '#1a1a1a', '#333333', '#555555'],
      light: ['#ffffff', '#f5f5f5', '#eeeeee', '#e0e0e0']
    },
    formats: ['png', 'svg', 'pdf'],
    errorCorrectionLevels: ['L', 'M', 'Q', 'H']
  });
});

module.exports = router;
