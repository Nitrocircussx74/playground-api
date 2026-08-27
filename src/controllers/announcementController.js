const billingService = require('../services/billingService');
const lineService = require('../services/lineService');

class AnnouncementController {
  /**
   * Helper function ในการคัดกรอง lineUserId ของผู้เช่าตาม Target (ALL, BUILDING, FLOOR, ROOM)
   */
  async _getTargetUserIds({ targetType, targetBuildingId, targetValue }) {
    const normTarget = (targetType || 'ALL').toUpperCase();

    if (normTarget === 'ALL') {
      const tenants = await billingService.prisma.tenant.findMany({
        where: {
          lineUserId: { not: null },
          rooms: targetBuildingId ? { some: { buildingId: targetBuildingId } } : undefined
        },
        select: { lineUserId: true }
      });
      return tenants.map((t) => t.lineUserId).filter(Boolean);
    }

    if (normTarget === 'BUILDING') {
      const tenants = await billingService.prisma.tenant.findMany({
        where: {
          lineUserId: { not: null },
          rooms: {
            some: { buildingId: targetBuildingId }
          }
        },
        select: { lineUserId: true }
      });
      return tenants.map((t) => t.lineUserId).filter(Boolean);
    }

    if (normTarget === 'FLOOR') {
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
      return tenants.map((t) => t.lineUserId).filter(Boolean);
    }

    if (normTarget === 'ROOM') {
      const room = await billingService.prisma.room.findUnique({
        where: { id: String(targetValue) },
        include: { tenant: true }
      });
      if (room?.tenant?.lineUserId) {
        return [room.tenant.lineUserId];
      }
    }

    return [];
  }

  /**
   * แอดมินสร้างและบรอดแคสต์ประกาศข่าวสารประจำตึก / ประจำชั้น (Targeted Broadcast)
   * POST /api/admin/broadcasts
   */
  async createAnnouncement(req, res, next) {
    try {
      const { title, content, image, imageUrl, targetType, targetId, targetValue, buildingId, floor } = req.body;

      if (!title || !content || !targetType) {
        return res.status(400).json({
          success: false,
          message: 'กรุณากรอกข้อมูล title, content และ targetType ให้ครบถ้วน'
        });
      }

      const imgUrl = imageUrl || image || null;
      const normTargetType = String(targetType).toUpperCase();
      let targetBuildingId = buildingId || targetId || null;
      let finalTargetValue = targetValue || (normTargetType === 'FLOOR' ? String(floor) : targetId) || null;

      // If buildingId not provided for BUILDING/FLOOR, fallback to first building in system
      if (!targetBuildingId && normTargetType !== 'ALL') {
        const firstBuilding = await billingService.prisma.building.findFirst();
        if (firstBuilding) {
          targetBuildingId = firstBuilding.id;
        }
      }

      // 1. บันทึกข้อมูลประกาศลง Database พร้อมผูก buildingId และ imageUrl
      const announcement = await billingService.prisma.announcement.create({
        data: {
          title,
          content,
          imageUrl: imgUrl,
          targetType: normTargetType,
          targetValue: finalTargetValue ? String(finalTargetValue) : null,
          createdBy: req.user?.name || 'Dormitory Admin',
          buildingId: targetBuildingId
        },
        include: {
          building: true
        }
      });

      // 2. ค้นหาเป้าหมายผู้เช่าเพื่อดึง lineUserId
      const userIds = await this._getTargetUserIds({
        targetType: normTargetType,
        targetBuildingId,
        targetValue: finalTargetValue
      });

      // 3. ส่ง LINE Broadcast / Multicast (Array Chunking 500 UIDs)
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
   * ดึงจำนวนผู้รับที่จะได้รับข้อความก่อนกดยืนยันส่ง (Recipient Count Preview)
   * GET /api/admin/broadcasts/recipients-count
   */
  async getRecipientsCount(req, res, next) {
    try {
      const { targetType, buildingId, floor, targetId, targetValue } = req.query;
      const normTargetType = String(targetType || 'ALL').toUpperCase();
      const targetBuildingId = buildingId || targetId || null;
      const finalTargetValue = targetValue || (normTargetType === 'FLOOR' ? String(floor) : targetId) || null;

      const userIds = await this._getTargetUserIds({
        targetType: normTargetType,
        targetBuildingId,
        targetValue: finalTargetValue
      });

      return res.status(200).json({
        success: true,
        recipientCount: userIds.length
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
   * GET /api/liff/announcements
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

      let whereCondition = {
        OR: [
          { targetType: 'ALL' },
          { targetType: 'all' }
        ]
      };

      if (tenantRoom) {
        whereCondition = {
          OR: [
            { targetType: 'ALL' },
            { targetType: 'all' },
            { targetType: 'BUILDING', buildingId: tenantRoom.buildingId },
            { targetType: 'building', buildingId: tenantRoom.buildingId },
            { targetType: 'FLOOR', targetValue: String(tenantRoom.floor), buildingId: tenantRoom.buildingId },
            { targetType: 'floor', targetValue: String(tenantRoom.floor), buildingId: tenantRoom.buildingId },
            { targetType: 'ROOM', targetValue: tenantRoom.id },
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
