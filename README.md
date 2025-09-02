# Wedding QR System - Backend API

A Node.js/Express backend API for managing wedding invitations, QR codes, photo albums, and RSVP responses.

## Features

- **Authentication & Authorization**: JWT-based auth with role management
- **Invitation Management**: Create personalized wedding invitations with QR codes
- **RSVP System**: Track guest responses with detailed information
- **Photo Albums**: Guest and host photo/video sharing with approval system
- **Media Upload**: Cloudinary integration for image/video storage
- **QR Code Generation**: Custom QR codes for invitations
- **Admin Dashboard**: Host management interface

## Quick Start

### Prerequisites

- Node.js 16+ and npm
- MongoDB database
- Cloudinary account (for media uploads)

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Environment setup:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   # Database
   MONGODB_URI=mongodb://localhost:27017/wedding-qr-system
   
   # JWT Security
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   
   # Cloudinary (Required)
   CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
   CLOUDINARY_API_KEY=your-cloudinary-api-key
   CLOUDINARY_API_SECRET=your-cloudinary-api-secret
   
   # Frontend URL
   FRONTEND_URL=http://localhost:3000
   ```

3. **Start the server:**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

4. **Initialize default host user:**
   ```bash
   curl -X POST http://localhost:5000/api/auth/init
   ```
   
   Default credentials:
   - Email: `host@wedding.com`
   - Password: `changeThisPassword123!`

## API Documentation

### Authentication

#### Initialize System
```http
POST /api/auth/init
```
Creates default host user (run once on first setup).

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "host@wedding.com",
  "password": "changeThisPassword123!"
}
```

#### Get Profile
```http
GET /api/auth/profile
Authorization: Bearer {token}
```

### Invitations

#### Create Invitation
```http
POST /api/invitations
Authorization: Bearer {token}
Content-Type: application/json

{
  "guestName": "John Doe",
  "guestRole": "General Guest",
  "customMessage": "We cordially invite you...",
  "invitationType": "personalized"
}
```

#### Get Invitation by QR Code (Public)
```http
GET /api/invitations/qr/{qrCode}
```

#### Get All Invitations
```http
GET /api/invitations?page=1&limit=20&status=active&role=all
Authorization: Bearer {token}
```

### RSVP

#### Submit RSVP (Public)
```http
POST /api/rsvp/submit/{qrCode}
Content-Type: application/json

{
  "status": "attending",
  "attendeeCount": 2,
  "guestNames": ["John Doe", "Jane Doe"],
  "email": "john@example.com",
  "phone": "+1234567890"
}
```

#### Get RSVP Status (Public)
```http
GET /api/rsvp/status/{qrCode}
```

#### Get All RSVP Responses
```http
GET /api/rsvp/all?status=attending&role=all&search=john
Authorization: Bearer {token}
```

### Albums

#### Create Album
```http
POST /api/albums
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "Wedding Reception",
  "description": "Photos from our special day",
  "isPublic": true,
  "isFeatured": false
}
```

#### Create Guest Album (Public)
```http
POST /api/albums/guest
Content-Type: application/json

{
  "name": "Our Wedding Memories",
  "description": "Photos from the celebration",
  "guestEmail": "guest@example.com"
}
```

#### Get Albums (Public)
```http
GET /api/albums?page=1&limit=20&featured=false
```

#### Get Album by ID (Public)
```http
GET /api/albums/{id}?page=1&limit=20
```

### Media

#### Upload Media to Album (Public)
```http
POST /api/media/upload/{albumId}
Content-Type: multipart/form-data

Form fields:
- media: file(s) to upload (max 10 files, 50MB each)
- uploadedBy: string (guest name/email)
```

#### Upload Media as Host
```http
POST /api/media/host/upload/{albumId}
Authorization: Bearer {token}
Content-Type: multipart/form-data

Form fields:
- media: file(s) to upload
- uploadedBy: string (optional)
```

#### Get Media
```http
GET /api/media?page=1&limit=20&album={albumId}&type=image&approved=true
Authorization: Bearer {token}
```

### QR Codes

#### Generate QR Code
```http
POST /api/qr/generate
Content-Type: application/json

{
  "url": "https://example.com/invitation/abc123",
  "size": 300,
  "margin": 2
}
```

#### Generate QR Code File
```http
POST /api/qr/generate-file
Content-Type: application/json

{
  "url": "https://example.com/invitation/abc123",
  "size": 500,
  "margin": 4,
  "format": "png"
}
```

## Database Models

### User
- Email, password, role (host/admin)
- Profile information and preferences
- Security features (login attempts, account locking)

### Invitation
- Guest information and role
- Custom message and QR code
- RSVP tracking and responses
- Opening tracking

### Album
- Name, description, visibility settings
- Media count and approval status
- Guest/host creation support

### Media
- File information and URLs
- Album association
- Approval status and metadata
- Upload tracking

## Security Features

- **JWT Authentication**: Secure token-based auth
- **Rate Limiting**: Prevent abuse and spam
- **Input Validation**: Comprehensive request validation
- **CORS Protection**: Configurable cross-origin settings
- **Helmet Security**: Standard security headers
- **Password Security**: bcrypt hashing with high salt rounds
- **Account Locking**: Temporary lockout after failed attempts

## File Upload

- **Cloudinary Integration**: All media stored in cloud
- **File Type Validation**: Images and videos only
- **Size Limits**: 50MB per file, 10 files per upload
- **Automatic Thumbnails**: Generated for images
- **Guest Uploads**: Public album uploads without auth

## Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `PORT` | No | Server port | 5000 |
| `NODE_ENV` | No | Environment mode | development |
| `MONGODB_URI` | Yes | MongoDB connection string | - |
| `JWT_SECRET` | Yes | JWT signing secret | - |
| `JWT_EXPIRES_IN` | No | Token expiration | 7d |
| `FRONTEND_URL` | Yes | Frontend application URL | - |
| `CLOUDINARY_CLOUD_NAME` | Yes | Cloudinary cloud name | - |
| `CLOUDINARY_API_KEY` | Yes | Cloudinary API key | - |
| `CLOUDINARY_API_SECRET` | Yes | Cloudinary API secret | - |
| `DEFAULT_HOST_EMAIL` | No | Default host email | host@wedding.com |
| `DEFAULT_HOST_PASSWORD` | No | Default host password | changeThisPassword123! |

## Development

### Scripts
```bash
npm run dev      # Start with nodemon (auto-restart)
npm start        # Start production server
npm test         # Run tests (not implemented yet)
```

### Project Structure
```
backend/
├── config/
│   └── cloudinary.js      # Cloudinary configuration
├── middleware/
│   ├── auth.js            # Authentication middleware
│   └── upload.js          # File upload middleware
├── models/
│   ├── User.js            # User model
│   ├── Invitation.js      # Invitation model
│   ├── Album.js           # Album model
│   └── Media.js           # Media model
├── routes/
│   ├── auth.js            # Authentication routes
│   ├── invitations.js     # Invitation management
│   ├── rsvp.js            # RSVP handling
│   ├── albums.js          # Album management
│   ├── media.js           # Media upload/management
│   └── qr.js              # QR code generation
├── server.js              # Main application file
├── config.js              # Configuration management
└── package.json           # Dependencies and scripts
```

## Production Deployment

1. **Set production environment variables:**
   ```bash
   NODE_ENV=production
   JWT_SECRET=your-strong-production-secret
   MONGODB_URI=your-production-mongodb-uri
   CLOUDINARY_CLOUD_NAME=your-production-cloudinary
   # ... other production values
   ```

2. **Security checklist:**
   - [ ] Change default JWT secret
   - [ ] Use HTTPS in production
   - [ ] Set proper CORS origins
   - [ ] Configure rate limiting
   - [ ] Set up database backups
   - [ ] Monitor logs and errors

3. **Recommended hosting:**
   - **API**: Heroku, Railway, or DigitalOcean App Platform
   - **Database**: MongoDB Atlas
   - **Media**: Cloudinary (already integrated)

## Troubleshooting

### Common Issues

**"Cloudinary configuration missing"**
- Ensure all Cloudinary environment variables are set
- Check .env file is loaded correctly

**"JWT secret error in production"**
- Never use default JWT secret in production
- Set JWT_SECRET environment variable

**"Database connection failed"**
- Check MongoDB URI format
- Ensure database server is running
- Verify network connectivity

**"Media upload fails"**
- Check Cloudinary credentials
- Verify file size limits
- Ensure proper Content-Type header

## License

This project is part of a wedding invitation system. See main project for license information.


