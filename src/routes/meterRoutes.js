const express = require('express');
const router = express.Router();
const meterController = require('../controllers/meterController');

router.get('/', (req, res, next) => meterController.getMeterRecords(req, res, next));
router.post('/', (req, res, next) => meterController.createMeterRecord(req, res, next));

module.exports = router;
