const express = require('express');
const router = express.Router();
const maintenanceController = require('../controllers/maintenanceController');

router.get('/', (req, res, next) => maintenanceController.getMaintenanceRequests(req, res, next));
router.get('/buildings/:buildingId/maintenance', (req, res, next) => maintenanceController.getMaintenanceRequests(req, res, next));

router.post('/', (req, res, next) => maintenanceController.createMaintenanceRequest(req, res, next));
router.post('/liff/maintenance', (req, res, next) => maintenanceController.createMaintenanceRequest(req, res, next));

router.patch('/:id/status', (req, res, next) => maintenanceController.updateMaintenanceStatus(req, res, next));
router.patch('/:id', (req, res, next) => maintenanceController.updateMaintenanceStatus(req, res, next));
router.put('/:id', (req, res, next) => maintenanceController.updateMaintenanceStatus(req, res, next));

router.delete('/:id', (req, res, next) => maintenanceController.deleteMaintenanceRequest(req, res, next));

module.exports = router;
