const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const liffController = require('../controllers/liffController');
const tenantController = require('../controllers/tenantController');
const requireRole = require('../middlewares/roleMiddleware');

// Profile Endpoints (Accessible by all logged-in admins)
router.get('/me', (req, res, next) => adminController.getMe(req, res, next));
router.put('/me/password', (req, res, next) => adminController.updatePassword(req, res, next));

// Tenant CRM & 360 History Profile Endpoints
router.get('/tenants', (req, res, next) => tenantController.getAllTenants(req, res, next));
router.post('/tenants/manual', (req, res, next) => tenantController.createManualTenant(req, res, next));
router.get('/tenants/:tenantId', (req, res, next) => tenantController.getTenantDetail(req, res, next));
router.patch('/tenants/:tenantId/notes', requireRole('OWNER', 'MANAGER', 'super_admin', 'superadmin', 'admin'), (req, res, next) =>
  tenantController.updateTenantNotes(req, res, next)
);

// App Access & Security Management (PIN Reset, Unlink LINE, Invite Code)
router.post('/tenants/:id/reset-pin', requireRole('OWNER', 'MANAGER', 'super_admin', 'superadmin', 'admin'), (req, res, next) =>
  tenantController.resetPin(req, res, next)
);
router.post('/tenants/:id/unlink-line', requireRole('OWNER', 'MANAGER', 'super_admin', 'superadmin', 'admin'), (req, res, next) =>
  tenantController.unlinkLine(req, res, next)
);
router.post('/tenants/:id/generate-invite', (req, res, next) => tenantController.generateInvite(req, res, next));

// Admin User & Permission Management (Restricted to OWNER / super_admin)
router.get('/room-owners', (req, res, next) => adminController.getRoomOwners(req, res, next));
router.get('/users', requireRole('OWNER', 'super_admin', 'superadmin'), (req, res, next) =>
  adminController.getAdminUsers(req, res, next)
);
router.post('/users', requireRole('OWNER', 'super_admin', 'superadmin'), (req, res, next) =>
  adminController.createAdminUser(req, res, next)
);
router.put('/users/:id/permissions', requireRole('OWNER', 'super_admin', 'superadmin'), (req, res, next) =>
  adminController.updateUserPermissions(req, res, next)
);
router.delete('/users/:id', requireRole('OWNER', 'super_admin', 'superadmin'), (req, res, next) =>
  adminController.deleteAdminUser(req, res, next)
);

// Issue & Complaints Management (เรื่องร้องเรียนและแจ้งซ่อมจากลูกบ้าน)
const issueController = require('../controllers/issueController');
router.get('/issues', (req, res, next) => issueController.getAllIssuesForAdmin(req, res, next));
router.put('/issues/:id', (req, res, next) => issueController.updateIssueByAdmin(req, res, next));

module.exports = router;
