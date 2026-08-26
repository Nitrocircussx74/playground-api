const express = require('express');
const router = express.Router();
const maintenanceController = require('../controllers/maintenanceController');

router.get('/', (req, res, next) => maintenanceController.getMaintenanceRequests(req, res, next));
router.post('/', (req, res, next) => maintenanceController.createMaintenanceRequest(req, res, next));
router.patch('/:id/status', (req, res, next) => maintenanceController.updateMaintenanceStatus(req, res, next));

module.exports = router;
