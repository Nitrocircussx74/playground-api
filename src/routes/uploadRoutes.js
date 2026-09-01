const express = require('express');
const router = express.Router();
const upload = require('../middlewares/uploadMiddleware');
const verifyImageMagicBytes = require('../middlewares/verifyImageMagicBytes');
const uploadController = require('../controllers/uploadController');

router.post('/', upload.single('file'), verifyImageMagicBytes, (req, res, next) => uploadController.uploadFile(req, res, next));

module.exports = router;
