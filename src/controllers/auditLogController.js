const billingService = require('../services/billingService');

class AuditLogController {
  /**
   * GET /api/admin/audit-logs
   * ดึงข้อมูล Audit Logs พร้อม Pagination และ Filter (เฉพาะ OWNER / super_admin)
   */
  async getAuditLogs(req, res, next) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;
      const skip = (page - 1) * limit;

      const { adminId, action, entity, startDate, endDate } = req.query;

      const where = {};

      if (adminId) {
        where.adminId = adminId;
      }

      if (action) {
        where.action = action.toUpperCase();
      }

      if (entity) {
        where.entity = entity.toUpperCase();
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          where.createdAt.gte = new Date(startDate);
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          where.createdAt.lte = end;
        }
      }

      const [total, logs] = await Promise.all([
        billingService.prisma.auditLog.count({ where }),
        billingService.prisma.auditLog.findMany({
          where,
          take: limit,
          skip,
          orderBy: { createdAt: 'desc' },
          include: {
            admin: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true
              }
            }
          }
        })
      ]);

      const totalPages = Math.ceil(total / limit) || 1;

      return res.status(200).json({
        success: true,
        data: logs,
        meta: {
          total,
          page,
          limit,
          totalPages
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuditLogController();
