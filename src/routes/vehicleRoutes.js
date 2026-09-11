const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');
const requireRole = require('../middlewares/roleMiddleware');

router.get('/buildings/:buildingId/vehicles', (req, res, next) => vehicleController.getVehiclesForAdmin(req, res, next));
router.patch('/vehicles/:id/approve', requireRole('admin'), (req, res, next) => vehicleController.approveVehicle(req, res, next));
router.patch('/vehicles/:id/reject', requireRole('admin'), (req, res, next) => vehicleController.rejectVehicle(req, res, next));
router.get('/buildings/:buildingId/visitors', (req, res, next) => vehicleController.getVisitorsForAdmin(req, res, next));

module.exports = router;
