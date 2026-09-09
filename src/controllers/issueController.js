const billingService = require('../services/billingService');

/**
 * Controller สำหรับจัดการระบบแจ้งซ่อมและร้องเรียน (Issue & Maintenance Tracking)
 */
class IssueController {
  /**
   * ลูกบ้านแจ้งซ่อม/ร้องเรียนเรื่องใหม่
   * POST /api/liff/issues หรือ POST /api/v1/liff/issues
   */
  async createIssue(req, res, next) {
    try {
      const lineUserId = req.lineUserId;
      const tenantId = req.tenantId;

      // 1. ระบุตัวตนผู้เช่า (Tenant Identification)
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

      // 2. ระบุห้องพักและตึก
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

      // 3. ตรวจสอบข้อมูลฟอร์ม
      const { description, category } = req.body;
      if (!description || typeof description !== 'string' || !description.trim()) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาระบุรายละเอียดการแจ้งเหตุ/แจ้งซ่อม'
        });
      }

      // Validate Category
      const validCategories = ['REPAIR', 'COMPLAINT', 'OTHER'];
      let normalizedCategory = (category || 'REPAIR').toUpperCase();
      if (!validCategories.includes(normalizedCategory)) {
        normalizedCategory = 'REPAIR';
      }

      // 4. จัดการรายการรูปภาพ (Uploaded Files)
      const imageUrlsList = [];

      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        req.files.forEach((file) => {
          imageUrlsList.push(`/uploads/${file.filename}`);
        });
      } else if (req.file) {
        imageUrlsList.push(`/uploads/${req.file.filename}`);
      }

      // กรณีส่งลิงก์รูปภาพผ่าน Body มาด้วย
      if (req.body.imageUrls) {
        try {
          const parsed = typeof req.body.imageUrls === 'string' ? JSON.parse(req.body.imageUrls) : req.body.imageUrls;
          if (Array.isArray(parsed)) {
            parsed.forEach((url) => {
              if (typeof url === 'string' && url.trim() && !imageUrlsList.includes(url.trim())) {
                imageUrlsList.push(url.trim());
              }
            });
          }
        } catch {
          if (typeof req.body.imageUrls === 'string' && req.body.imageUrls.trim()) {
            imageUrlsList.push(req.body.imageUrls.trim());
          }
        }
      }

      // 5. บันทึกข้อมูลลงฐานข้อมูล (IssueTicket)
      const newIssue = await billingService.prisma.issueTicket.create({
        data: {
          userId: tenant.id,
          roomId: targetRoom.id,
          buildingId: targetRoom.buildingId,
          category: normalizedCategory,
          description: description.trim(),
          imageUrls: imageUrlsList,
          status: 'PENDING'
        },
        include: {
          room: true,
          building: true
        }
      });

      return res.status(201).json({
        success: true,
        message: 'ส่งเรื่องแจ้งซ่อม/ร้องเรียนเรียบร้อยแล้ว เจ้าหน้าที่จะรีบดำเนินการตรวจสอบครับ',
        data: newIssue
      });
    } catch (error) {
      console.error('Error creating issue ticket:', error);
      next(error);
    }
  }

  /**
   * ดึงรายการประวัติการแจ้งเหตุของผู้เช่า เรียงลำดับจากล่าสุดไปเก่าสุด
   * GET /api/liff/issues หรือ GET /api/v1/liff/issues
   */
  async getIssuesForLiff(req, res, next) {
    try {
      const lineUserId = req.lineUserId;
      const tenantId = req.tenantId;

      let tenant = null;
      if (tenantId) {
        tenant = await billingService.prisma.tenant.findUnique({
          where: { id: tenantId }
        });
      }
      if (!tenant && lineUserId) {
        tenant = await billingService.prisma.tenant.findUnique({
          where: { lineUserId }
        });
      }

      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบข้อมูลผู้เช่า'
        });
      }

      const issues = await billingService.prisma.issueTicket.findMany({
        where: {
          userId: tenant.id
        },
        orderBy: {
          createdAt: 'desc'
        },
        include: {
          room: true,
          building: true
        }
      });

      return res.status(200).json({
        success: true,
        data: issues
      });
    } catch (error) {
      console.error('Error fetching issue tickets for LIFF:', error);
      next(error);
    }
  }

  /**
   * แอดมินดึงรายการแจ้งซ่อมและร้องเรียนทั้งหมด (CMS Backoffice)
   * GET /api/admin/issues
   */
  async getAllIssuesForAdmin(req, res, next) {
    try {
      const { buildingId, category, status, search } = req.query;

      const where = {};

      if (buildingId) {
        where.buildingId = buildingId;
      }

      if (category && category !== 'ALL') {
        where.category = category.toUpperCase();
      }

      if (status && status !== 'ALL') {
        where.status = status.toUpperCase();
      }

      if (search && search.trim()) {
        const q = search.trim();
        where.OR = [
          { description: { contains: q, mode: 'insensitive' } },
          { adminReply: { contains: q, mode: 'insensitive' } },
          { room: { roomNumber: { contains: q, mode: 'insensitive' } } },
          { user: { firstName: { contains: q, mode: 'insensitive' } } },
          { user: { lastName: { contains: q, mode: 'insensitive' } } }
        ];
      }

      const issues = await billingService.prisma.issueTicket.findMany({
        where,
        orderBy: {
          createdAt: 'desc'
        },
        include: {
          room: true,
          building: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              lineDisplayName: true,
              linePictureUrl: true
            }
          }
        }
      });

      return res.status(200).json({
        success: true,
        data: issues
      });
    } catch (error) {
      console.error('Error fetching admin issues:', error);
      next(error);
    }
  }

  /**
   * แอดมินอัปเดตสถานะและตอบกลับเรื่องร้องเรียน/แจ้งซ่อม
   * PUT /api/admin/issues/:id
   */
  async updateIssueByAdmin(req, res, next) {
    try {
      const { id } = req.params;
      const { status, adminReply } = req.body;

      const existing = await billingService.prisma.issueTicket.findUnique({
        where: { id },
        include: { user: true, room: true }
      });

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบข้อมูลตั๋วแจ้งเหตุ'
        });
      }

      const updateData = {};
      if (status) {
        updateData.status = status.toUpperCase();
      }
      if (adminReply !== undefined) {
        updateData.adminReply = adminReply ? adminReply.trim() : null;
      }

      const updated = await billingService.prisma.issueTicket.update({
        where: { id },
        data: updateData,
        include: {
          room: true,
          building: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              lineDisplayName: true
            }
          }
        }
      });

      return res.status(200).json({
        success: true,
        message: 'อัปเดตสถานะและการตอบกลับเรียบร้อยแล้ว',
        data: updated
      });
    } catch (error) {
      console.error('Error updating issue ticket by admin:', error);
      next(error);
    }
  }
}

module.exports = new IssueController();

