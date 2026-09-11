const express = require('express');
const router = express.Router();
const facilityController = require('../controllers/facilityController');
const requireRole = require('../middlewares/roleMiddleware');
const requireFeature = require('../middlewares/requireFeatureMiddleware');

router.get('/buildings/:buildingId/facilities', (req, res, next) => facilityController.getFacilitiesForAdmin(req, res, next));
router.post('/buildings/:buildingId/facilities', requireRole('admin'), requireFeature('ENABLE_FACILITY_BOOKING'), (req, res, next) => facilityController.createFacility(req, res, next));
router.patch('/facilities/:id', requireRole('admin'), (req, res, next) => facilityController.updateFacility(req, res, next));
router.delete('/facilities/:id', requireRole('admin'), (req, res, next) => facilityController.deleteFacility(req, res, next));
router.get('/buildings/:buildingId/facility-bookings', (req, res, next) => facilityController.getBookingsForAdmin(req, res, next));
router.patch('/facility-bookings/:id', requireRole('admin'), (req, res, next) => facilityController.cancelBookingByAdmin(req, res, next));

module.exports = router;
