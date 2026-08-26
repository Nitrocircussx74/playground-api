const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');

router.get('/', (req, res, next) => invoiceController.getInvoices(req, res, next));
router.post('/', (req, res, next) => invoiceController.createInvoice(req, res, next));
router.post('/:id/payment-slips', (req, res, next) => invoiceController.uploadPaymentSlip(req, res, next));
router.patch('/:id/status', (req, res, next) => invoiceController.updateInvoiceStatus(req, res, next));

module.exports = router;
