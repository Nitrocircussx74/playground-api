const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');
const requireRole = require('../middlewares/roleMiddleware');

router.get('/', (req, res, next) => roomController.getRooms(req, res, next));
router.get('/:id', (req, res, next) => roomController.getRoomById(req, res, next));
router.post('/', requireRole('admin'), (req, res, next) => roomController.createRoom(req, res, next));
router.post('/:id/invites', requireRole('admin'), (req, res, next) => roomController.createRoomInvite(req, res, next));

module.exports = router;
