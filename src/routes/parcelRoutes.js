const express = require('express');
const router = express.Router();
const parcelController = require('../controllers/parcelController');

// Building scoped endpoints
router.get('/buildings/:buildingId/parcels', (req, res, next) => parcelController.getParcelsByBuilding(req, res, next));
router.post('/buildings/:buildingId/parcels', (req, res, next) => parcelController.createParcel(req, res, next));

// Parcel individual endpoints
router.patch('/parcels/:id/pickup', (req, res, next) => parcelController.markAsPickedUp(req, res, next));
router.delete('/parcels/:id', (req, res, next) => parcelController.deleteParcel(req, res, next));

module.exports = router;
