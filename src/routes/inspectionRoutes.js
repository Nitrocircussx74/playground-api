const express = require('express');
const router = express.Router();
const inspectionController = require('../controllers/inspectionController');
const requireRole = require('../middlewares/roleMiddleware');

// Admin Inspection Routes
router.post('/inspections', requireRole('admin'), (req, res, next) => inspectionController.createInspection(req, res, next));
router.get('/leases/:leaseId/inspections', requireRole('admin'), (req, res, next) => inspectionController.getByLease(req, res, next));
router.get('/buildings/:buildingId/inspections', requireRole('admin'), (req, res, next) => inspectionController.getByBuilding(req, res, next));
router.delete('/inspections/:id', requireRole('admin'), (req, res, next) => inspectionController.deleteInspection(req, res, next));

module.exports = router;
