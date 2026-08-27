const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

router.get('/summary', (req, res, next) => dashboardController.getSummary(req, res, next));
router.get('/trend', (req, res, next) => dashboardController.getRevenueTrend(req, res, next));
router.get('/export/csv', (req, res, next) => dashboardController.exportCsv(req, res, next));
router.get('/export/pdf', (req, res, next) => dashboardController.exportPdf(req, res, next));
router.post('/remind-debtors', (req, res, next) => dashboardController.remindDebtors(req, res, next));

module.exports = router;
