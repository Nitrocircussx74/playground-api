const express = require('express');
const router = express.Router();
const vendorController = require('../controllers/vendorController');
const requireRole = require('../middlewares/roleMiddleware');

// Admin Vendor Routes
router.get('/buildings/:buildingId/vendors', requireRole('admin'), (req, res, next) => vendorController.getVendorsByBuilding(req, res, next));
router.post('/buildings/:buildingId/vendors', requireRole('admin'), (req, res, next) => vendorController.createVendor(req, res, next));
router.put('/vendors/:id', requireRole('admin'), (req, res, next) => vendorController.updateVendor(req, res, next));
router.delete('/vendors/:id', requireRole('admin'), (req, res, next) => vendorController.deleteVendor(req, res, next));

module.exports = router;
