const express = require('express');
const { buildingParam, entityParam, resolvers } = require('../middlewares/buildingAccessMiddleware');
const router = express.Router();
router.param('id', entityParam(resolvers.vehicle));
router.param('buildingId', buildingParam);
const vehicleController = require('../controllers/vehicleController');
const requireRole = require('../middlewares/roleMiddleware');

router.get('/buildings/:buildingId/vehicles', requireRole('admin'), (req, res, next) => vehicleController.getVehiclesForAdmin(req, res, next));
router.patch('/vehicles/:id/approve', requireRole('admin'), (req, res, next) => vehicleController.approveVehicle(req, res, next));
router.patch('/vehicles/:id/reject', requireRole('admin'), (req, res, next) => vehicleController.rejectVehicle(req, res, next));
router.get('/buildings/:buildingId/visitors', requireRole('admin'), (req, res, next) => vehicleController.getVisitorsForAdmin(req, res, next));

module.exports = router;
