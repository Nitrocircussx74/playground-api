const billingService = require('../services/billingService');
const lineService = require('../services/lineService');

class AnnouncementController {
  /**
   * จำกัด buildingId ที่แอดมินคนนี้บรอดแคสต์ได้ ตามสิทธิ์จริงใน UserBuildingPermission
   * (Pattern เดียวกับ dashboardController.getSummary) กัน Admin/Manager ของตึกหนึ่งยิงประกาศ
   * ข้ามไปตึกอื่น หรือยิงหา "ทุกตึกในระบบ" โดยไม่ตั้งใจ (เดิมไม่มีการเช็คเลย + Fallback เดา
   * ตึกแรกในระบบเวลาไม่ระบุ buildingId มา)
   * @returns {Promise<{ buildingId: string|null, error?: { statusCode: number, message: string } }>}
   *   buildingId: null หมายถึง Super Admin ตั้งใจบรอดแคสต์แบบ ALL จริง ๆ (ไม่ Scope ตึก)
   */
  async _resolveAllowedBuildingId(req, requestedBuildingId) {
    const userRole = (req.user?.role || '').toLowerCase();
    const isHighAdmin = ['super_admin', 'superadmin', 'owner'].includes(userRole);

    if (isHighAdmin) {
      return { buildingId: requestedBuildingId || null };
    }

    const permissions = await billingService.prisma.userBuildingPermission.findMany({
      where: { userId: req.user?.id },
      select: { buildingId: true }
    });
    const allowedBuildingIds = permissions.map((p) => p.buildingId);

    if (allowedBuildingIds.length === 0) {
      return { buildingId: null, error: { statusCode: 403, message: 'คุณไม่มีสิทธิ์ตึกใดเลย ไม่สามารถส่งประกาศได้' } };
    }

    if (requestedBuildingId) {
      if (!allowedBuildingIds.includes(requestedBuildingId)) {
        return { buildingId: null, error: { statusCode: 403, message: 'คุณไม่มีสิทธิ์ส่งประกาศไปยังตึกนี้' } };
      }
      return { buildingId: requestedBuildingId };
    }

    if (allowedBuildingIds.length === 1) {
      return { buildingId: allowedBuildingIds[0] };
    }

    return { buildingId: null, error: { statusCode: 400, message: 'คุณมีสิทธิ์มากกว่า 1 ตึก กรุณาระบุตึกที่ต้องการส่งประกาศ' } };
  }

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
        select: { id: true, lineUserId: true, rooms: { select: { buildingId: true } } }
      });
      return tenants.filter(t => t.lineUserId).map(t => ({
        id: t.id,
        lineUserId: t.lineUserId,
        buildingId: t.rooms[0]?.buildingId || null
      }));
    }

    if (normTarget === 'BUILDING') {
      const tenants = await billingService.prisma.tenant.findMany({
        where: {
          lineUserId: { not: null },
          rooms: {
            some: { buildingId: targetBuildingId }
          }
        },
        select: { id: true, lineUserId: true, rooms: { select: { buildingId: true } } }
      });
      return tenants.filter(t => t.lineUserId).map(t => ({
        id: t.id,
        lineUserId: t.lineUserId,
        buildingId: targetBuildingId || t.rooms[0]?.buildingId || null
      }));
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
        select: { id: true, lineUserId: true, rooms: { select: { buildingId: true } } }
      });
      return tenants.filter(t => t.lineUserId).map(t => ({
        id: t.id,
        lineUserId: t.lineUserId,
        buildingId: targetBuildingId || t.rooms[0]?.buildingId || null
      }));
    }

    if (normTarget === 'ROOM') {
      const room = await billingService.prisma.room.findUnique({
        where: { id: String(targetValue) },
        include: { tenant: true }
      });
      if (room?.tenant?.lineUserId) {
        return [{
          id: room.tenant.id,
          lineUserId: room.tenant.lineUserId,
          buildingId: room.buildingId
        }];
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
      let finalTargetValue = targetValue || (normTargetType === 'FLOOR' ? String(floor) : targetId) || null;

      const scope = await this._resolveAllowedBuildingId(req, buildingId || targetId || null);
      if (scope.error) {
        return res.status(scope.error.statusCode).json({ success: false, message: scope.error.message });
      }
      if (!scope.buildingId && normTargetType !== 'ALL') {
        return res.status(400).json({ success: false, message: 'กรุณาระบุตึกที่ต้องการส่งประกาศ' });
      }
      const targetBuildingId = scope.buildingId;

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

      // 2. ค้นหาเป้าหมายผู้เช่า
      const targets = await this._getTargetUserIds({
        targetType: normTargetType,
        targetBuildingId,
        targetValue: finalTargetValue
      });
      
      const userIds = targets.map(t => t.lineUserId);

      // 3. ส่ง LINE Broadcast / Multicast (Array Chunking 500 UIDs)
      const recipientCount = await lineService.sendAnnouncementBroadcast(userIds, announcement);

      // 4. บันทึกลง NotificationLog เพื่อให้ไปโผล่ในกระดิ่งแจ้งเตือนลูกบ้าน (Tenant Notification Bell)
      if (targets.length > 0) {
        await billingService.prisma.notificationLog.createMany({
          data: targets.map(t => ({
            tenantId: t.id,
            buildingId: t.buildingId || targetBuildingId,
            notificationType: 'ANNOUNCEMENT',
            messagePreview: title,
            status: 'SUCCESS'
          }))
        });
      }

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
      const finalTargetValue = targetValue || (normTargetType === 'FLOOR' ? String(floor) : targetId) || null;

      const scope = await this._resolveAllowedBuildingId(req, buildingId || targetId || null);
      if (scope.error) {
        return res.status(scope.error.statusCode).json({ success: false, message: scope.error.message });
      }
      if (!scope.buildingId && normTargetType !== 'ALL') {
        return res.status(400).json({ success: false, message: 'กรุณาระบุตึกที่ต้องการส่งประกาศ' });
      }
      const targetBuildingId = scope.buildingId;

      const targets = await this._getTargetUserIds({
        targetType: normTargetType,
        targetBuildingId,
        targetValue: finalTargetValue
      });

      return res.status(200).json({
        success: true,
        recipientCount: targets.length
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ดึงรายการประกาศข่าวสารสำหรับแอดมิน (Admin Announcements List)
   */
  async getAnnouncementsForAdmin(req, res, next) {
    try {
      const { buildingId } = req.query;
      const where = buildingId ? { OR: [{ buildingId }, { buildingId: null }] } : {};

      const announcements = await billingService.prisma.announcement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          building: true,
          _count: {
            select: { announcementReads: true }
          }
        }
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
   * ดึงรายการประกาศข่าวสารที่ตรงกับผู้เช่าสำหรับ LIFF App พร้อมสถานะการเปิดอ่าน (isRead, readAt)
   * GET /api/v1/liff/announcements
   */
  async getAnnouncementsForLiff(req, res, next) {
    try {
      const lineUserId = req.lineUserId;
      const tenantId = req.tenantId;

      let tenant = null;
      if (tenantId) {
        tenant = await billingService.prisma.tenant.findUnique({
          where: { id: tenantId },
          include: { rooms: true }
        });
      }
      if (!tenant && lineUserId) {
        tenant = await billingService.prisma.tenant.findUnique({
          where: { lineUserId },
          include: { rooms: true }
        });
      }

      const targetRoomId = req.roomId;
      const targetBuildingId = req.buildingId;

      let tenantRoom = null;
      if (tenant?.rooms?.length > 0) {
        if (targetRoomId) {
          tenantRoom = tenant.rooms.find((r) => r.id === targetRoomId);
        }
        if (!tenantRoom && targetBuildingId) {
          tenantRoom = tenant.rooms.find((r) => r.buildingId === targetBuildingId);
        }
        if (!tenantRoom) {
          tenantRoom = tenant.rooms[0];
        }
      }

      const effectiveBuildingId = tenantRoom?.buildingId || targetBuildingId || null;

      let whereCondition = {
        OR: [
          { targetType: { in: ['ALL', 'all'] }, buildingId: null },
          ...(effectiveBuildingId ? [
            { targetType: { in: ['ALL', 'all'] }, buildingId: effectiveBuildingId },
            { targetType: { in: ['BUILDING', 'building'] }, buildingId: effectiveBuildingId }
          ] : [])
        ]
      };

      if (tenantRoom) {
        whereCondition = {
          OR: [
            { targetType: { in: ['ALL', 'all'] }, buildingId: null },
            { targetType: { in: ['ALL', 'all'] }, buildingId: tenantRoom.buildingId },
            { targetType: { in: ['BUILDING', 'building'] }, buildingId: tenantRoom.buildingId },
            { targetType: { in: ['FLOOR', 'floor'] }, targetValue: String(tenantRoom.floor), buildingId: tenantRoom.buildingId },
            { targetType: { in: ['ROOM', 'room'] }, targetValue: tenantRoom.id }
          ]
        };
      }

      const announcements = await billingService.prisma.announcement.findMany({
        where: whereCondition,
        orderBy: { createdAt: 'desc' },
        include: {
          building: true,
          announcementReads: tenant?.id ? {
            where: { tenantId: tenant.id }
          } : false
        }
      });

      const formatted = announcements.map((item) => {
        const reads = item.announcementReads || [];
        const readRecord = reads[0] || null;
        const { announcementReads, ...rest } = item;
        return {
          ...rest,
          isRead: Boolean(readRecord),
          readAt: readRecord ? readRecord.readAt : null
        };
      });

      return res.status(200).json({
        success: true,
        data: formatted
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * บันทึกว่าผู้เช่าเปิดอ่านประกาศนี้แล้ว (Mark Announcement as Read)
   * POST /api/v1/liff/announcements/:id/read
   */
  async markAnnouncementAsRead(req, res, next) {
    try {
      const { id } = req.params;
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
        return res.status(404).json({
          success: false,
          message: 'ไม่พบข้อมูลผู้เช่า'
        });
      }

      const announcement = await billingService.prisma.announcement.findUnique({ where: { id } });
      if (!announcement) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบประกาศข่าวสาร'
        });
      }

      const readRecord = await billingService.prisma.announcementRead.upsert({
        where: {
          announcementId_tenantId: {
            announcementId: id,
            tenantId: tenant.id
          }
        },
        update: {
          readAt: new Date()
        },
        create: {
          announcementId: id,
          tenantId: tenant.id,
          readAt: new Date()
        }
      });

      return res.status(200).json({
        success: true,
        message: 'บันทึกสถานะการอ่านเรียบร้อยแล้ว',
        data: {
          announcementId: id,
          isRead: true,
          readAt: readRecord.readAt
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ทำเครื่องหมายว่าอ่านประกาศทั้งหมดแล้ว (Mark All Announcements as Read)
   * POST /api/v1/liff/announcements/read-all
   */
  async markAllAnnouncementsAsRead(req, res, next) {
    try {
      const lineUserId = req.lineUserId;
      const tenantId = req.tenantId;

      let tenant = null;
      if (tenantId) {
        tenant = await billingService.prisma.tenant.findUnique({
          where: { id: tenantId },
          include: { rooms: true }
        });
      }
      if (!tenant && lineUserId) {
        tenant = await billingService.prisma.tenant.findUnique({
          where: { lineUserId },
          include: { rooms: true }
        });
      }

      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบข้อมูลผู้เช่า'
        });
      }

      let tenantRoom = tenant.rooms?.[0] || null;
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
        select: { id: true }
      });

      const now = new Date();
      await Promise.all(
        announcements.map((a) =>
          billingService.prisma.announcementRead.upsert({
            where: {
              announcementId_tenantId: {
                announcementId: a.id,
                tenantId: tenant.id
              }
            },
            update: { readAt: now },
            create: {
              announcementId: a.id,
              tenantId: tenant.id,
              readAt: now
            }
          })
        )
      );

      return res.status(200).json({
        success: true,
        message: 'ทำเครื่องหมายว่าอ่านทั้งหมดเรียบร้อยแล้ว'
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
