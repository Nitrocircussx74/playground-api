const express = require('express');
const router = express.Router();
const leaseController = require('../controllers/leaseController');

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

module.exports = router;
