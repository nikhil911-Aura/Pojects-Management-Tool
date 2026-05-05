import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import config from './config/index.js';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'asana_clone',
    allowed_formats: ['jpg', 'png', 'pdf', 'docx', 'xlsx', 'txt'],
    resource_type: 'auto'
  }
});

const avatarStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'asana_clone/avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    resource_type: 'image',
    transformation: [{ width: 600, height: 600, crop: 'fill', gravity: 'face' }]
  }
});

const upload = multer({ storage });
const uploadAvatar = multer({ storage: avatarStorage, limits: { fileSize: 2 * 1024 * 1024 } });

// Derive Cloudinary resource_type from MIME type
function getResourceType(mimeType = '') {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'raw';
}

// Generate a signed URL that expires in `seconds` (default 24 hours)
function generateSignedUrl(publicId, mimeType, seconds = 86400) {
  if (!publicId) return null;
  return cloudinary.url(publicId, {
    resource_type: getResourceType(mimeType),
    sign_url: true,
    expires_at: Math.floor(Date.now() / 1000) + seconds,
    secure: true,
  });
}

// Transform an attachment object — replace url with a fresh signed URL
function signAttachment(attachment) {
  if (!attachment) return attachment;
  const signedUrl = generateSignedUrl(attachment.publicId, attachment.mimeType);
  return { ...attachment, url: signedUrl || attachment.url };
}

export { cloudinary, upload, uploadAvatar, generateSignedUrl, signAttachment };
