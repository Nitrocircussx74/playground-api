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
const liffRoutes = require('./liffRoutes');

// Root Health Check Route
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Dormitory Management API is running smoothly!',
    version: '1.0.0'
  });
});

// Public LIFF App & Auth Routes (Mounted BEFORE protected /api prefix)
router.use('/auth', authRoutes);
router.use('/api/v1/liff', liffRoutes);

// Protected RESTful Modules (Plural & Kebab-case API Endpoints)
router.use('/api', apiRoutes);
router.use('/api/v1/rooms', authenticateJWT, roomRoutes);
router.use('/api/v1/meter-records', authenticateJWT, meterRoutes);
router.use('/api/v1/invoices', authenticateJWT, invoiceRoutes);
router.use('/api/v1/uploads', authenticateJWT, uploadRoutes);
router.use('/api/v1/maintenance-requests', authenticateJWT, maintenanceRoutes);
router.use('/api/v1/announcements', authenticateJWT, announcementRoutes);

module.exports = router;
