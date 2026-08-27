const billingService = require('../services/billingService');
const lineService = require('../services/lineService');

class MaintenanceController {
  /**
   * ดึงรายการแจ้งซ่อมทั้งหมดสำหรับ Admin
   */
  async getMaintenanceRequests(req, res, next) {
    try {
      const { status, roomId, buildingId } = req.query;

      const where = {};
      if (status) where.status = status;
      if (roomId) where.roomId = roomId;
      if (buildingId) where.room = { buildingId };

      const requests = await billingService.prisma.maintenanceRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { room: true }
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
      const { lineUserId, roomId } = req.query;

      let tenantRoomId = roomId;

      if (!tenantRoomId && lineUserId) {
        const tenant = await billingService.prisma.tenant.findUnique({
          where: { lineUserId },
          include: { rooms: true }
        });
        if (tenant?.rooms?.length > 0) {
          tenantRoomId = tenant.rooms[0].id;
        }
      }

      const where = tenantRoomId ? { roomId: tenantRoomId } : {};

      const requests = await billingService.prisma.maintenanceRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { room: true }
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
   * บันทึกรายการแจ้งซ่อมใหม่ (รองรับการอัปโหลดไฟล์รูปภาพ)
   */
  async createMaintenanceRequest(req, res, next) {
    try {
      const { title, description, roomId, lineUserId } = req.body;

      if (!title || !description) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: title and description'
        });
      }

      let targetRoomId = roomId;

      // หากไม่ได้ระบุ roomId ให้ค้นหาจาก lineUserId ของผู้เช่า
      if (!targetRoomId && lineUserId) {
        const tenant = await billingService.prisma.tenant.findUnique({
          where: { lineUserId },
          include: { rooms: true }
        });
        if (tenant?.rooms?.length > 0) {
          targetRoomId = tenant.rooms[0].id;
        }
      }

      if (!targetRoomId) {
        // Fallback หาห้องแรกถ้าทดสอบในระบบ
        const firstRoom = await billingService.prisma.room.findFirst({ where: { status: 'occupied' } });
        targetRoomId = firstRoom?.id;
      }

      let imageUrl = req.body.imageUrl || null;
      if (req.file) {
        const protocol = req.protocol;
        const host = req.get('host');
        imageUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
      }

      const newRequest = await billingService.prisma.maintenanceRequest.create({
        data: {
          roomId: targetRoomId,
          title,
          description,
          imageUrl,
          status: 'pending'
        },
        include: { room: true }
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
   * แอดมินอัปเดตสถานะการแจ้งซ่อม (pending -> in_progress -> resolved) พร้อมหมายเหตุ และยิง LINE Push Notification
   */
  async updateMaintenanceStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, adminNote } = req.body;

      const request = await billingService.prisma.maintenanceRequest.findUnique({
        where: { id },
        include: { room: { include: { tenant: true } } }
      });

      if (!request) {
        return res.status(404).json({ success: false, message: 'Maintenance request not found' });
      }

      const updatedRequest = await billingService.prisma.maintenanceRequest.update({
        where: { id },
        data: {
          status: status || request.status,
          adminNote: adminNote !== undefined ? adminNote : request.adminNote
        },
        include: { room: { include: { tenant: true } } }
      });

      // ยิง LINE Push Notification แจ้งเตือนลูกบ้านเมื่อสถานะเปลี่ยน
      if (updatedRequest.room?.tenant?.lineUserId) {
        await lineService.sendMaintenanceStatusNotification(
          updatedRequest.room.tenant.lineUserId,
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
   * แอดมินลบรายการแจ้งซ่อม (Delete Maintenance Request)
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
