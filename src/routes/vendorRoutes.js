const express = require('express');
const { buildingParam, entityParam, resolvers } = require('../middlewares/buildingAccessMiddleware');
const router = express.Router();
router.param('id', entityParam(resolvers.vendor));
router.param('buildingId', buildingParam);
const vendorController = require('../controllers/vendorController');
const requireRole = require('../middlewares/roleMiddleware');

// Admin Vendor Routes
router.get('/buildings/:buildingId/vendors', requireRole('admin'), (req, res, next) => vendorController.getVendorsByBuilding(req, res, next));
router.post('/buildings/:buildingId/vendors', requireRole('admin'), (req, res, next) => vendorController.createVendor(req, res, next));
router.put('/vendors/:id', requireRole('admin'), (req, res, next) => vendorController.updateVendor(req, res, next));
router.delete('/vendors/:id', requireRole('admin'), (req, res, next) => vendorController.deleteVendor(req, res, next));

module.exports = router;
