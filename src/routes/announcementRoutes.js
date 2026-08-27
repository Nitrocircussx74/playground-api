const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcementController');

router.get('/', (req, res, next) => announcementController.getAnnouncementsForAdmin(req, res, next));
router.post('/', (req, res, next) => announcementController.createAnnouncement(req, res, next));
router.delete('/:id', (req, res, next) => announcementController.deleteAnnouncement(req, res, next));

module.exports = router;
