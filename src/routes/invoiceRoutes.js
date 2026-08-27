const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const requireRole = require('../middlewares/roleMiddleware');

router.get('/', (req, res, next) => invoiceController.getInvoices(req, res, next));
router.post('/', requireRole('admin'), (req, res, next) => invoiceController.createInvoice(req, res, next));
router.put('/:id', requireRole('admin'), (req, res, next) => invoiceController.updateInvoice(req, res, next));
router.get('/:id/export', (req, res, next) => invoiceController.exportInvoicePdf(req, res, next));
router.post('/:id/payment-slips', (req, res, next) => invoiceController.uploadPaymentSlip(req, res, next));
router.patch('/:id/status', requireRole('admin'), (req, res, next) => invoiceController.updateInvoiceStatus(req, res, next));
router.post('/:id/pay-manual', requireRole('admin'), (req, res, next) => invoiceController.recordManualPayment(req, res, next));
router.delete('/:id', requireRole('admin'), (req, res, next) => invoiceController.deleteInvoice(req, res, next));

module.exports = router;
