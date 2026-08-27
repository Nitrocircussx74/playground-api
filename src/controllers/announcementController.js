const billingService = require('../services/billingService');
const lineService = require('../services/lineService');

class AnnouncementController {
  /**
   * แอดมินสร้างและบรอดแคสต์ประกาศข่าวสารประจำตึก
   */
  async createAnnouncement(req, res, next) {
    try {
      const { title, content, targetType, targetValue, buildingId } = req.body;

      if (!title || !content || !targetType) {
        return res.status(400).json({
          success: false,
          message: 'กรุณากรอกข้อมูล title, content และ targetType ให้ครบถ้วน'
        });
      }

      // If buildingId not provided, fallback to first building in system
      let targetBuildingId = buildingId;
      if (!targetBuildingId) {
        const firstBuilding = await billingService.prisma.building.findFirst();
        if (firstBuilding) {
          targetBuildingId = firstBuilding.id;
        }
      }

      // 1. บันทึกข้อมูลประกาศลง Database พร้อมผูก buildingId
      const announcement = await billingService.prisma.announcement.create({
        data: {
          title,
          content,
          targetType,
          targetValue: targetValue ? String(targetValue) : null,
          createdBy: req.user?.name || 'Dormitory Admin',
          buildingId: targetBuildingId
        },
        include: {
          building: true
        }
      });

      // 2. Logic การค้นหาเป้าหมายผู้เช่าประจำตึกเพื่อดึง lineUserId
      let userIds = [];

      if (targetType === 'all') {
        const tenants = await billingService.prisma.tenant.findMany({
          where: {
            lineUserId: { not: null },
            rooms: {
              some: targetBuildingId ? { buildingId: targetBuildingId } : {}
            }
          },
          select: { lineUserId: true }
        });
        userIds = tenants.map((t) => t.lineUserId);
      } else if (targetType === 'floor') {
        const floorNum = Number(targetValue);
        const tenants = await billingService.prisma.tenant.findMany({
          where: {
            lineUserId: { not: null },
            rooms: {
              some: {
                floor: floorNum,
                ...(targetBuildingId ? { buildingId: targetBuildingId } : {})
              }
            }
          },
          select: { lineUserId: true }
        });
        userIds = tenants.map((t) => t.lineUserId);
      } else if (targetType === 'room') {
        const room = await billingService.prisma.room.findUnique({
          where: { id: String(targetValue) },
          include: { tenant: true }
        });
        if (room?.tenant?.lineUserId) {
          userIds = [room.tenant.lineUserId];
        }
      }

      // 3. ส่ง LINE Broadcast / Multicast / Push Notification
      const recipientCount = await lineService.sendAnnouncementBroadcast(userIds, announcement);

      return res.status(201).json({
        success: true,
        message: `สร้างประกาศข่าวสารและบรอดแคสต์สำเร็จไปยังผู้เช่า ${recipientCount} คน`,
        data: {
          announcement,
          recipientCount
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ดึงรายการประกาศข่าวสารสำหรับ Admin (กรองตาม buildingId)
   */
  async getAnnouncementsForAdmin(req, res, next) {
    try {
      const { buildingId } = req.query;
      const where = buildingId ? { OR: [{ buildingId }, { buildingId: null }] } : {};

      const announcements = await billingService.prisma.announcement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: { building: true }
      });

      return res.status(200).json({
        success: true,
        data: announcements
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ดึงรายการประกาศข่าวสารที่ตรงกับผู้เช่าสำหรับ LIFF App
   */
  async getAnnouncementsForLiff(req, res, next) {
    try {
      const { lineUserId, roomId } = req.query;

      let tenantRoom = null;

      if (roomId) {
        tenantRoom = await billingService.prisma.room.findUnique({ where: { id: roomId } });
      } else if (lineUserId) {
        const tenant = await billingService.prisma.tenant.findUnique({
          where: { lineUserId },
          include: { rooms: true }
        });
        if (tenant?.rooms?.length > 0) {
          tenantRoom = tenant.rooms[0];
        }
      }

      let whereCondition = { targetType: 'all' };

      if (tenantRoom) {
        whereCondition = {
          OR: [
            { targetType: 'all', OR: [{ buildingId: tenantRoom.buildingId }, { buildingId: null }] },
            { targetType: 'floor', targetValue: String(tenantRoom.floor), OR: [{ buildingId: tenantRoom.buildingId }, { buildingId: null }] },
            { targetType: 'room', targetValue: tenantRoom.id }
          ]
        };
      }

      const announcements = await billingService.prisma.announcement.findMany({
        where: whereCondition,
        orderBy: { createdAt: 'desc' },
        include: { building: true }
      });

      return res.status(200).json({
        success: true,
        data: announcements
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * แอดมินลบประกาศข่าวสาร (Delete Announcement)
   */
  async deleteAnnouncement(req, res, next) {
    try {
      const { id } = req.params;
      const announcement = await billingService.prisma.announcement.findUnique({ where: { id } });

      if (!announcement) {
        return res.status(404).json({ success: false, message: 'ไม่พบประกาศที่ต้องการลบ' });
      }

      await billingService.prisma.announcement.delete({ where: { id } });

      return res.status(200).json({
        success: true,
        message: `ลบประกาศ "${announcement.title}" เรียบร้อยแล้ว`
      });
    } catch (error) {
      console.error('Error deleting announcement:', error);
      next(error);
    }
  }
}

module.exports = new AnnouncementController();
