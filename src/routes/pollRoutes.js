const express = require('express');
const router = express.Router();
const pollController = require('../controllers/pollController');
const requireRole = require('../middlewares/roleMiddleware');
const requireFeature = require('../middlewares/requireFeatureMiddleware');

router.get('/buildings/:buildingId/polls', (req, res, next) => pollController.getPollsForAdmin(req, res, next));
router.post('/buildings/:buildingId/polls', requireRole('admin'), requireFeature('ENABLE_VOTING'), (req, res, next) => pollController.createPoll(req, res, next));
router.patch('/polls/:id', requireRole('admin'), (req, res, next) => pollController.updatePoll(req, res, next));
router.delete('/polls/:id', requireRole('admin'), (req, res, next) => pollController.deletePoll(req, res, next));
router.get('/polls/:id/results', (req, res, next) => pollController.getPollResults(req, res, next));

module.exports = router;
