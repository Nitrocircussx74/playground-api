const express = require('express');
const router = express.Router();
const moveOutController = require('../controllers/moveOutController');

// Move-out calculation preview simulation
router.get('/leases/:id/move-out-calculation', (req, res, next) => moveOutController.getMoveOutCalculation(req, res, next));

// Process move-out transaction
router.post('/leases/:id/process-move-out', (req, res, next) => moveOutController.processMoveOut(req, res, next));

module.exports = router;
