const express = require('express');
const { buildingParam, entityGuard, resolvers } = require('../middlewares/buildingAccessMiddleware');
const router = express.Router();
router.param('buildingId', buildingParam);
const facilityController = require('../controllers/facilityController');
const requireRole = require('../middlewares/roleMiddleware');
const requireFeature = require('../middlewares/requireFeatureMiddleware');

router.get('/buildings/:buildingId/facilities', requireRole('admin'), (req, res, next) => facilityController.getFacilitiesForAdmin(req, res, next));
router.post('/buildings/:buildingId/facilities', requireRole('admin'), requireFeature('ENABLE_FACILITY_BOOKING'), (req, res, next) => facilityController.createFacility(req, res, next));
router.patch('/facilities/:id', requireRole('admin'), entityGuard(resolvers.facility), (req, res, next) => facilityController.updateFacility(req, res, next));
router.delete('/facilities/:id', requireRole('admin'), entityGuard(resolvers.facility), (req, res, next) => facilityController.deleteFacility(req, res, next));
router.get('/buildings/:buildingId/facility-bookings', requireRole('admin'), (req, res, next) => facilityController.getBookingsForAdmin(req, res, next));
router.patch('/facility-bookings/:id', requireRole('admin'), entityGuard(resolvers.facilityBooking), (req, res, next) => facilityController.cancelBookingByAdmin(req, res, next));

module.exports = router;
