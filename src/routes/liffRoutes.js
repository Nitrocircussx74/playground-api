const express = require('express');
const router = express.Router();
const upload = require('../middlewares/uploadMiddleware');
const liffController = require('../controllers/liffController');

router.get('/invoices/:id', (req, res, next) => liffController.getInvoiceForLiff(req, res, next));
router.post('/invoices/:id/slip', upload.single('file'), (req, res, next) => liffController.uploadSlipFromLiff(req, res, next));

module.exports = router;
