const express = require('express');
const router = express.Router();
const meterController = require('../controllers/meterController');
const requireRole = require('../middlewares/roleMiddleware');

router.get('/', (req, res, next) => meterController.getMeterRecords(req, res, next));
router.post('/', requireRole('admin'), (req, res, next) => meterController.createMeterRecord(req, res, next));

module.exports = router;
