const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const upload = require('../middlewares/uploadMiddleware');
const verifyImageMagicBytes = require('../middlewares/verifyImageMagicBytes');
const liffAuthMiddleware = require('../middlewares/liffAuthMiddleware');
const validate = require('../middlewares/validateMiddleware');
const { linkAccountSchema, registerInviteSchema } = require('../validators/liffValidator');
const liffController = require('../controllers/liffController');
const announcementController = require('../controllers/announcementController');
const maintenanceController = require('../controllers/maintenanceController');
const invoiceController = require('../controllers/invoiceController');
const parcelController = require('../controllers/parcelController');

// Public Invite Code Verification (อนุญาตให้ตรวจสอบความถูกต้องของรหัสเชิญได้ทั้งในและนอก LINE App)
router.get('/invites/verify/:code', (req, res, next) => liffController.verifyInviteCode(req, res, next));

// ทุก Route ถัดจากนี้ต้องมี LINE ID Token ที่ตรวจสอบผ่านแล้วเสมอ (req.lineUserId)
router.use(liffAuthMiddleware);

// จำกัดจำนวนครั้งการลองผูกบัญชี เพื่อป้องกัน Brute Force เดา phoneLast4 (10,000 ค่า) เมื่อรู้ inviteCode แล้ว
const linkAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'พยายามผูกบัญชีบ่อยเกินไป กรุณาลองใหม่อีกครั้งใน 15 นาที'
  }
});

// LIFF Settings & Payment QR per Building
router.get('/settings', (req, res, next) => liffController.getSettingsForTenant(req, res, next));

// LIFF Tenant Check Status (Smart Entry Gateway Router)
router.get('/check-status', (req, res, next) => liffController.checkTenantStatus(req, res, next));

// LIFF Tenant Profile & Contact Update
router.get('/profile', (req, res, next) => liffController.getTenantProfile(req, res, next));
router.put('/profile', (req, res, next) => liffController.updateTenantProfile(req, res, next));

// LIFF Invoices & Payment
router.get('/invoices/history', (req, res, next) => invoiceController.getPaidInvoicesForLiff(req, res, next));
router.get('/invoices/:id/receipt-pdf', (req, res, next) => invoiceController.exportReceiptPdf(req, res, next));
router.get('/invoices/:id', (req, res, next) => liffController.getInvoiceForLiff(req, res, next));
router.post('/invoices/:id/slip', upload.single('file'), verifyImageMagicBytes, (req, res, next) => liffController.uploadSlipFromLiff(req, res, next));

// LIFF Tenant Registration & Account Linking
router.post('/register/invite', validate(registerInviteSchema), (req, res, next) => liffController.registerTenantWithInvite(req, res, next));
router.post('/auth/link-account', linkAccountLimiter, validate(linkAccountSchema), (req, res, next) => liffController.linkTenantAccount(req, res, next));
router.patch('/auth/sync-profile', (req, res, next) => liffController.syncLineProfile(req, res, next));

// LIFF Announcements
router.get('/announcements', (req, res, next) => announcementController.getAnnouncementsForLiff(req, res, next));

// LIFF Maintenance Requests & Status Tracking
router.get('/maintenance', (req, res, next) => maintenanceController.getMaintenanceRequestsForLiff(req, res, next));
router.post('/maintenance', upload.single('file'), verifyImageMagicBytes, (req, res, next) => maintenanceController.createMaintenanceRequest(req, res, next));

// LIFF Parcels
router.get('/parcels', (req, res, next) => parcelController.getParcelsForLiff(req, res, next));

module.exports = router;
