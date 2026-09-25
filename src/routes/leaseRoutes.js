const express = require('express');
const { entityParam, resolvers } = require('../middlewares/buildingAccessMiddleware');
const router = express.Router();
router.param('roomId', entityParam(resolvers.room));
router.param('leaseId', entityParam(resolvers.lease));
router.param('tenantId', entityParam(resolvers.tenant));
const leaseController = require('../controllers/leaseController');
const requireRole = require('../middlewares/roleMiddleware');

router.use(requireRole('admin'));

// All leases & tenancy history
router.get('/leases', (req, res, next) => leaseController.getAllLeases(req, res, next));
router.get('/rooms/all/leases', (req, res, next) => leaseController.getAllLeases(req, res, next));

// Room tenancy history & lease creation
router.get('/rooms/:roomId/history', (req, res, next) => leaseController.getRoomTenancyHistory(req, res, next));
router.post('/rooms/:roomId/leases', (req, res, next) => leaseController.createLeaseContract(req, res, next));

// Tenant lease history across buildings
router.get('/tenants/:tenantId/history', (req, res, next) => leaseController.getTenantLeaseHistory(req, res, next));

// Terminate lease / move-out endpoint
router.post('/leases/:leaseId/terminate', (req, res, next) => leaseController.terminateLease(req, res, next));

// Full contract details for E-Contract PDF
router.get('/leases/:leaseId/contract', (req, res, next) => leaseController.getLeaseContractDetail(req, res, next));

module.exports = router;
