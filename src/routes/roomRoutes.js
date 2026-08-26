const express = require('express');
const router = express.Router();
const roomController = require('../controllers/roomController');

router.get('/', (req, res, next) => roomController.getRooms(req, res, next));
router.get('/:id', (req, res, next) => roomController.getRoomById(req, res, next));

module.exports = router;
