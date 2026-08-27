const express = require('express');
const router = express.Router();
const auditLogController = require('../controllers/auditLogController');
const requireRole = require('../middlewares/roleMiddleware');

// GET /api/admin/audit-logs (Restricted to OWNER / super_admin)
router.get('/', requireRole('OWNER', 'super_admin', 'superadmin'), (req, res, next) =>
  auditLogController.getAuditLogs(req, res, next)
);

module.exports = router;
