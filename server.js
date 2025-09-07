const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const config = require('./config');
const authRoutes = require('./routes/auth');
const invitationRoutes = require('./routes/invitations');
const albumRoutes = require('./routes/albums');
const mediaRoutes = require('./routes/media');
const qrRoutes = require('./routes/qr');
const rsvpRoutes = require('./routes/rsvp');

const app = express();
const PORT = config.PORT;

// Behind a proxy/CDN (e.g., Render/Netlify), trust a single proxy hop
// This satisfies express-rate-limit validations and correctly reads X-Forwarded-For
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// Rate limiting - more lenient in development
const limiter = rateLimit({
  windowMs: config.NODE_ENV === 'development' ? 60000 : config.RATE_LIMIT_WINDOW_MS, // 1 minute in dev, 15 minutes in prod
  max: config.NODE_ENV === 'development' ? 1000 : config.RATE_LIMIT_MAX_REQUESTS, // 1000 requests in dev, 100 in prod
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// CORS configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  config.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    try {
      const hostname = new URL(origin).hostname;
      const isAllowed =
        allowedOrigins.includes(origin) ||
        /\.netlify\.app$/.test(hostname) ||
        /onrender\.com$/.test(hostname);
      if (isAllowed) return callback(null, true);
    } catch (e) {
      // If URL parsing fails, fall through and reject
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));


// Handle preflight requests
app.options('*', cors());

// Add CORS debugging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - Origin: ${req.headers.origin}`);
  next();
});

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files for uploaded logos with CORS headers
app.use('/uploads', (req, res, next) => {
  // Set CORS headers for static files
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
}, express.static('uploads'));

// Note: All media files (images/videos) and QR codes are now stored in Cloudinary
// Logo uploads are stored locally for QR code generation

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/invitations', invitationRoutes);
app.use('/api/albums', albumRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/rsvp', rsvpRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Wedding Website API is running' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: config.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Database connection
mongoose.connect(config.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

module.exports = app;
