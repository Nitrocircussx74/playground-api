const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const apiRoutes = require('./apiRoutes');

// Root Health Check Route
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Node.js Express Authentication API is running smoothly!',
    version: '1.0.0'
  });
});

// รวม Route โมดูลต่างๆ
router.use('/auth', authRoutes);
router.use('/api', apiRoutes);

module.exports = router;
