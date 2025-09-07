const express = require('express');
const QRCode = require('qrcode');
const { auth } = require('../middleware/auth');
const { generateCustomQR } = require('../utils/qrWithLogo');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Serve uploaded logos
router.use('/uploads/logos', express.static(path.join(__dirname, '../uploads/logos')));

// Configure multer for logo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/logos');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'logo-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Generate QR code for any URL (host only)
router.post('/generate', auth, async (req, res) => {
  try {
    const { 
      url, 
      size = 300, 
      margin = 2, 
      centerType = 'none',
      centerOptions = {}
    } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Convert logo URL path to file system path if needed
    if (centerType === 'logo' && centerOptions.logoPath) {
      if (centerOptions.logoPath.startsWith('/uploads/logos/')) {
        centerOptions.logoPath = path.join(__dirname, '..', centerOptions.logoPath);
      }
    }

    // Generate QR code with custom center content
    const qrCodeBuffer = await generateCustomQR(url, {
      width: parseInt(size),
      margin: parseInt(margin),
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    }, centerType, centerOptions);

    // Convert buffer to data URL
    const qrCodeDataUrl = `data:image/png;base64,${qrCodeBuffer.toString('base64')}`;

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
    const { 
      url, 
      size = 300, 
      margin = 2, 
      centerType = 'none',
      centerOptions = {}
    } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Convert logo URL path to file system path if needed
    if (centerType === 'logo' && centerOptions.logoPath) {
      if (centerOptions.logoPath.startsWith('/uploads/logos/')) {
        centerOptions.logoPath = path.join(__dirname, '..', centerOptions.logoPath);
      }
    }

    // Generate QR code with custom center content
    const qrCodeBuffer = await generateCustomQR(url, {
      width: parseInt(size),
      margin: parseInt(margin),
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    }, centerType, centerOptions);

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

// Upload logo for QR codes (host only)
router.post('/upload-logo', auth, upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No logo file provided' });
    }

    const logoUrl = `/uploads/logos/${req.file.filename}`;
    
    res.json({
      message: 'Logo uploaded successfully',
      logoUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size
    });
  } catch (error) {
    console.error('Upload logo error:', error);
    res.status(500).json({ error: 'Failed to upload logo' });
  }
});

// Get available logos (host only)
router.get('/logos', auth, async (req, res) => {
  try {
    const logosDir = path.join(__dirname, '../uploads/logos');
    
    if (!fs.existsSync(logosDir)) {
      return res.json({ logos: [] });
    }

    const files = fs.readdirSync(logosDir);
    const logos = files
      .filter(file => /\.(jpg|jpeg|png|gif|svg)$/i.test(file))
      .map(file => ({
        filename: file,
        url: `/uploads/logos/${file}`,
        name: file.replace(/^logo-\d+-/, '').replace(/\.[^/.]+$/, '')
      }));

    res.json({ logos });
  } catch (error) {
    console.error('Get logos error:', error);
    res.status(500).json({ error: 'Failed to get logos' });
  }
});

// Proxy image route to avoid CORS issues (no auth required for static images)
router.get('/proxy-image', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    // Validate that the URL is from our own server
    if (!url.startsWith('https://backendv2-nasy.onrender.com/uploads/')) {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    // Convert URL to file path
    const urlPath = url.replace('https://backendv2-nasy.onrender.com', '');
    const filePath = path.join(__dirname, '..', urlPath);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Set appropriate headers
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml'
    };
    
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
    
  } catch (error) {
    console.error('Proxy image error:', error);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

// Delete logo (host only)
router.delete('/logos/:filename', auth, async (req, res) => {
  try {
    const { filename } = req.params;
    const logoPath = path.join(__dirname, '../uploads/logos', filename);
    
    if (fs.existsSync(logoPath)) {
      fs.unlinkSync(logoPath);
      res.json({ message: 'Logo deleted successfully' });
    } else {
      res.status(404).json({ error: 'Logo not found' });
    }
  } catch (error) {
    console.error('Delete logo error:', error);
    res.status(500).json({ error: 'Failed to delete logo' });
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
    errorCorrectionLevels: ['L', 'M', 'Q', 'H'],
    centerTypes: ['none', 'logo', 'monogram'],
    monogramOptions: {
      fontSizes: [20, 30, 40, 50, 60],
      fontFamilies: ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Courier New'],
      textColors: ['#000000', '#333333', '#666666', '#999999'],
      backgroundColors: ['#ffffff', '#f5f5f5', '#eeeeee', '#e0e0e0']
    }
  });
});

module.exports = router;
