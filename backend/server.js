import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';

// Import controller handlers
import { googleLogin, developerLogin, authenticateToken, requireAdmin } from './src/controllers/authController.js';
import {
  getVehicles,
  createVehicle,
  updateVehicleScale,
  updateVehicleConfig,
  deleteVehicle,
  getCatalog,
  getAdminVehicles,
  deleteCloudVehicle,
  addFromCatalog,
  publishVehicle,
  getLogs,
  createLog,
  deleteLog,
  exportBackup,
  importBackup
} from './src/controllers/tuningController.js';
import { uploadModelMiddleware, uploadModel, handleUploadError, UPLOAD_DIR } from './src/controllers/modelController.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// CORS setup - allow requests from frontend (served via Nginx on port 80/443)
const corsOptions = {
  origin: true, // Allow all origins for flex container requests or override via ENV
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Logging Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health check endpoint for Docker Compose healthcheck (REQ-NFR-010)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Serve admin-uploaded 3D models (under /api/v1 so existing nginx proxy routes it)
app.use('/api/v1/models', express.static(UPLOAD_DIR));

// Authentication Routes
app.post('/api/v1/auth/google', googleLogin);
app.post('/api/v1/auth/developer', developerLogin);

// Admin: upload a GLB model
app.post('/api/v1/admin/models', authenticateToken, requireAdmin, uploadModelMiddleware, handleUploadError, uploadModel);

// Admin: cloud vehicle management list (all templates with owner + clone count)
app.get('/api/v1/admin/vehicles', authenticateToken, requireAdmin, getAdminVehicles);
// Admin: the ONLY endpoint that permanently removes a vehicle from the database
app.delete('/api/v1/admin/vehicles/:id', authenticateToken, requireAdmin, deleteCloudVehicle);

// Published catalog (any authenticated user can browse and clone)
app.get('/api/v1/catalog', authenticateToken, getCatalog);
app.post('/api/v1/vehicles/from-catalog/:templateId', authenticateToken, addFromCatalog);

// Garage Vehicles CRUD Routes
app.get('/api/v1/vehicles', authenticateToken, getVehicles);
app.post('/api/v1/vehicles', authenticateToken, createVehicle);
// Calibration (scale/length/config) and publishing are admin-only
app.put('/api/v1/vehicles/:id/scale', authenticateToken, requireAdmin, updateVehicleScale);
app.put('/api/v1/vehicles/:id/config', authenticateToken, requireAdmin, updateVehicleConfig);
app.put('/api/v1/vehicles/:id/publish', authenticateToken, requireAdmin, publishVehicle);
app.delete('/api/v1/vehicles/:id', authenticateToken, deleteVehicle);

// Tuning Logs CRUD Routes
app.get('/api/v1/logs/:vehicleId', authenticateToken, getLogs);
app.post('/api/v1/logs', authenticateToken, createLog);
app.delete('/api/v1/logs/:id', authenticateToken, deleteLog);

// System Settings backup / restore
app.get('/api/v1/backup/export', authenticateToken, exportBackup);
app.post('/api/v1/backup/import', authenticateToken, importBackup);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    status: 'error',
    message: err.message || '伺服器內部發生未知錯誤'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Tuning Log API backend listening on http://0.0.0.0:${PORT}`);
});
