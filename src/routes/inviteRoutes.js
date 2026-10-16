const express = require('express');
const { entityGuard, entityParam, requireBuildingInRequest, resolvers } = require('../middlewares/buildingAccessMiddleware');
const router = express.Router();
router.param('roomId', entityParam(resolvers.room));
const roomController = require('../controllers/roomController');
const requireRole = require('../middlewares/roleMiddleware');

router.post('/', requireRole('admin'), requireBuildingInRequest, (req, res, next) => roomController.createRoomInvite(req, res, next));
router.get('/room/:roomId', requireRole('admin'), (req, res, next) => roomController.getRoomInvites(req, res, next));
router.delete('/:id', requireRole('admin'), entityGuard(resolvers.roomInvite), (req, res, next) => roomController.revokeRoomInvite(req, res, next));

module.exports = router;
