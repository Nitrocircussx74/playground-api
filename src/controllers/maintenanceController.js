const { resolveListBuildings } = require('../middlewares/buildingAccessMiddleware');
const billingService = require('../services/billingService');
const { roomScopedWhere, hasRoomScope } = require('../utils/roomScope');
const { isFeatureEnabled } = require('../middlewares/requireFeatureMiddleware');
const lineService = require('../services/lineService');
const publicUrl = require('../utils/publicUrl');

class MaintenanceController {
  /**
   * ดึงรายการแจ้งซ่อมทั้งหมดสำหรับ Admin (GET /api/admin/buildings/:buildingId/maintenance & GET /api/v1/maintenance-requests)
   */
  async getMaintenanceRequests(req, res, next) {
    try {
      const { status, roomId, buildingId } = req.query;
      const userRole = (req.user?.role || '').toLowerCase();
      const userId = req.user?.id;

      const where = {};
      if (status) where.status = status;
      if (roomId) where.roomId = roomId;

      if (userRole === 'tenant') {
        where.tenantId = req.user?.tenantId || req.user?.id || 'none';
      } else if (['room_owner', 'investor'].includes(userRole) && userId) {
        where.room = {
          ownerId: userId,
          ...(buildingId && { buildingId })
        };
      } else {
        const scope = await resolveListBuildings(req.user, buildingId || req.params.buildingId);
        if (scope.forbidden) {
          return res.status(403).json({ success: false, message: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลของอาคาร/ตึกนี้' });
        }
        if (scope.ids) {
          where.OR = [
            { buildingId: { in: scope.ids } },
            { room: { buildingId: { in: scope.ids } } }
          ];
        }
      }

      const requests = await billingService.prisma.maintenanceRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          room: true,
          tenant: true,
          building: true
        }
      });

      return res.status(200).json({
        success: true,
        data: requests
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ดึงรายการแจ้งซ่อมย้อนหลังของผู้เช่าสำหรับ LIFF App (รองรับ Multi-Room Tenancy)
   */
  async getMaintenanceRequestsForLiff(req, res, next) {
    try {
      // เฉพาะใบแจ้งซ่อมของห้องที่เลือกอยู่ (req.roomId ตรวจสิทธิ์แล้วใน scopeTenantRooms) รวมใบงานที่แอดมินเปิดให้ห้องนี้
      if (!hasRoomScope(req)) {
        return res.status(200).json({ success: true, data: [] });
      }

      const requests = await billingService.prisma.maintenanceRequest.findMany({
        where: roomScopedWhere(req, { includeUnassigned: true }),
        orderBy: { createdAt: 'desc' },
        include: {
          room: { include: { building: true } },
          tenant: true,
          building: true
        }
      });

      return res.status(200).json({
        success: true,
        data: requests
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * บันทึกรายการแจ้งซ่อมใหม่ (POST /api/liff/maintenance & POST /api/v1/maintenance-requests)
   */
  async createMaintenanceRequest(req, res, next) {
    try {
      const { title, description } = req.body;

      if (!title || !description) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: title and description'
        });
      }

      // req.scope มีเฉพาะ Route ฝั่งลูกบ้าน (LIFF, ผ่าน scopeTenantRooms): ตัวตน/ห้อง/ตึกมาจาก Token ที่ตรวจแล้วเท่านั้น
      // ไม่เชื่อ roomId/tenantId/buildingId ใน Body และลูกบ้านกำหนดผู้จ่าย/ค่าซ่อม/ช่างเองไม่ได้ (ค่าซ่อมจะถูกรวมเข้าบิลของห้องนั้น)
      // Route แอดมิน (requireRole + requireBuildingInRequest) ต้องระบุห้องเสมอ เดิม fallback ไปห้องแรกที่มีคนอยู่ในระบบ
      const isTenantFlow = Boolean(req.scope);
      const { technicianName, repairCost, payer } = isTenantFlow ? {} : req.body;

      if (payer !== undefined && !['MANAGEMENT', 'TENANT'].includes(payer)) {
        return res.status(400).json({
          success: false,
          message: 'payer ต้องเป็น MANAGEMENT หรือ TENANT เท่านั้น'
        });
      }

      const targetRoomId = isTenantFlow ? req.roomId : req.body.roomId;
      if (!targetRoomId) {
        return res.status(400).json({
          success: false,
          message: isTenantFlow ? 'ยังไม่พบห้องพักที่ผูกกับบัญชีนี้' : 'กรุณาระบุ roomId'
        });
      }

      const roomObj = await billingService.prisma.room.findUnique({ where: { id: targetRoomId } });
      if (!roomObj) {
        return res.status(404).json({ success: false, message: 'ไม่พบห้องพักที่ระบุ' });
      }
      const buildingId = roomObj.buildingId;
      const tenantId = isTenantFlow ? req.scope.tenantId : req.body.tenantId || roomObj.tenantId || null;

      // บล็อกเฉพาะคำขอจากลูกบ้านผ่าน LIFF แอดมินยังเปิดใบงานเองได้แม้ปิดฟีเจอร์ฝั่งลูกบ้าน
      if (req.originalUrl.includes('/liff/') && !(await isFeatureEnabled('ENABLE_MAINTENANCE_REQUEST', buildingId || null))) {
        return res.status(403).json({ success: false, message: 'ฟีเจอร์แจ้งซ่อมและร้องเรียนถูกปิดใช้งานสำหรับตึกนี้' });
      }

      let imageUrl = req.body.photoUrl || req.body.imageUrl || null;
      if (req.file) {
        imageUrl = publicUrl(req, req.file.filename);
      }

      const newRequest = await billingService.prisma.maintenanceRequest.create({
        data: {
          roomId: targetRoomId,
          tenantId,
          buildingId,
          title,
          description,
          imageUrl,
          photoUrl: imageUrl,
          technicianName: technicianName || null,
          repairCost: repairCost ? Number(repairCost) : 0,
          payer: payer || 'MANAGEMENT',
          status: 'pending'
        },
        include: {
          room: true,
          tenant: true,
          building: true
        }
      });

      // 🔔 บันทึกแจ้งเตือน In-App ให้แอดมินเห็นในกระดิ่ง (ไม่ส่ง LINE เพราะแอดมินไม่ได้ผูก lineUserId)
      lineService.logDelivery({
        buildingId,
        tenantId,
        roomId: targetRoomId,
        notificationType: 'MAINTENANCE_NEW',
        messagePreview: `แจ้งซ่อมใหม่: ${title}${newRequest.room?.roomNumber ? ` (ห้อง ${newRequest.room.roomNumber})` : ''}`
      }).catch(() => {});

      return res.status(201).json({
        success: true,
        message: 'บันทึกข้อมูลการแจ้งซ่อมเรียบร้อยแล้ว',
        data: newRequest
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * แอดมินอัปเดตสถานะการแจ้งซ่อม (PATCH /api/admin/maintenance/:id & PUT /api/v1/maintenance-requests/:id)
   * รองรับการใส่ชื่อช่าง ค่าซ่อม หมายเหตุ และส่ง LINE Push Notification แจ้งเตือนลูกบ้านทันที
   */
  async updateMaintenanceStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, adminNote, technicianName, repairCost, payer } = req.body;

      if (payer !== undefined && !['MANAGEMENT', 'TENANT'].includes(payer)) {
        return res.status(400).json({
          success: false,
          message: 'payer ต้องเป็น MANAGEMENT หรือ TENANT เท่านั้น'
        });
      }

      const request = await billingService.prisma.maintenanceRequest.findUnique({
        where: { id },
        include: {
          room: { include: { tenant: true } },
          tenant: true
        }
      });

      if (!request) {
        return res.status(404).json({ success: false, message: 'Maintenance request not found' });
      }

      // ถ้าค่าซ่อมนี้ถูกรวมเข้าบิลไปแล้ว ห้ามแก้ "ค่า" ของค่าซ่อม/ผู้จ่ายให้ต่างไปจากเดิม เพราะจะไม่ตรงกับยอดที่ออกบิลไปแล้วจริง
      // (เทียบเฉพาะกรณีค่าที่ส่งมาต่างจากของเดิมเท่านั้น ไม่บล็อกการอัปเดตฟิลด์อื่น เช่น status/adminNote ตามปกติ)
      const repairCostChanged = repairCost !== undefined && Number(repairCost) !== Number(request.repairCost);
      const payerChanged = payer !== undefined && payer !== request.payer;
      if (request.billedInvoiceId && (repairCostChanged || payerChanged)) {
        return res.status(400).json({
          success: false,
          message: 'ค่าซ่อมนี้ถูกรวมเข้าบิลไปแล้ว ไม่สามารถแก้ไขค่าซ่อมหรือผู้รับผิดชอบค่าใช้จ่ายได้ กรุณาแก้ไขที่ใบแจ้งหนี้แทน'
        });
      }

      const nextStatus = status || request.status;
      let resolvedAt = request.resolvedAt;

      if (nextStatus.toLowerCase() === 'resolved' || nextStatus.toLowerCase() === 'completed') {
        resolvedAt = new Date();
      } else if (nextStatus.toLowerCase() === 'pending' || nextStatus.toLowerCase() === 'in_progress') {
        resolvedAt = null;
      }

      const updatedRequest = await billingService.prisma.maintenanceRequest.update({
        where: { id },
        data: {
          status: nextStatus,
          adminNote: adminNote !== undefined ? adminNote : request.adminNote,
          technicianName: technicianName !== undefined ? technicianName : request.technicianName,
          repairCost: repairCost !== undefined ? Number(repairCost) : request.repairCost,
          payer: payer !== undefined ? payer : request.payer,
          resolvedAt
        },
        include: {
          room: { include: { tenant: true } },
          tenant: true,
          building: true
        }
      });

      // ยิง LINE Push Notification แจ้งเตือนลูกบ้านเมื่อมีการอัปเดตสถานะ
      const recipientLineId = updatedRequest.tenant?.lineUserId || updatedRequest.room?.tenant?.lineUserId;
      if (recipientLineId) {
        await lineService.sendMaintenanceStatusNotification(
          recipientLineId,
          updatedRequest
        );
      }

      return res.status(200).json({
        success: true,
        message: `อัปเดตสถานะแจ้งซ่อมเป็น ${updatedRequest.status} เรียบร้อยแล้ว`,
        data: updatedRequest
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ดึงรายละเอียดรายการแจ้งซ่อมตาม ID (GET /api/v1/maintenance-requests/:id & GET /api/liff/issues/:id)
   */
  async getMaintenanceRequestById(req, res, next) {
    try {
      const { id } = req.params;
      const request = await billingService.prisma.maintenanceRequest.findUnique({
        where: { id },
        include: {
          room: true,
          tenant: true,
          building: true
        }
      });

      if (!request) {
        return res.status(404).json({ success: false, message: 'Maintenance request not found' });
      }

      return res.status(200).json({
        success: true,
        data: request
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * แอดมินลบรายการแจ้งซ่อม (DELETE /api/admin/maintenance/:id)
   */
  async deleteMaintenanceRequest(req, res, next) {
    try {
      const { id } = req.params;
      const request = await billingService.prisma.maintenanceRequest.findUnique({ where: { id } });

      if (!request) {
        return res.status(404).json({ success: false, message: 'ไม่พบรายการแจ้งซ่อมที่ต้องการลบ' });
      }

      await billingService.prisma.maintenanceRequest.delete({ where: { id } });

      return res.status(200).json({
        success: true,
        message: 'ลบรายการแจ้งซ่อมเรียบร้อยแล้ว'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new MaintenanceController();
