const express = require('express');
const router = express.Router();
const authenticateJWT = require('../middlewares/authMiddleware');

const authRoutes = require('./authRoutes');
const apiRoutes = require('./apiRoutes');
const roomRoutes = require('./roomRoutes');
const meterRoutes = require('./meterRoutes');
const invoiceRoutes = require('./invoiceRoutes');

// Root Health Check Route
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Dormitory Management API is running smoothly!',
    version: '1.0.0'
  });
});

// Auth Routes
router.use('/auth', authRoutes);
router.use('/api', apiRoutes);

// Protected RESTful Modules (Plural & Kebab-case API Endpoints)
router.use('/api/v1/rooms', authenticateJWT, roomRoutes);
router.use('/api/v1/meter-records', authenticateJWT, meterRoutes);
router.use('/api/v1/invoices', authenticateJWT, invoiceRoutes);

module.exports = router;
