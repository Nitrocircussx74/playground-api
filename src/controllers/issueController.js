const billingService = require('../services/billingService');
const lineService = require('../services/lineService');

class IssueController {
  /**
   * ลูกบ้านแจ้งซ่อม/ร้องเรียนเรื่องใหม่
   * POST /api/liff/issues หรือ POST /api/v1/liff/issues
   */
  async createIssue(req, res, next) {
    try {
      const lineUserId = req.lineUserId;
      const tenantId = req.tenantId;

      let tenant = null;
      if (tenantId) {
        tenant = await billingService.prisma.tenant.findUnique({
          where: { id: tenantId },
          include: { rooms: { include: { building: true } } }
        });
      }
      if (!tenant && lineUserId) {
        tenant = await billingService.prisma.tenant.findUnique({
          where: { lineUserId },
          include: { rooms: { include: { building: true } } }
        });
      }

      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบข้อมูลผู้เช่าในระบบ กรุณาลงทะเบียนหรือเข้าสู่ระบบใหม่'
        });
      }

      let targetRoom = null;
      const requestedRoomId = req.body.roomId || req.body.room_id;
      if (requestedRoomId) {
        targetRoom = tenant.rooms.find((r) => r.id === requestedRoomId);
      }
      if (!targetRoom && tenant.rooms.length > 0) {
        targetRoom = tenant.rooms[0];
      }

      if (!targetRoom) {
        return res.status(400).json({
          success: false,
          message: 'ไม่พบข้อมูลห้องพักที่ผูกกับบัญชีของคุณ ไม่สามารถส่งเรื่องแจ้งเหตุได้'
        });
      }

      const { description, category } = req.body;
      if (!description || typeof description !== 'string' || !description.trim()) {
        return res.status(400).json({
          success: false,
          message: 'กรุณากรอกรายละเอียดของปัญหาที่ต้องการแจ้ง'
        });
      }

      const imageUrls = [];
      if (req.files && Array.isArray(req.files)) {
        for (const f of req.files) {
          imageUrls.push(`/uploads/${f.filename}`);
        }
      } else if (req.file) {
        imageUrls.push(`/uploads/${req.file.filename}`);
      }

      const issue = await billingService.prisma.issueTicket.create({
        data: {
          userId: tenant.id,
          roomId: targetRoom.id,
          buildingId: targetRoom.buildingId,
          category: (category || 'REPAIR').toUpperCase(),
          description: description.trim(),
          imageUrls,
          status: 'PENDING'
        },
        include: {
          room: true,
          building: true
        }
      });

      lineService.logDelivery({
        buildingId: targetRoom.buildingId,
        tenantId: tenant.id,
        roomId: targetRoom.id,
        notificationType: 'ISSUE_NEW',
        messagePreview: `แจ้งเหตุใหม่: [${issue.category}] ${issue.description.slice(0, 50)} (ห้อง ${targetRoom.roomNumber})`
      }).catch(() => {});

      return res.status(201).json({
        success: true,
        message: 'บันทึกการแจ้งเหตุเรียบร้อยแล้ว แอดมินจะดำเนินการตรวจสอบโดยเร็ว',
        data: issue
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ดึงประวัติการแจ้งเหตุของลูกบ้าน
   * GET /api/liff/issues หรือ GET /api/v1/liff/issues
   */
  async getIssuesForLiff(req, res, next) {
    try {
      const lineUserId = req.lineUserId;
      const tenantId = req.tenantId;

      let tenant = null;
      if (tenantId) {
        tenant = await billingService.prisma.tenant.findUnique({ where: { id: tenantId } });
      }
      if (!tenant && lineUserId) {
        tenant = await billingService.prisma.tenant.findUnique({ where: { lineUserId } });
      }

      if (!tenant) {
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้เช่า' });
      }

      const issues = await billingService.prisma.issueTicket.findMany({
        where: { userId: tenant.id },
        orderBy: { createdAt: 'desc' },
        include: { room: true, building: true }
      });

      return res.status(200).json({
        success: true,
        data: issues
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ดึงรายละเอียดของตั๋วแจ้งเหตุตาม ID
   * GET /api/liff/issues/:id
   */
  async getIssueDetail(req, res, next) {
    try {
      const { id } = req.params;
      const issue = await billingService.prisma.issueTicket.findUnique({
        where: { id },
        include: { room: true, building: true, user: true }
      });

      if (!issue) {
        return res.status(404).json({ success: false, message: 'ไม่พบรายการแจ้งเหตุที่ระบุ' });
      }

      return res.status(200).json({ success: true, data: issue });
    } catch (error) {
      next(error);
    }
  }

  /**
   * แอดมินดึงรายการแจ้งเหตุทั้งหมดในระบบ
   * GET /api/admin/issues
   */
  async getAllIssuesForAdmin(req, res, next) {
    try {
      const { buildingId, status, category } = req.query;
      const where = {};
      if (buildingId) where.buildingId = buildingId;
      if (status) where.status = status.toUpperCase();
      if (category) where.category = category.toUpperCase();

      const issues = await billingService.prisma.issueTicket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { user: true, room: true, building: true }
      });

      return res.status(200).json({ success: true, data: issues });
    } catch (error) {
      next(error);
    }
  }

  /**
   * แอดมินอัปเดตสถานะ/ตอบกลับการแจ้งเหตุ
   * PUT /api/admin/issues/:id
   */
  async updateIssueByAdmin(req, res, next) {
    try {
      const { id } = req.params;
      const { status, adminReply } = req.body;

      const updated = await billingService.prisma.issueTicket.update({
        where: { id },
        data: {
          ...(status && { status: status.toUpperCase() }),
          ...(adminReply !== undefined && { adminReply: adminReply ? adminReply.trim() : null })
        },
        include: { user: true, room: true, building: true }
      });

      return res.status(200).json({
        success: true,
        message: 'อัปเดตสถานะการแจ้งเหตุสำเร็จ',
        data: updated
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new IssueController();
