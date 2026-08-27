const billingService = require('../services/billingService');
const lineService = require('../services/lineService');
const auditService = require('../services/auditService');

class ParcelController {
  /**
   * ดึงรายการพัสดุประจำตึกสำหรับ Admin (GET /api/admin/buildings/:buildingId/parcels)
   */
  async getParcelsByBuilding(req, res, next) {
    try {
      const { buildingId } = req.params;
      const { status } = req.query;

      const where = {
        buildingId,
        ...(status ? { status: String(status).toUpperCase() } : {})
      };

      const parcels = await billingService.prisma.parcel.findMany({
        where,
        orderBy: [
          { status: 'asc' }, // PENDING first
          { receivedAt: 'desc' }
        ],
        include: {
          room: true,
          tenant: true,
          building: true
        }
      });

      return res.status(200).json({
        success: true,
        data: parcels
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * บันทึกพัสดุเข้าใหม่ และส่ง LINE Push Notification (POST /api/admin/buildings/:buildingId/parcels)
   */
  async createParcel(req, res, next) {
    try {
      const { buildingId } = req.params;
      const { roomId, courier, trackingNumber, photoUrl } = req.body;

      if (!roomId || !courier) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาระบุ roomId และ courier ให้ครบถ้วน'
        });
      }

      // Check room and tenant
      const room = await billingService.prisma.room.findUnique({
        where: { id: roomId },
        include: { tenant: true, building: true }
      });

      if (!room) {
        return res.status(404).json({ success: false, message: 'ไม่พบห้องพักที่ระบุ' });
      }

      const tenantId = room.tenantId || null;

      // 1. Create Parcel record
      const parcel = await billingService.prisma.parcel.create({
        data: {
          roomId,
          buildingId,
          tenantId,
          courier,
          trackingNumber: trackingNumber ? trackingNumber.trim() : null,
          photoUrl: photoUrl || null,
          status: 'PENDING',
          receivedAt: new Date()
        },
        include: {
          room: true,
          tenant: true,
          building: true
        }
      });

      // Audit Log
      await auditService.logAction({
        adminId: req.user?.id,
        action: 'CREATE',
        entity: 'PARCEL',
        entityId: parcel.id,
        newValues: parcel
      });

      // 2. LINE Push Notification Logic if tenant has lineUserId
      let lineNotified = false;
      if (room.tenant?.lineUserId) {
        lineNotified = await lineService.pushParcelNotification(room.tenant.lineUserId, parcel);
      }

      return res.status(201).json({
        success: true,
        message: `บันทึกพัสดุห้อง ${room.roomNumber} (${courier}) เรียบร้อยแล้ว${lineNotified ? ' พร้อมส่ง LINE แจ้งเตือนลูกบ้าน' : ''}`,
        data: {
          parcel,
          lineNotified
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * อัปเดตสถานะเป็น 'PICKED_UP' เมื่อลูกบ้านมารับของไป (PATCH /api/admin/parcels/:id/pickup)
   */
  async markAsPickedUp(req, res, next) {
    try {
      const { id } = req.params;

      const parcel = await billingService.prisma.parcel.findUnique({ where: { id } });

      if (!parcel) {
        return res.status(404).json({ success: false, message: 'ไม่พบรายการพัสดุ' });
      }

      if (parcel.status === 'PICKED_UP') {
        return res.status(400).json({ success: false, message: 'พัสดุรายการนี้ถูกรับไปแล้ว' });
      }

      const updatedParcel = await billingService.prisma.parcel.update({
        where: { id },
        data: {
          status: 'PICKED_UP',
          pickedUpAt: new Date()
        },
        include: {
          room: true,
          tenant: true,
          building: true
        }
      });

      // Audit Log
      await auditService.logAction({
        adminId: req.user?.id,
        action: 'UPDATE',
        entity: 'PARCEL',
        entityId: id,
        oldValues: { status: parcel.status, pickedUpAt: parcel.pickedUpAt },
        newValues: { status: updatedParcel.status, pickedUpAt: updatedParcel.pickedUpAt }
      });

      return res.status(200).json({
        success: true,
        message: `อัปเดตการรับพัสดุห้อง ${updatedParcel.room?.roomNumber || ''} เรียบร้อยแล้ว`,
        data: updatedParcel
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ดึงรายการพัสดุของตนเองสำหรับ LIFF Tenant App (GET /api/liff/parcels)
   */
  async getParcelsForLiff(req, res, next) {
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

      let whereCondition = {};

      if (tenantRoom) {
        whereCondition = { roomId: tenantRoom.id };
      } else if (lineUserId) {
        const tenant = await billingService.prisma.tenant.findUnique({ where: { lineUserId } });
        if (tenant) {
          whereCondition = { tenantId: tenant.id };
        }
      }

      const parcels = await billingService.prisma.parcel.findMany({
        where: whereCondition,
        orderBy: [
          { status: 'asc' }, // PENDING first
          { receivedAt: 'desc' }
        ],
        include: {
          room: true,
          building: true
        }
      });

      return res.status(200).json({
        success: true,
        data: parcels
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ลบพัสดุ (DELETE /api/admin/parcels/:id)
   */
  async deleteParcel(req, res, next) {
    try {
      const { id } = req.params;
      const parcel = await billingService.prisma.parcel.findUnique({ where: { id } });

      if (!parcel) {
        return res.status(404).json({ success: false, message: 'ไม่พบรายการพัสดุที่ต้องการลบ' });
      }

      await billingService.prisma.parcel.delete({ where: { id } });

      return res.status(200).json({
        success: true,
        message: 'ลบรายการพัสดุเรียบร้อยแล้ว'
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ParcelController();
