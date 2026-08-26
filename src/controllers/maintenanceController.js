const billingService = require('../services/billingService');

class MaintenanceController {
  /**
   * ดึงรายการแจ้งซ่อมทั้งหมด
   */
  async getMaintenanceRequests(req, res, next) {
    try {
      const { roomId, status } = req.query;

      const where = {};
      if (roomId) where.roomId = roomId;
      if (status) where.status = status;

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
   * สร้างรายการแจ้งซ่อมใหม่ (รองรับการแนบรูปภาพ)
   */
  async createMaintenanceRequest(req, res, next) {
    try {
      const { roomId, title, description, imageUrl } = req.body;

      if (!roomId || !title || !description) {
        return res.status(400).json({
          success: false,
          message: 'กรุณากรอก roomId, title และ description ให้ครบถ้วน'
        });
      }

      const room = await billingService.prisma.room.findUnique({ where: { id: roomId } });
      if (!room) {
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลห้องพัก' });
      }

      const maintenanceRequest = await billingService.prisma.maintenanceRequest.create({
        data: {
          roomId,
          title,
          description,
          imageUrl: imageUrl || null,
          status: 'pending'
        }
      });

      return res.status(201).json({
        success: true,
        message: 'บันทึกข้อมูลการแจ้งซ่อมเรียบร้อยแล้ว',
        data: maintenanceRequest
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * อัปเดตสถานะการแจ้งซ่อม (pending, in_progress, completed, cancelled)
   */
  async updateMaintenanceStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const request = await billingService.prisma.maintenanceRequest.findUnique({ where: { id } });
      if (!request) {
        return res.status(404).json({ success: false, message: 'ไม่พบรายการแจ้งซ่อมนี้' });
      }

      const updated = await billingService.prisma.maintenanceRequest.update({
        where: { id },
        data: { status }
      });

      return res.status(200).json({
        success: true,
        message: `อัปเดตสถานะเป็น ${status} เรียบร้อยแล้ว`,
        data: updated
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new MaintenanceController();
