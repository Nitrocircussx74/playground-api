const express = require('express');
const router = express.Router();
const featureController = require('../controllers/featureController');
const authenticateJWT = require('../middlewares/authMiddleware');
const requireRole = require('../middlewares/roleMiddleware');

router.get('/', (req, res, next) => featureController.getFeatures(req, res, next));
router.put('/:key', authenticateJWT, requireRole('admin'), (req, res, next) => featureController.updateFeature(req, res, next));

module.exports = router;
