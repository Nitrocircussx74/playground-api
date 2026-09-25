const express = require('express');
const { buildingParam, entityParam, resolvers, requireBuildingInRequest } = require('../middlewares/buildingAccessMiddleware');
const router = express.Router();
router.param('id', entityParam(resolvers.maintenance));
router.param('buildingId', buildingParam);
const maintenanceController = require('../controllers/maintenanceController');

const requireRole = require('../middlewares/roleMiddleware');

router.get('/', (req, res, next) => maintenanceController.getMaintenanceRequests(req, res, next));
router.get('/buildings/:buildingId/maintenance', requireRole('admin'), (req, res, next) => maintenanceController.getMaintenanceRequests(req, res, next));

router.post('/', requireRole('admin'), requireBuildingInRequest, (req, res, next) => maintenanceController.createMaintenanceRequest(req, res, next));
router.post('/liff/maintenance', requireRole('admin'), requireBuildingInRequest, (req, res, next) => maintenanceController.createMaintenanceRequest(req, res, next));

router.patch('/:id/status', requireRole('admin'), (req, res, next) => maintenanceController.updateMaintenanceStatus(req, res, next));
router.patch('/:id', requireRole('admin'), (req, res, next) => maintenanceController.updateMaintenanceStatus(req, res, next));
router.put('/:id', requireRole('admin'), (req, res, next) => maintenanceController.updateMaintenanceStatus(req, res, next));

router.delete('/:id', requireRole('admin'), (req, res, next) => maintenanceController.deleteMaintenanceRequest(req, res, next));

module.exports = router;
