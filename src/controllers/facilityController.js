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

class FacilityController {
  /**
   * แอดมินดึงรายการพื้นที่ส่วนกลางของตึก (GET /api/admin/buildings/:buildingId/facilities)
   */
  async getFacilitiesForAdmin(req, res, next) {
    try {
      const { buildingId } = req.params;
      const facilities = await billingService.prisma.facility.findMany({
        where: { buildingId },
        orderBy: { createdAt: 'desc' }
      });
      return res.status(200).json({ success: true, data: facilities });
    } catch (error) {
      next(error);
    }
  }

  /**
   * แอดมินสร้างพื้นที่ส่วนกลางใหม่ (POST /api/admin/buildings/:buildingId/facilities)
   */
  async createFacility(req, res, next) {
    try {
      const { buildingId } = req.params;
      const { name, description, imageUrl } = req.body;

      if (!name) {
        return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อพื้นที่ส่วนกลาง' });
      }

      const facility = await billingService.prisma.facility.create({
        data: { buildingId, name, description: description || null, imageUrl: imageUrl || null }
      });

      return res.status(201).json({ success: true, message: `เพิ่มพื้นที่ส่วนกลาง "${name}" เรียบร้อยแล้ว`, data: facility });
    } catch (error) {
      next(error);
    }
  }

  /**
   * แอดมินแก้ไขพื้นที่ส่วนกลาง (PATCH /api/admin/facilities/:id)
   */
  async updateFacility(req, res, next) {
    try {
      const { id } = req.params;
      const { name, description, imageUrl, isActive } = req.body;

      const facility = await billingService.prisma.facility.findUnique({ where: { id } });
      if (!facility) {
        return res.status(404).json({ success: false, message: 'ไม่พบพื้นที่ส่วนกลางที่ต้องการแก้ไข' });
      }

      const updated = await billingService.prisma.facility.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(imageUrl !== undefined ? { imageUrl } : {}),
          ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {})
        }
      });

      return res.status(200).json({ success: true, message: 'อัปเดตพื้นที่ส่วนกลางเรียบร้อยแล้ว', data: updated });
    } catch (error) {
      next(error);
    }
  }

  /**
   * แอดมินลบพื้นที่ส่วนกลาง (DELETE /api/admin/facilities/:id)
   */
  async deleteFacility(req, res, next) {
    try {
      const { id } = req.params;
      const facility = await billingService.prisma.facility.findUnique({ where: { id } });
      if (!facility) {
        return res.status(404).json({ success: false, message: 'ไม่พบพื้นที่ส่วนกลางที่ต้องการลบ' });
      }
      await billingService.prisma.facility.delete({ where: { id } });
      return res.status(200).json({ success: true, message: `ลบพื้นที่ส่วนกลาง "${facility.name}" เรียบร้อยแล้ว` });
    } catch (error) {
      next(error);
    }
  }

  /**
   * แอดมินดึงรายการจองทั้งหมดของตึก (GET /api/admin/buildings/:buildingId/facility-bookings)
   */
  async getBookingsForAdmin(req, res, next) {
    try {
      const { buildingId } = req.params;
      const bookings = await billingService.prisma.facilityBooking.findMany({
        where: { buildingId },
        orderBy: { startTime: 'desc' },
        include: { facility: true, tenant: true }
      });
      return res.status(200).json({ success: true, data: bookings });
    } catch (error) {
      next(error);
    }
  }

  /**
   * แอดมินยกเลิกการจองของใครก็ได้ (PATCH /api/admin/facility-bookings/:id)
   */
  async cancelBookingByAdmin(req, res, next) {
    try {
      const { id } = req.params;
      const booking = await billingService.prisma.facilityBooking.findUnique({ where: { id } });
      if (!booking) {
        return res.status(404).json({ success: false, message: 'ไม่พบรายการจองที่ต้องการยกเลิก' });
      }
      const updated = await billingService.prisma.facilityBooking.update({
        where: { id },
        data: { status: 'CANCELLED' }
      });
      return res.status(200).json({ success: true, message: 'ยกเลิกการจองเรียบร้อยแล้ว', data: updated });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ลูกบ้านดึงรายการพื้นที่ส่วนกลางที่จองได้ในตึกของตัวเอง (GET /api/v1/liff/facilities)
   */
  async getFacilitiesForLiff(req, res, next) {
    try {
      const tenant = await resolveTenant(req);
      const buildingId = tenant?.rooms?.[0]?.buildingId;
      if (!buildingId) {
        return res.status(200).json({ success: true, data: [] });
      }
      const facilities = await billingService.prisma.facility.findMany({
        where: { buildingId, isActive: true },
        orderBy: { name: 'asc' }
      });
      return res.status(200).json({ success: true, data: facilities });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ลูกบ้านดูรายการที่ถูกจองไปแล้วของพื้นที่ส่วนกลางในวันที่ระบุ (เพื่อโชว์ช่วงเวลาที่ว่าง) (GET /api/v1/liff/facilities/:id/bookings?date=)
   */
  async getFacilityBookingsForLiff(req, res, next) {
    try {
      const { id } = req.params;
      const { date } = req.query;

      const where = { facilityId: id, status: 'CONFIRMED' };
      if (date) {
        const dayStart = new Date(`${date}T00:00:00`);
        const dayEnd = new Date(`${date}T23:59:59.999`);
        where.startTime = { lte: dayEnd };
        where.endTime = { gte: dayStart };
      }

      const bookings = await billingService.prisma.facilityBooking.findMany({
        where,
        select: { id: true, startTime: true, endTime: true }
      });
      return res.status(200).json({ success: true, data: bookings });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ลูกบ้านจองพื้นที่ส่วนกลาง พร้อมเช็คช่วงเวลาซ้อนทับ (POST /api/v1/liff/facility-bookings)
   * ห้ามรับ tenantId จาก Client ตรง ๆ (IDOR) ต้อง derive จาก req.tenantId/req.lineUserId ที่ verify แล้วเท่านั้น
   */
  async createBookingForLiff(req, res, next) {
    try {
      const { facilityId, startTime, endTime, notes } = req.body;

      if (!facilityId || !startTime || !endTime) {
        return res.status(400).json({ success: false, message: 'กรุณาระบุ facilityId, startTime และ endTime ให้ครบถ้วน' });
      }

      const start = new Date(startTime);
      const end = new Date(endTime);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
        return res.status(400).json({ success: false, message: 'ช่วงเวลาไม่ถูกต้อง (startTime ต้องอยู่ก่อน endTime)' });
      }
      if (start < new Date()) {
        return res.status(400).json({ success: false, message: 'ไม่สามารถจองย้อนหลังได้' });
      }

      const tenant = await resolveTenant(req);
      if (!tenant) {
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้เช่า' });
      }

      const facility = await billingService.prisma.facility.findUnique({ where: { id: facilityId } });
      if (!facility || !facility.isActive) {
        return res.status(404).json({ success: false, message: 'ไม่พบพื้นที่ส่วนกลางที่ต้องการจอง' });
      }

      // เช็ค FeatureToggle ของตึกผู้เช่า (inline แทนการทำ middleware แยก เพราะต้อง resolve tenant->room->building ก่อน)
      const toggle = await billingService.prisma.featureToggle.findFirst({
        where: { key: 'ENABLE_FACILITY_BOOKING', buildingId: facility.buildingId }
      });
      if (toggle && !toggle.isActive) {
        return res.status(403).json({ success: false, message: 'ฟีเจอร์จองพื้นที่ส่วนกลางถูกปิดใช้งานสำหรับตึกนี้' });
      }

      // เช็คช่วงเวลาซ้อนทับ (Interval Overlap: A.start < B.end AND A.end > B.start)
      const conflict = await billingService.prisma.facilityBooking.findFirst({
        where: {
          facilityId,
          status: 'CONFIRMED',
          startTime: { lt: end },
          endTime: { gt: start }
        }
      });
      if (conflict) {
        return res.status(409).json({ success: false, message: 'ช่วงเวลานี้ถูกจองแล้ว กรุณาเลือกเวลาอื่น' });
      }

      const booking = await billingService.prisma.facilityBooking.create({
        data: {
          facilityId,
          buildingId: facility.buildingId,
          tenantId: tenant.id,
          startTime: start,
          endTime: end,
          notes: notes || null
        },
        include: { facility: true }
      });

      if (tenant.lineUserId) {
        await lineService.pushFacilityBookingNotification(tenant.lineUserId, booking);
      }

      return res.status(201).json({ success: true, message: `จอง "${facility.name}" เรียบร้อยแล้ว`, data: booking });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ลูกบ้านดูรายการจองของตัวเอง (GET /api/v1/liff/facility-bookings/mine)
   */
  async getMyBookings(req, res, next) {
    try {
      const tenant = await resolveTenant(req);
      if (!tenant) {
        return res.status(200).json({ success: true, data: [] });
      }
      const bookings = await billingService.prisma.facilityBooking.findMany({
        where: { tenantId: tenant.id },
        orderBy: { startTime: 'desc' },
        include: { facility: true }
      });
      return res.status(200).json({ success: true, data: bookings });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ลูกบ้านยกเลิกการจองของตัวเอง (DELETE /api/v1/liff/facility-bookings/:id)
   * เช็ค tenantId ให้ตรงกับเจ้าของก่อนเสมอ ป้องกันยกเลิกการจองของคนอื่น (IDOR)
   */
  async cancelMyBooking(req, res, next) {
    try {
      const { id } = req.params;
      const tenant = await resolveTenant(req);
      if (!tenant) {
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้เช่า' });
      }

      const booking = await billingService.prisma.facilityBooking.findFirst({
        where: { id, tenantId: tenant.id }
      });
      if (!booking) {
        return res.status(404).json({ success: false, message: 'ไม่พบรายการจองนี้' });
      }

      const updated = await billingService.prisma.facilityBooking.update({
        where: { id },
        data: { status: 'CANCELLED' }
      });

      return res.status(200).json({ success: true, message: 'ยกเลิกการจองเรียบร้อยแล้ว', data: updated });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new FacilityController();
