const express = require('express');
const router = express.Router();
const featureController = require('../controllers/featureController');

router.get('/', (req, res, next) => featureController.getFeatures(req, res, next));
router.put('/:key', (req, res, next) => featureController.updateFeature(req, res, next));

module.exports = router;
