import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Persistent uploads directory (mounted as a Docker volume in production).
// Resolves to <backend>/uploads.
export const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const id = crypto.randomBytes(12).toString('hex');
    cb(null, `${id}.glb`);
  },
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const okExt = ext === '.glb' || ext === '.gltf';
  const okMime =
    file.mimetype === 'model/gltf-binary' ||
    file.mimetype === 'application/octet-stream' ||
    file.mimetype === 'model/gltf+json';
  if (okExt && okMime) return cb(null, true);
  cb(new Error('僅接受 .glb / .gltf 3D 模型檔'));
}

export const uploadModelMiddleware = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_BYTES },
}).single('model');

// POST /api/v1/admin/models  (authenticateToken + requireAdmin upstream)
export function uploadModel(req, res) {
  if (!req.file) {
    return res.status(400).json({ status: 'error', message: '未收到模型檔案 (欄位名需為 model)' });
  }
  // Served via express.static mounted at /api/v1/models (see server.js)
  const modelPath = `/api/v1/models/${req.file.filename}`;
  return res.status(201).json({ status: 'success', data: { model_path: modelPath } });
}

// Multer errors (size/type) surface as a thrown error -> wrap to a clean 400.
export function handleUploadError(err, req, res, next) {
  if (err) {
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? '模型檔案過大（上限 50MB）' : err.message || '模型上傳失敗';
    return res.status(400).json({ status: 'error', message });
  }
  next();
}
