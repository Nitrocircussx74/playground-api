const tenantService = require('../services/tenantService');
const auditService = require('../services/auditService');

class TenantController {
  /**
   * GET /api/admin/tenants
   * ดึงรายการผู้เช่าทั้งหมดในระบบ
   */
  async getAllTenants(req, res, next) {
    try {
      const tenants = await tenantService.getAllTenants(req.query, {
        role: req.user?.role,
        userId: req.user?.id || req.user?.userId
      });
      return res.status(200).json({
        success: true,
        data: tenants
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/tenants/:tenantId
   * ดึงข้อมูลผู้เช่าแบบจัดเต็ม (Deep Fetching 360-degree view)
   * Relation: LeaseContracts, Invoices, MaintenanceRequests, Rooms
   */
  async getTenantDetail(req, res, next) {
    try {
      const { tenantId } = req.params;
      const { buildingId } = req.query;
      if (!tenantId) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาระบุ tenantId'
        });
      }

      const tenant = await tenantService.getTenantProfile(tenantId, {
        role: req.user?.role,
        userId: req.user?.id || req.user?.userId,
        buildingId
      });

      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบข้อมูลผู้เช่ารายนี้ในระบบ'
        });
      }

      return res.status(200).json({
        success: true,
        data: tenant
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/admin/tenants/:tenantId/notes
   * API สำหรับแอดมินแก้ไขข้อมูลส่วนตัว หรือบันทึกภายใน (Internal Notes / Blacklist Flag)
   * Security & RBAC: อนุญาตเฉพาะ Role OWNER, MANAGER, super_admin, superadmin, admin
   */
  async updateTenantNotes(req, res, next) {
    try {
      const { tenantId } = req.params;
      const { internalNotes, isBlacklisted } = req.body;

      const userRole = (req.user?.role || '').toLowerCase();
      const isAuthorized = ['owner', 'manager', 'super_admin', 'superadmin', 'admin'].includes(userRole);

      if (!isAuthorized) {
        return res.status(403).json({
          success: false,
          message: 'ปฏิเสธการเข้าถึง: เฉพาะสิทธิ์ OWNER หรือ MANAGER เท่านั้นที่จัดการบันทึกภายในได้'
        });
      }

      // ดึงข้อมูลเดิมก่อนอัปเดตสำหรับ Audit Log
      const oldTenant = await tenantService.getTenantProfile(tenantId, { role: userRole });
      if (!oldTenant) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบข้อมูลผู้เช่ารายนี้ในระบบ'
        });
      }

      const updatedTenant = await tenantService.updateTenantNotes(tenantId, {
        internalNotes,
        isBlacklisted
      });

      // บันทึก Audit Log
      await auditService.logAction({
        adminId: req.user?.id || req.user?.userId,
        action: 'UPDATE',
        entity: 'TENANT',
        entityId: tenantId,
        oldValues: {
          internalNotes: oldTenant.internalNotes,
          isBlacklisted: oldTenant.isBlacklisted
        },
        newValues: {
          internalNotes: updatedTenant.internalNotes,
          isBlacklisted: updatedTenant.isBlacklisted
        }
      });

      return res.status(200).json({
        success: true,
        message: 'อัปเดตบันทึกภายในและสถานะผู้เช่าเรียบร้อยแล้ว',
        data: updatedTenant
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new TenantController();
