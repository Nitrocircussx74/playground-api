const billingService = require('../services/billingService');
const lineService = require('../services/lineService');

/**
 * ดึงข้อมูลผู้เช่าจาก tenantId (Backend JWT) ก่อน แล้วค่อย fallback ไปที่ lineUserId (LINE ID Token)
 */
async function resolveTenant(req) {
  const { tenantId, lineUserId } = req;
  let tenant = null;
  if (tenantId) {
    tenant = await billingService.prisma.tenant.findUnique({ where: { id: tenantId }, include: { rooms: true } });
  }
  if (!tenant && lineUserId) {
    tenant = await billingService.prisma.tenant.findUnique({ where: { lineUserId }, include: { rooms: true } });
  }
  return tenant;
}

class VehicleController {
  /**
   * แอดมินดึงรายการยานพาหนะทั้งหมดของตึก (GET /api/admin/buildings/:buildingId/vehicles)
   */
  async getVehiclesForAdmin(req, res, next) {
    try {
      const { buildingId } = req.params;
      const { status } = req.query;
      const vehicles = await billingService.prisma.vehicle.findMany({
        where: { buildingId, ...(status ? { status: String(status).toUpperCase() } : {}) },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: { tenant: true }
      });
      return res.status(200).json({ success: true, data: vehicles });
    } catch (error) {
      next(error);
    }
  }

  /**
   * แอดมินอนุมัติยานพาหนะ พร้อมแจ้งเตือนลูกบ้านทาง LINE (PATCH /api/admin/vehicles/:id/approve)
   */
  async approveVehicle(req, res, next) {
    try {
      const { id } = req.params;
      const vehicle = await billingService.prisma.vehicle.findUnique({ where: { id }, include: { tenant: true } });
      if (!vehicle) {
        return res.status(404).json({ success: false, message: 'ไม่พบรายการยานพาหนะ' });
      }

      const updated = await billingService.prisma.vehicle.update({
        where: { id },
        data: { status: 'APPROVED' },
        include: { tenant: true }
      });

      if (updated.tenant?.lineUserId) {
        await lineService.pushVehicleApprovalNotification(updated.tenant.lineUserId, updated);
      }

      return res.status(200).json({ success: true, message: `อนุมัติทะเบียน ${updated.licensePlate} เรียบร้อยแล้ว`, data: updated });
    } catch (error) {
      next(error);
    }
  }

  /**
   * แอดมินปฏิเสธยานพาหนะ พร้อมแจ้งเตือนลูกบ้านทาง LINE (PATCH /api/admin/vehicles/:id/reject)
   */
  async rejectVehicle(req, res, next) {
    try {
      const { id } = req.params;
      const vehicle = await billingService.prisma.vehicle.findUnique({ where: { id }, include: { tenant: true } });
      if (!vehicle) {
        return res.status(404).json({ success: false, message: 'ไม่พบรายการยานพาหนะ' });
      }

      const updated = await billingService.prisma.vehicle.update({
        where: { id },
        data: { status: 'REJECTED' },
        include: { tenant: true }
      });

      if (updated.tenant?.lineUserId) {
        await lineService.pushVehicleApprovalNotification(updated.tenant.lineUserId, updated);
      }

      return res.status(200).json({ success: true, message: `ปฏิเสธทะเบียน ${updated.licensePlate} เรียบร้อยแล้ว`, data: updated });
    } catch (error) {
      next(error);
    }
  }

  /**
   * แอดมินดึงรายการแขก/ผู้มาเยือนของตึก อ่านอย่างเดียว ไม่จำกัด role (GET /api/admin/buildings/:buildingId/visitors)
   */
  async getVisitorsForAdmin(req, res, next) {
    try {
      const { buildingId } = req.params;
      const visitors = await billingService.prisma.visitor.findMany({
        where: { buildingId },
        orderBy: { expectedDate: 'desc' },
        include: { tenant: true }
      });
      return res.status(200).json({ success: true, data: visitors });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ลูกบ้านลงทะเบียนยานพาหนะใหม่ (สถานะเริ่มต้น PENDING รออนุมัติ) (POST /api/v1/liff/vehicles)
   */
  async registerVehicle(req, res, next) {
    try {
      const { licensePlate, vehicleType, brand, color, photoUrl } = req.body;

      if (!licensePlate || !vehicleType) {
        return res.status(400).json({ success: false, message: 'กรุณาระบุ licensePlate และ vehicleType ให้ครบถ้วน' });
      }

      const tenant = await resolveTenant(req);
      if (!tenant) {
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้เช่า' });
      }

      const buildingId = tenant.rooms?.[0]?.buildingId;
      if (!buildingId) {
        return res.status(400).json({ success: false, message: 'ไม่พบข้อมูลห้องพัก/ตึกของผู้เช่า' });
      }

      const toggle = await billingService.prisma.featureToggle.findFirst({
        where: { key: 'ENABLE_VEHICLE_MANAGEMENT', buildingId }
      });
      if (toggle && !toggle.isActive) {
        return res.status(403).json({ success: false, message: 'ฟีเจอร์จัดการยานพาหนะถูกปิดใช้งานสำหรับตึกนี้' });
      }

      const vehicle = await billingService.prisma.vehicle.create({
        data: {
          buildingId,
          tenantId: tenant.id,
          licensePlate: licensePlate.trim(),
          vehicleType,
          brand: brand || null,
          color: color || null,
          photoUrl: photoUrl || null
        }
      });

      return res.status(201).json({ success: true, message: 'ลงทะเบียนยานพาหนะเรียบร้อยแล้ว รอการอนุมัติ', data: vehicle });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ลูกบ้านดูรายการยานพาหนะของตัวเอง (GET /api/v1/liff/vehicles/mine)
   */
  async getMyVehicles(req, res, next) {
    try {
      const tenant = await resolveTenant(req);
      if (!tenant) {
        return res.status(200).json({ success: true, data: [] });
      }
      const vehicles = await billingService.prisma.vehicle.findMany({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: 'desc' }
      });
      return res.status(200).json({ success: true, data: vehicles });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ลูกบ้านลบยานพาหนะของตัวเอง เฉพาะที่ยังรออนุมัติ (PENDING) เท่านั้น (DELETE /api/v1/liff/vehicles/:id)
   * เช็ค tenantId ให้ตรงกับเจ้าของก่อนเสมอ ป้องกันลบข้อมูลของคนอื่น (IDOR)
   */
  async deleteMyVehicle(req, res, next) {
    try {
      const { id } = req.params;
      const tenant = await resolveTenant(req);
      if (!tenant) {
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้เช่า' });
      }

      const vehicle = await billingService.prisma.vehicle.findFirst({ where: { id, tenantId: tenant.id } });
      if (!vehicle) {
        return res.status(404).json({ success: false, message: 'ไม่พบยานพาหนะนี้' });
      }
      if (vehicle.status !== 'PENDING') {
        return res.status(400).json({ success: false, message: 'ลบได้เฉพาะรายการที่ยังรออนุมัติเท่านั้น' });
      }

      await billingService.prisma.vehicle.delete({ where: { id } });
      return res.status(200).json({ success: true, message: 'ลบยานพาหนะเรียบร้อยแล้ว' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ลูกบ้านแจ้งแขก/ผู้มาเยือนล่วงหน้า (POST /api/v1/liff/visitors)
   */
  async createVisitor(req, res, next) {
    try {
      const { visitorName, licensePlate, expectedDate, note } = req.body;

      if (!visitorName || !expectedDate) {
        return res.status(400).json({ success: false, message: 'กรุณาระบุ visitorName และ expectedDate ให้ครบถ้วน' });
      }

      const tenant = await resolveTenant(req);
      if (!tenant) {
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้เช่า' });
      }

      const buildingId = tenant.rooms?.[0]?.buildingId;
      if (!buildingId) {
        return res.status(400).json({ success: false, message: 'ไม่พบข้อมูลห้องพัก/ตึกของผู้เช่า' });
      }

      const toggle = await billingService.prisma.featureToggle.findFirst({
        where: { key: 'ENABLE_VEHICLE_MANAGEMENT', buildingId }
      });
      if (toggle && !toggle.isActive) {
        return res.status(403).json({ success: false, message: 'ฟีเจอร์จัดการยานพาหนะ/แขกถูกปิดใช้งานสำหรับตึกนี้' });
      }

      const visitor = await billingService.prisma.visitor.create({
        data: {
          buildingId,
          tenantId: tenant.id,
          visitorName,
          licensePlate: licensePlate || null,
          expectedDate: new Date(expectedDate),
          note: note || null
        }
      });

      return res.status(201).json({ success: true, message: 'แจ้งข้อมูลแขกเรียบร้อยแล้ว', data: visitor });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ลูกบ้านดูรายการแขกของตัวเอง (GET /api/v1/liff/visitors/mine)
   */
  async getMyVisitors(req, res, next) {
    try {
      const tenant = await resolveTenant(req);
      if (!tenant) {
        return res.status(200).json({ success: true, data: [] });
      }
      const visitors = await billingService.prisma.visitor.findMany({
        where: { tenantId: tenant.id },
        orderBy: { expectedDate: 'desc' }
      });
      return res.status(200).json({ success: true, data: visitors });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ลูกบ้านลบ/ยกเลิกข้อมูลแขกของตัวเอง (DELETE /api/v1/liff/visitors/:id)
   * เช็ค tenantId ให้ตรงกับเจ้าของก่อนเสมอ ป้องกันลบข้อมูลของคนอื่น (IDOR)
   */
  async deleteMyVisitor(req, res, next) {
    try {
      const { id } = req.params;
      const tenant = await resolveTenant(req);
      if (!tenant) {
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้เช่า' });
      }

      const visitor = await billingService.prisma.visitor.findFirst({ where: { id, tenantId: tenant.id } });
      if (!visitor) {
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลแขกนี้' });
      }

      await billingService.prisma.visitor.delete({ where: { id } });
      return res.status(200).json({ success: true, message: 'ลบข้อมูลแขกเรียบร้อยแล้ว' });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new VehicleController();
