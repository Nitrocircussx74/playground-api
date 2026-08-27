const express = require('express');
const router = express.Router();
const buildingController = require('../controllers/buildingController');
const requireRole = require('../middlewares/roleMiddleware');

router.get('/', (req, res, next) => buildingController.getBuildings(req, res, next));
router.get('/:id', (req, res, next) => buildingController.getBuildingById(req, res, next));
router.post('/', requireRole('admin'), (req, res, next) => buildingController.createBuilding(req, res, next));
router.put('/:id/setting', requireRole('admin'), (req, res, next) => buildingController.updateBuildingSetting(req, res, next));

module.exports = router;
