const billingService = require('../services/billingService');
const lineService = require('../services/lineService');

async function resolveTenant(req) {
  const { tenantId, lineUserId } = req;
  if (tenantId) {
    const tenant = await billingService.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (tenant) return tenant;
  }
  if (lineUserId) {
    return billingService.prisma.tenant.findUnique({ where: { lineUserId } });
  }
  return null;
}

class NotificationController {
  /**
   * แอดมินดึงรายการแจ้งเตือน In-App (Bell) ของตึก (GET /api/admin/buildings/:id/notifications)
   */
  async getAdminNotifications(req, res, next) {
    try {
      const buildingId = req.params.id || req.params.buildingId;
      const { page, limit, unread } = req.query;
      const result = await lineService.getAdminAlerts({ buildingId, page, limit, unreadOnly: unread === '1' || unread === 'true' });
      return res.status(200).json({ success: true, data: result.logs, unreadCount: result.unreadCount, pagination: result.pagination });
    } catch (error) {
      next(error);
    }
  }

  /**
   * แอดมินทำเครื่องหมายอ่านแจ้งเตือน 1 รายการ (PATCH /api/admin/buildings/:id/notifications/:notifId/read)
   */
  async markAdminNotificationRead(req, res, next) {
    try {
      const buildingId = req.params.id || req.params.buildingId;
      const found = await lineService.markNotificationRead({ id: req.params.notifId, buildingId });
      if (!found) return res.status(404).json({ success: false, message: 'ไม่พบแจ้งเตือนนี้' });
      return res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  /**
   * แอดมินทำเครื่องหมายอ่านทั้งหมด (POST /api/admin/buildings/:id/notifications/read-all)
   */
  async markAllAdminNotificationsRead(req, res, next) {
    try {
      const buildingId = req.params.id || req.params.buildingId;
      const count = await lineService.markAllNotificationsRead({ buildingId });
      return res.status(200).json({ success: true, count });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ลูกบ้านดึงรายการแจ้งเตือน In-App (Bell) ของตัวเอง (GET /api/v1/liff/notifications)
   */
  async getTenantNotifications(req, res, next) {
    try {
      const tenant = await resolveTenant(req);
      if (!tenant) return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้เช่า' });

      const { page, limit, unread } = req.query;
      const result = await lineService.getTenantNotifications({ tenantId: tenant.id, page, limit, unreadOnly: unread === '1' || unread === 'true' });
      return res.status(200).json({ success: true, data: result.logs, unreadCount: result.unreadCount, pagination: result.pagination });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ลูกบ้านทำเครื่องหมายอ่านแจ้งเตือน 1 รายการ (PATCH /api/v1/liff/notifications/:id/read)
   */
  async markTenantNotificationRead(req, res, next) {
    try {
      const tenant = await resolveTenant(req);
      if (!tenant) return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้เช่า' });

      const found = await lineService.markNotificationRead({ id: req.params.id, tenantId: tenant.id });
      if (!found) return res.status(404).json({ success: false, message: 'ไม่พบแจ้งเตือนนี้' });
      return res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ลูกบ้านทำเครื่องหมายอ่านทั้งหมด (POST /api/v1/liff/notifications/read-all)
   */
  async markAllTenantNotificationsRead(req, res, next) {
    try {
      const tenant = await resolveTenant(req);
      if (!tenant) return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้เช่า' });

      const count = await lineService.markAllNotificationsRead({ tenantId: tenant.id });
      return res.status(200).json({ success: true, count });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new NotificationController();
