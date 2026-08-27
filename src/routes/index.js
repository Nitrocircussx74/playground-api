const express = require('express');
const router = express.Router();
const authenticateJWT = require('../middlewares/authMiddleware');

const authRoutes = require('./authRoutes');
const apiRoutes = require('./apiRoutes');
const roomRoutes = require('./roomRoutes');
const meterRoutes = require('./meterRoutes');
const invoiceRoutes = require('./invoiceRoutes');
const uploadRoutes = require('./uploadRoutes');
const maintenanceRoutes = require('./maintenanceRoutes');
const announcementRoutes = require('./announcementRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const featureRoutes = require('./featureRoutes');
const liffRoutes = require('./liffRoutes');
const buildingRoutes = require('./buildingRoutes');
const adminRoutes = require('./adminRoutes');
const auditLogRoutes = require('./auditLogRoutes');
const parcelRoutes = require('./parcelRoutes');
const meterImportRoutes = require('./meterImportRoutes');
const leaseRoutes = require('./leaseRoutes');
const moveOutRoutes = require('./moveOutRoutes');
const liffController = require('../controllers/liffController');

// Root Health Check Route
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Dormitory Management API is running smoothly!',
    version: '1.0.0'
  });
});

// Public LIFF App, Feature Flags & Auth Routes (Mounted BEFORE protected /api prefix)
router.use('/auth', authRoutes);
router.use('/api/v1/liff', liffRoutes);
router.get('/api/settings', (req, res, next) => liffController.getSettingsForTenant(req, res, next));

// Feature Toggles (Public GET for initial app load, Protected PUT for admin)
router.get('/api/features', (req, res, next) => featureRoutes.handle(req, res, next));
router.use('/api/v1/features', featureRoutes);

// Protected RESTful Modules (Plural & Kebab-case API Endpoints)
router.use('/api', apiRoutes);
router.use('/api/v1/buildings', authenticateJWT, buildingRoutes);
router.use('/api/admin/buildings', authenticateJWT, buildingRoutes);
router.use('/api/v1/rooms', authenticateJWT, roomRoutes);
router.use('/api/v1/meter-records', authenticateJWT, meterRoutes);
router.use('/api/v1/invoices', authenticateJWT, invoiceRoutes);
router.use('/api/admin/invoices', authenticateJWT, invoiceRoutes);
router.use('/api/v1/uploads', authenticateJWT, uploadRoutes);
router.use('/api/v1/maintenance-requests', authenticateJWT, maintenanceRoutes);
router.use('/api/admin', authenticateJWT, maintenanceRoutes);
router.use('/api/liff/maintenance', maintenanceRoutes);
router.use('/api/v1/announcements', authenticateJWT, announcementRoutes);
router.use('/api/admin/broadcasts', authenticateJWT, announcementRoutes);
router.use('/api/admin', authenticateJWT, adminRoutes);
router.use('/api/admin', authenticateJWT, parcelRoutes);
router.use('/api/admin', authenticateJWT, meterImportRoutes);
router.use('/api/admin', authenticateJWT, leaseRoutes);
router.use('/api/admin', authenticateJWT, moveOutRoutes);
router.use('/api/v1', authenticateJWT, leaseRoutes);
router.use('/api/v1', authenticateJWT, moveOutRoutes);
router.use('/api/v1', authenticateJWT, parcelRoutes);
router.use('/api/admin/audit-logs', authenticateJWT, auditLogRoutes);
router.use('/api/admin/dashboard', authenticateJWT, dashboardRoutes);
router.use('/api/v1/dashboard', authenticateJWT, dashboardRoutes);

module.exports = router;
