const express = require('express');
const { entityParam, requireBuildingInRequest, resolvers, roomParam } = require('../middlewares/buildingAccessMiddleware');
const router = express.Router();
router.param('inviteId', entityParam(resolvers.roomInvite));
router.param('id', roomParam);
const roomController = require('../controllers/roomController');
const requireRole = require('../middlewares/roleMiddleware');

router.get('/', requireRole('admin', 'room_owner', 'investor'), (req, res, next) => roomController.getRooms(req, res, next));
router.get('/:id', requireRole('admin', 'room_owner', 'investor'), (req, res, next) => roomController.getRoomById(req, res, next));
router.get('/:id/invites', requireRole('admin'), (req, res, next) => roomController.getRoomInvites(req, res, next));
router.get('/:id/residents', requireRole('admin'), (req, res, next) => roomController.getRoomResidents(req, res, next));
router.post('/', requireRole('admin'), requireBuildingInRequest, (req, res, next) => roomController.createRoom(req, res, next));
router.post('/import', requireRole('admin'), requireBuildingInRequest, (req, res, next) => roomController.importRooms(req, res, next));
router.post('/:id/invites', requireRole('admin'), (req, res, next) => roomController.createRoomInvite(req, res, next));
router.post('/:id/residents', requireRole('admin'), (req, res, next) => roomController.addRoomResident(req, res, next));
router.put('/:id', requireRole('admin'), requireBuildingInRequest, (req, res, next) => roomController.updateRoom(req, res, next));
router.delete('/:id/invites/:inviteId', requireRole('admin'), (req, res, next) => roomController.revokeRoomInvite(req, res, next));
router.delete('/:id', requireRole('admin'), (req, res, next) => roomController.deleteRoom(req, res, next));
router.delete('/:id/residents/:tenantId', requireRole('admin'), (req, res, next) => roomController.removeRoomResident(req, res, next));

module.exports = router;
