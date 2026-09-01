const billingService = require('../services/billingService');
const lineService = require('../services/lineService');

class MaintenanceController {
  /**
   * ดึงรายการแจ้งซ่อมทั้งหมดสำหรับ Admin (GET /api/admin/buildings/:buildingId/maintenance & GET /api/v1/maintenance-requests)
   */
  async getMaintenanceRequests(req, res, next) {
    try {
      const { status, roomId, buildingId } = req.query;

      const where = {};
      if (status) where.status = status;
      if (roomId) where.roomId = roomId;

      const targetBuildingId = buildingId || req.params.buildingId;
      if (targetBuildingId) {
        where.OR = [
          { buildingId: targetBuildingId },
          { room: { buildingId: targetBuildingId } }
        ];
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
   * ดึงรายการแจ้งซ่อมย้อนหลังของผู้เช่าสำหรับ LIFF App
   */
  async getMaintenanceRequestsForLiff(req, res, next) {
    try {
      // ห้ามรับ roomId จาก Client ตรง ๆ (IDOR) ต้อง derive จาก req.lineUserId ที่ verify แล้วเท่านั้น
      const lineUserId = req.lineUserId;

      const tenantRecord = await billingService.prisma.tenant.findUnique({
        where: { lineUserId },
        include: { rooms: true }
      });
      const tenantRoomId = tenantRecord?.rooms?.length > 0 ? tenantRecord.rooms[0].id : null;

      const where = {};
      if (tenantRoomId) {
        where.roomId = tenantRoomId;
      } else if (tenantRecord?.id) {
        where.tenantId = tenantRecord.id;
      } else {
        // ไม่พบผู้เช่าที่ผูกกับ lineUserId นี้เลย -> ไม่ส่งข้อมูลของใครทั้งสิ้น
        return res.status(200).json({ success: true, data: [] });
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
   * บันทึกรายการแจ้งซ่อมใหม่ (POST /api/liff/maintenance & POST /api/v1/maintenance-requests)
   */
  async createMaintenanceRequest(req, res, next) {
    try {
      const { title, description, roomId, lineUserId, technicianName, repairCost } = req.body;

      if (!title || !description) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: title and description'
        });
      }

      let targetRoomId = roomId;
      let tenantId = req.body.tenantId || null;
      let buildingId = req.body.buildingId || null;

      if (lineUserId) {
        const tenant = await billingService.prisma.tenant.findUnique({
          where: { lineUserId },
          include: { rooms: true }
        });
        if (tenant) {
          tenantId = tenant.id;
          if (!targetRoomId && tenant.rooms?.length > 0) {
            targetRoomId = tenant.rooms[0].id;
          }
        }
      }

      if (!targetRoomId) {
        const firstRoom = await billingService.prisma.room.findFirst({ where: { status: 'occupied' } });
        targetRoomId = firstRoom?.id;
      }

      if (targetRoomId && !buildingId) {
        const roomObj = await billingService.prisma.room.findUnique({ where: { id: targetRoomId } });
        buildingId = roomObj?.buildingId;
        if (!tenantId && roomObj?.tenantId) {
          tenantId = roomObj.tenantId;
        }
      }

      let imageUrl = req.body.photoUrl || req.body.imageUrl || null;
      if (req.file) {
        const protocol = req.protocol;
        const host = req.get('host');
        imageUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
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
          status: 'pending'
        },
        include: {
          room: true,
          tenant: true,
          building: true
        }
      });

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
      const { status, adminNote, technicianName, repairCost } = req.body;

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
