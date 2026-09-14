const express = require('express');
const router = express.Router();
const buildingController = require('../controllers/buildingController');
const meterInvoiceController = require('../controllers/meterInvoiceController');
const notificationController = require('../controllers/notificationController');
const requireRole = require('../middlewares/roleMiddleware');

// Settings GET Endpoint (Accessible by OWNER, super_admin, MANAGER, admin)
router.get('/', (req, res, next) => buildingController.getBuildings(req, res, next));
router.get('/:id', (req, res, next) => buildingController.getBuildingById(req, res, next));
router.get('/:buildingId/settings', (req, res, next) => buildingController.getBuildingSettings(req, res, next));
router.get('/:id/line-quota', (req, res, next) => buildingController.getLineQuota(req, res, next));
router.get('/:buildingId/line-quota', (req, res, next) => buildingController.getLineQuota(req, res, next));
router.get('/:id/notification-logs', (req, res, next) => buildingController.getNotificationLogs(req, res, next));
router.get('/:buildingId/notification-logs', (req, res, next) => buildingController.getNotificationLogs(req, res, next));

// In-App Notification Bell (Admin CMS) — เหตุการณ์ที่ลูกบ้านทำแล้วต้องให้แอดมินมาดู
router.get('/:id/notifications', (req, res, next) => notificationController.getAdminNotifications(req, res, next));
router.post('/:id/notifications/read-all', (req, res, next) => notificationController.markAllAdminNotificationsRead(req, res, next));
router.patch('/:id/notifications/:notifId/read', (req, res, next) => notificationController.markAdminNotificationRead(req, res, next));

// Meter Reading & Invoice Generation Endpoints
router.get('/:buildingId/meters/draft', (req, res, next) => meterInvoiceController.getMetersDraft(req, res, next));
router.post('/:buildingId/invoices/generate', (req, res, next) => meterInvoiceController.generateInvoices(req, res, next));
router.post('/:buildingId/invoices/publish', (req, res, next) => meterInvoiceController.publishInvoices(req, res, next));

// Settings PUT & POST Endpoints (RESTRICTED to OWNER & super_admin ONLY!)
router.post('/', requireRole('OWNER', 'super_admin'), (req, res, next) => buildingController.createBuilding(req, res, next));
router.put('/:buildingId/settings', requireRole('OWNER', 'super_admin'), (req, res, next) => buildingController.updateBuildingSetting(req, res, next));

module.exports = router;
