const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const MAX_MB = parseInt(process.env.MAX_UPLOAD_MB || '50', 10);

const ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const ALLOWED_MEDIA = [...ALLOWED_IMAGE, 'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/ogg', 'application/pdf'];

function makeStorage(subfolder) {
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads', subfolder)),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const unique = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
      cb(null, unique + ext);
    }
  });
}

function fileFilter(allowedList) {
  return (req, file, cb) => {
    if (allowedList.includes(file.mimetype)) return cb(null, true);
    cb(new Error('نوع الملف غير مدعوم: ' + file.mimetype));
  };
}

const uploadAvatar = multer({
  storage: makeStorage('avatars'),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: fileFilter(ALLOWED_IMAGE)
});

const uploadHeader = multer({
  storage: makeStorage('headers'),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: fileFilter(ALLOWED_IMAGE)
});

const uploadPostMedia = multer({
  storage: makeStorage('posts'),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: fileFilter(ALLOWED_MEDIA)
});

const uploadEmoji = multer({
  storage: makeStorage('emojis'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilter(ALLOWED_IMAGE)
});

const uploadChatMedia = multer({
  storage: makeStorage('posts'),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: fileFilter(ALLOWED_MEDIA)
});

module.exports = { uploadAvatar, uploadHeader, uploadPostMedia, uploadEmoji, uploadChatMedia };
