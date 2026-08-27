const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const liffController = require('../controllers/liffController');
const requireRole = require('../middlewares/roleMiddleware');

// Profile Endpoints (Accessible by all logged-in admins)
router.get('/me', (req, res, next) => adminController.getMe(req, res, next));
router.put('/me/password', (req, res, next) => adminController.updatePassword(req, res, next));

// Tenant Invite Generator
router.post('/tenants/:id/generate-invite', (req, res, next) => liffController.generateTenantInvite(req, res, next));

// Admin User & Permission Management (Restricted to OWNER / super_admin)
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

module.exports = router;
