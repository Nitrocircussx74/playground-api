const express = require('express');
const { buildingParam } = require('../middlewares/buildingAccessMiddleware');
const router = express.Router();
router.param('buildingId', buildingParam);
router.param('id', buildingParam);
const buildingController = require('../controllers/buildingController');
const meterController = require('../controllers/meterController');
const notificationController = require('../controllers/notificationController');
const requireRole = require('../middlewares/roleMiddleware');

// Settings GET Endpoint (Accessible by OWNER, super_admin, MANAGER, admin)
router.get('/', requireRole('admin'), (req, res, next) => buildingController.getBuildings(req, res, next));
router.get('/:id', requireRole('admin'), (req, res, next) => buildingController.getBuildingById(req, res, next));
router.get('/:buildingId/settings', requireRole('admin'), (req, res, next) => buildingController.getBuildingSettings(req, res, next));
router.get('/:id/line-quota', requireRole('admin'), (req, res, next) => buildingController.getLineQuota(req, res, next));
router.get('/:buildingId/line-quota', requireRole('admin'), (req, res, next) => buildingController.getLineQuota(req, res, next));
router.get('/:id/notification-logs', requireRole('admin'), (req, res, next) => buildingController.getNotificationLogs(req, res, next));
router.get('/:buildingId/notification-logs', requireRole('admin'), (req, res, next) => buildingController.getNotificationLogs(req, res, next));

// In-App Notification Bell (Admin CMS) — เหตุการณ์ที่ลูกบ้านทำแล้วต้องให้แอดมินมาดู
router.get('/:id/notifications', requireRole('admin'), (req, res, next) => notificationController.getAdminNotifications(req, res, next));
router.post('/:id/notifications/read-all', requireRole('admin'), (req, res, next) => notificationController.markAllAdminNotificationsRead(req, res, next));
router.patch('/:id/notifications/:notifId/read', requireRole('admin'), (req, res, next) => notificationController.markAdminNotificationRead(req, res, next));

// Meter Reading & Invoice Generation Endpoints
router.get('/:buildingId/meters/draft', requireRole('admin'), (req, res, next) => meterController.getMetersDraft(req, res, next));
router.post('/:buildingId/invoices/generate', requireRole('admin'), (req, res, next) => meterController.generateInvoices(req, res, next));
router.post('/:buildingId/invoices/publish', requireRole('admin'), (req, res, next) => meterController.publishInvoices(req, res, next));

// Financial Report Export (CSV)
router.get('/:buildingId/reports/monthly-csv', requireRole('admin'), (req, res, next) => buildingController.exportMonthlyCsv(req, res, next));

// Settings PUT, POST & DELETE Endpoints (RESTRICTED to OWNER & super_admin ONLY!)
router.post('/', requireRole('OWNER', 'super_admin'), (req, res, next) => buildingController.createBuilding(req, res, next));
router.put('/:buildingId/settings', requireRole('OWNER', 'super_admin'), (req, res, next) => buildingController.updateBuildingSetting(req, res, next));
router.delete('/:id', requireRole('OWNER', 'super_admin'), (req, res, next) => buildingController.deleteBuilding(req, res, next));

module.exports = router;
