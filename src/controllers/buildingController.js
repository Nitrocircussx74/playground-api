const billingService = require('../services/billingService');
const lineService = require('../services/lineService');

class BuildingController {
  /**
   * ดึงรายการอาคาร/ตึกทั้งหมดในระบบ
   */
  async getBuildings(req, res, next) {
    try {
      const userRole = (req.user?.role || '').toLowerCase();
      const userId = req.user?.id;

      const isSuperAdmin = ['super_admin', 'superadmin', 'owner'].includes(userRole);
      let where = {};

      if (!isSuperAdmin && userId) {
        const permissions = await billingService.prisma.userBuildingPermission.findMany({
          where: { userId },
          select: { buildingId: true }
        });
        const allowedBuildingIds = permissions.map((p) => p.buildingId);
        where = { id: { in: allowedBuildingIds } };
      }

      const buildings = await billingService.prisma.building.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        include: {
          setting: true,
          _count: {
            select: { rooms: true }
          }
        }
      });

      return res.status(200).json({
        success: true,
        data: buildings
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * สร้างตึก/อาคารใหม่ในระบบ
   */
  async createBuilding(req, res, next) {
    try {
      const { name, address, themeColor, logoUrl, promptpayNum, paymentQrUrl } = req.body;

      if (!name) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาระบุชื่ออาคาร/ตึก (Building Name)'
        });
      }

      const building = await billingService.prisma.building.create({
        data: {
          name,
          address: address || null,
          themeColor: themeColor || '#0E7490',
          logoUrl: logoUrl || null,
          setting: {
            create: {
              promptpayNum: promptpayNum || null,
              paymentQrUrl: paymentQrUrl || null
            }
          }
        },
        include: {
          setting: true
        }
      });

      return res.status(201).json({
        success: true,
        message: `สร้างอาคาร ${building.name} เรียบร้อยแล้ว`,
        data: building
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ดึงข้อมูลและตั้งค่าของตึกตาม ID
   */
  async getBuildingById(req, res, next) {
    try {
      const { id } = req.params;

      const building = await billingService.prisma.building.findUnique({
        where: { id },
        include: {
          setting: true,
          rooms: {
            include: { tenant: true }
          }
        }
      });

      if (!building) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบข้อมูลอาคาร'
        });
      }

      return res.status(200).json({
        success: true,
        data: building
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * อัปเดตการตั้งค่าของตึกทั้ง 4 หมวดหมู่ (General, Payment, Billing, Rules)
   */
  async updateBuildingSetting(req, res, next) {
    try {
      const id = req.params.id || req.params.buildingId;
      const {
        // 1. General Info
        name,
        address,
        themeColor,
        logoUrl,
        phone,
        coverImageUrl,

        // 2. Payment Options
        paymentQrUrl,
        promptpayNum,
        bankName,
        bankAccountName,
        bankAccountNo,
        paymentNote,

        // 3. Billing & Utilities
        waterRate,
        electricRate,
        dueDateDay,
        latePenalty,
        lateFeeType,
        lateFeeAmount,
        gracePeriodDays,

        // 4. Rules & Contracts
        depositMonths,
        advanceMonths,
        termsAndConditions,

        // 5. LINE Official Account & LIFF Settings
        lineOaId,
        lineChannelAccessToken,
        lineChannelSecret,
        lineLiffId,
        lineAddFriendUrl
      } = req.body;

      const building = await billingService.prisma.building.findUnique({ where: { id } });
      if (!building) {
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลอาคาร' });
      }

      // 1. อัปเดตข้อมูลทั่วไปของตึก (Building)
      if (name || address !== undefined || themeColor !== undefined || logoUrl !== undefined) {
        await billingService.prisma.building.update({
          where: { id },
          data: {
            ...(name && { name }),
            ...(address !== undefined && { address }),
            ...(themeColor !== undefined && { themeColor }),
            ...(logoUrl !== undefined && { logoUrl })
          }
        });
      }

      // 2. อัปเดตหรือสร้าง BuildingSetting
      const settingData = {
        ...(phone !== undefined && { phone }),
        ...(coverImageUrl !== undefined && { coverImageUrl }),
        ...(paymentQrUrl !== undefined && { paymentQrUrl }),
        ...(promptpayNum !== undefined && { promptpayNum }),
        ...(bankName !== undefined && { bankName }),
        ...(bankAccountName !== undefined && { bankAccountName }),
        ...(bankAccountNo !== undefined && { bankAccountNo }),
        ...(paymentNote !== undefined && { paymentNote }),
        ...(waterRate !== undefined && { waterRate }),
        ...(electricRate !== undefined && { electricRate }),
        ...(dueDateDay !== undefined && { dueDateDay: parseInt(dueDateDay, 10) }),
        ...(latePenalty !== undefined && { latePenalty }),
        ...(lateFeeType !== undefined && { lateFeeType: lateFeeType.toUpperCase() }),
        ...(lateFeeAmount !== undefined && { lateFeeAmount }),
        ...(gracePeriodDays !== undefined && { gracePeriodDays: parseInt(gracePeriodDays, 10) }),
        ...(depositMonths !== undefined && { depositMonths: parseInt(depositMonths, 10) }),
        ...(advanceMonths !== undefined && { advanceMonths: parseInt(advanceMonths, 10) }),
        ...(termsAndConditions !== undefined && { termsAndConditions }),
        ...(lineOaId !== undefined && { lineOaId: lineOaId?.trim() || null }),
        ...(lineChannelAccessToken !== undefined && { lineChannelAccessToken: lineChannelAccessToken?.trim() || null }),
        ...(lineChannelSecret !== undefined && { lineChannelSecret: lineChannelSecret?.trim() || null }),
        ...(lineLiffId !== undefined && { lineLiffId: lineLiffId?.trim() || null }),
        ...(lineAddFriendUrl !== undefined && { lineAddFriendUrl: lineAddFriendUrl?.trim() || null })
      };

      const setting = await billingService.prisma.buildingSetting.upsert({
        where: { buildingId: id },
        update: settingData,
        create: {
          buildingId: id,
          ...settingData
        }
      });

      const updatedBuilding = await billingService.prisma.building.findUnique({
        where: { id },
        include: { setting: true }
      });

      return res.status(200).json({
        success: true,
        message: 'อัปเดตข้อมูลการตั้งค่าตึกสำเร็จ',
        data: {
          ...updatedBuilding,
          ...setting
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Alias สำหรับ GET /api/v1/buildings/:buildingId/settings หรือ /api/admin/buildings/:buildingId/settings
   */
  async getBuildingSettings(req, res, next) {
    req.params.id = req.params.buildingId || req.params.id;
    return this.getBuildingById(req, res, next);
  }

  /**
   * ดึงข้อมูลโควต้าและการใช้งาน LINE OA ประจำตึก (LINE Messaging Quota Monitor)
   * GET /api/admin/buildings/:id/line-quota หรือ GET /api/v1/buildings/:id/line-quota
   */
  async getLineQuota(req, res, next) {
    try {
      const buildingId = req.params.id || req.params.buildingId;
      const data = await lineService.getMessageQuota(buildingId);

      return res.status(200).json({
        success: true,
        data
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ดึงประวัติการส่งแจ้งเตือน LINE ประจำตึก (LINE Delivery Logs)
   * GET /api/admin/buildings/:id/notification-logs
   */
  async getNotificationLogs(req, res, next) {
    try {
      const buildingId = req.params.id || req.params.buildingId;
      const { page, limit, status, notificationType, search } = req.query;

      const result = await lineService.getNotificationLogs({
        buildingId,
        page,
        limit,
        status,
        notificationType,
        search
      });

      return res.status(200).json({
        success: true,
        data: result.logs,
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /:buildingId/reports/monthly-csv?cycle=09-2026
   * Export สรุปรายได้รายเดือนเป็น CSV (ไม่ต้องใช้ library เพิ่ม)
   */
  async exportMonthlyCsv(req, res, next) {
    try {
      const { buildingId } = req.params;
      const cycle = req.query.cycle;

      if (!cycle) {
        return res.status(400).json({ success: false, message: 'กรุณาระบุ cycle เช่น 09-2026' });
      }

      const prisma = require('../config/prisma');
      const invoices = await prisma.invoice.findMany({
        where: { room: { buildingId }, billingCycle: cycle },
        include: { room: true, tenant: true },
        orderBy: [{ room: { roomNumber: 'asc' } }]
      });

      const header = 'ห้อง,ชั้น,ผู้เช่า,เบอร์โทร,ค่าเช่า,ค่าน้ำ,ค่าไฟ,ค่าส่วนกลาง,อื่นๆ,ค่าปรับ,ยอดรวม,สถานะ,ครบกำหนด';
      const rows = invoices.map((inv) => {
        const name = inv.tenant ? `${inv.tenant.firstName} ${inv.tenant.lastName}` : '-';
        const phone = inv.tenant?.phone || '';
        const due = inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('th-TH') : '';
        const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
        return [
          escape(inv.room?.roomNumber || ''),
          inv.room?.floor || '',
          escape(name),
          phone,
          Number(inv.roomPrice || 0),
          Number(inv.waterTotal || 0),
          Number(inv.electricTotal || 0),
          Number(inv.commonFee || 0),
          Number(inv.otherFee || 0),
          Number(inv.lateFeeCharge || 0),
          Number(inv.grandTotal || 0),
          inv.status,
          due
        ].join(',');
      });

      const csv = [header, ...rows].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="report-${cycle}.csv"`);
      return res.send('\uFEFF' + csv); // BOM เพื่อ Excel อ่านภาษาไทยถูก
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new BuildingController();
