const express = require('express');
const { entityGuard, resolvers } = require('../middlewares/buildingAccessMiddleware');
const router = express.Router();
const announcementController = require('../controllers/announcementController');
const requireRole = require('../middlewares/roleMiddleware');

router.use(requireRole('admin'));

router.get('/recipients-count', (req, res, next) => announcementController.getRecipientsCount(req, res, next));
router.get('/', (req, res, next) => announcementController.getAnnouncementsForAdmin(req, res, next));
router.post('/', (req, res, next) => announcementController.createAnnouncement(req, res, next));
router.delete('/:id', entityGuard(resolvers.announcement), (req, res, next) => announcementController.deleteAnnouncement(req, res, next));

module.exports = router;
