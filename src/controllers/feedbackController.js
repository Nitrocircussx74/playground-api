const prisma = require('../config/prisma');

class FeedbackController {
  /**
   * ส่งความคิดเห็น / แจ้งปัญหาถึงผู้พัฒนา
   * POST /api/v1/feedback
   */
  async submitFeedback(req, res, next) {
    try {
      const {
        platform = 'CMS_ADMIN',
        category = 'GENERAL',
        title,
        content,
        rating,
        imageUrls,
        currentRoute,
        deviceContext,
        senderName,
        senderPhone,
        senderRole,
        buildingId
      } = req.body;

      if (!content || !content.trim()) {
        return res.status(400).json({
          success: false,
          message: 'กรุณากรอกรายละเอียดข้อความความคิดเห็นหรือปัญหาที่พบ'
        });
      }

      // ดึงข้อมูลผู้ส่งจาก JWT Session ถ้ามี
      const senderId = req.user?.id || req.user?.userId || req.user?.tenantId || null;
      const resolvedRole = req.user?.role || senderRole || 'GUEST';
      const resolvedName = senderName || req.user?.name || req.user?.firstName || 'ผู้ใช้งานระบบ';
      const resolvedPhone = senderPhone || req.user?.phone || null;

      const feedback = await prisma.developerFeedback.create({
        data: {
          platform: String(platform || 'CMS_ADMIN').toUpperCase(),
          category: String(category || 'GENERAL').toUpperCase(),
          title: title ? title.trim() : null,
          content: content.trim(),
          rating: rating ? parseInt(rating, 10) : null,
          imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
          currentRoute: currentRoute || null,
          deviceContext: deviceContext || {},
          senderId,
          senderName: resolvedName,
          senderRole: resolvedRole,
          senderPhone: resolvedPhone,
          buildingId: buildingId || null,
          status: 'NEW'
        }
      });

      return res.status(201).json({
        success: true,
        message: 'ส่งความคิดเห็นถึงทีมผู้พัฒนาเรียบร้อยแล้ว ขอบคุณสำหรับข้อเสนอแนะ!',
        data: feedback
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ดึงรายการ Feedback ทั้งหมดสำหรับ Admin / Developer
   * GET /api/admin/feedbacks
   */
  async getFeedbacks(req, res, next) {
    try {
      const {
        category,
        status,
        platform,
        search,
        rating,
        page = 1,
        limit = 20
      } = req.query;

      const where = {};

      if (category && category !== 'ALL') {
        where.category = String(category).toUpperCase();
      }

      if (status && status !== 'ALL') {
        where.status = String(status).toUpperCase();
      }

      if (platform && platform !== 'ALL') {
        where.platform = String(platform).toUpperCase();
      }

      if (rating) {
        where.rating = parseInt(rating, 10);
      }

      if (search && search.trim()) {
        const s = search.trim();
        where.OR = [
          { title: { contains: s, mode: 'insensitive' } },
          { content: { contains: s, mode: 'insensitive' } },
          { senderName: { contains: s, mode: 'insensitive' } },
          { senderPhone: { contains: s, mode: 'insensitive' } },
          { currentRoute: { contains: s, mode: 'insensitive' } }
        ];
      }

      const take = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
      const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * take;

      const [total, feedbacks] = await Promise.all([
        prisma.developerFeedback.count({ where }),
        prisma.developerFeedback.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take
        })
      ]);

      return res.status(200).json({
        success: true,
        data: {
          feedbacks,
          pagination: {
            total,
            page: parseInt(page, 10) || 1,
            limit: take,
            totalPages: Math.ceil(total / take)
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * อัปเดตสถานะและโน้ตภายในของทีมพัฒนา
   * PATCH /api/admin/feedbacks/:id/status
   */
  async updateFeedbackStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status, devNotes } = req.body;

      const feedback = await prisma.developerFeedback.findUnique({
        where: { id }
      });

      if (!feedback) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบรายการ Feedback ที่ระบุ'
        });
      }

      const updateData = {};
      if (status) updateData.status = String(status).toUpperCase();
      if (devNotes !== undefined) updateData.devNotes = devNotes;

      const updated = await prisma.developerFeedback.update({
        where: { id },
        data: updateData
      });

      return res.status(200).json({
        success: true,
        message: 'อัปเดตสถานะ Feedback สำเร็จ',
        data: updated
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ลบรายการ Feedback
   * DELETE /api/admin/feedbacks/:id
   */
  async deleteFeedback(req, res, next) {
    try {
      const { id } = req.params;

      const feedback = await prisma.developerFeedback.findUnique({
        where: { id }
      });

      if (!feedback) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบรายการ Feedback ที่ระบุ'
        });
      }

      await prisma.developerFeedback.delete({
        where: { id }
      });

      return res.status(200).json({
        success: true,
        message: 'ลบรายการ Feedback สำเร็จ'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new FeedbackController();
