const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

router.get('/summary', (req, res, next) => dashboardController.getSummary(req, res, next));
router.post('/remind-debtors', (req, res, next) => dashboardController.remindDebtors(req, res, next));

module.exports = router;
