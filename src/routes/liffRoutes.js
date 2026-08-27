const express = require('express');
const router = express.Router();
const upload = require('../middlewares/uploadMiddleware');
const liffController = require('../controllers/liffController');
const announcementController = require('../controllers/announcementController');
const maintenanceController = require('../controllers/maintenanceController');
const invoiceController = require('../controllers/invoiceController');

// LIFF Settings & Payment QR per Building
router.get('/settings', (req, res, next) => liffController.getSettingsForTenant(req, res, next));

// LIFF Tenant Profile & Contact Update
router.get('/profile', (req, res, next) => liffController.getTenantProfile(req, res, next));
router.put('/profile', (req, res, next) => liffController.updateTenantProfile(req, res, next));

// LIFF Invoices & Payment
router.get('/invoices/history', (req, res, next) => invoiceController.getPaidInvoicesForLiff(req, res, next));
router.get('/invoices/:id/receipt-pdf', (req, res, next) => invoiceController.exportReceiptPdf(req, res, next));
router.get('/invoices/:id', (req, res, next) => liffController.getInvoiceForLiff(req, res, next));
router.post('/invoices/:id/slip', upload.single('file'), (req, res, next) => liffController.uploadSlipFromLiff(req, res, next));

// LIFF Tenant Registration
router.get('/invites/verify/:code', (req, res, next) => liffController.verifyInviteCode(req, res, next));
router.post('/register/invite', (req, res, next) => liffController.registerTenantWithInvite(req, res, next));

// LIFF Announcements
router.get('/announcements', (req, res, next) => announcementController.getAnnouncementsForLiff(req, res, next));

// LIFF Maintenance Requests & Status Tracking
router.get('/maintenance', (req, res, next) => maintenanceController.getMaintenanceRequestsForLiff(req, res, next));
router.post('/maintenance', upload.single('file'), (req, res, next) => maintenanceController.createMaintenanceRequest(req, res, next));

module.exports = router;
