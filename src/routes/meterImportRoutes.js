const express = require('express');
const router = express.Router();
const multer = require('multer');
const meterImportController = require('../controllers/meterImportController');

// Memory storage for multer file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Download pre-filled Excel template
router.get('/buildings/:buildingId/meters/template', (req, res, next) =>
  meterImportController.downloadTemplate(req, res, next)
);

// Preview import file validation
router.post('/buildings/:buildingId/meters/import-preview', upload.single('file'), (req, res, next) =>
  meterImportController.previewImport(req, res, next)
);

module.exports = router;
