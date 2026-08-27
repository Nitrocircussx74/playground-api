const crypto = require('crypto');
const billingService = require('../services/billingService');

class RoomController {
  async getRooms(req, res, next) {
    try {
      const rooms = await billingService.prisma.room.findMany({
        orderBy: { roomNumber: 'asc' },
        include: {
          tenant: true
        }
      });

      return res.status(200).json({
        success: true,
        data: rooms
      });
    } catch (error) {
      next(error);
    }
  }

  async getRoomById(req, res, next) {
    try {
      const { id } = req.params;
      const room = await billingService.prisma.room.findUnique({
        where: { id },
        include: {
          tenant: true,
          meterRecords: { orderBy: { recordedAt: 'desc' }, take: 10 },
          invoices: { orderBy: { createdAt: 'desc' }, take: 10 },
          roomInvites: { orderBy: { createdAt: 'desc' }, take: 5 }
        }
      });

      if (!room) {
        return res.status(404).json({ success: false, message: 'Room not found' });
      }

      return res.status(200).json({
        success: true,
        data: room
      });
    } catch (error) {
      next(error);
    }
  }

  async createRoom(req, res, next) {
    try {
      const { roomNumber, floor, price, status } = req.body;

      if (!roomNumber || floor == null || price == null) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: roomNumber, floor, and price'
        });
      }

      const existingRoom = await billingService.prisma.room.findUnique({
        where: { roomNumber: String(roomNumber) }
      });

      if (existingRoom) {
        return res.status(400).json({
          success: false,
          message: `Room ${roomNumber} already exists in the system`
        });
      }

      const newRoom = await billingService.prisma.room.create({
        data: {
          roomNumber: String(roomNumber),
          floor: Number(floor),
          price: Number(price),
          status: status || 'available'
        }
      });

      return res.status(201).json({
        success: true,
        message: `Room ${newRoom.roomNumber} created successfully`,
        data: newRoom
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * สร้างรหัสเชิญ (Invite Code) 6 หลักสำหรับห้องพักที่ว่างอยู่ (48 ชั่วโมงหมดอายุ)
   */
  async createRoomInvite(req, res, next) {
    try {
      const { id } = req.params; // roomId

      const room = await billingService.prisma.room.findUnique({ where: { id } });
      if (!room) {
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลห้องพัก' });
      }

      if (room.status !== 'available') {
        return res.status(400).json({
          success: false,
          message: `ห้อง ${room.roomNumber} มีผู้เช่าอยู่หรืออยู่ในสถานะซ่อมบำรุง ไม่สามารถสร้างรหัสเชิญได้`
        });
      }

      // สุ่มรหัส 6 หลักตัวอักษรและตัวเลขพิมพ์ใหญ่ (เช่น X9K2P4)
      const code = crypto.randomBytes(3).toString('hex').toUpperCase();
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 ชั่วโมง

      const invite = await billingService.prisma.roomInvite.create({
        data: {
          roomId: id,
          code,
          expiresAt,
          isUsed: false
        },
        include: { room: true }
      });

      return res.status(201).json({
        success: true,
        message: `สร้างรหัสเชิญ ${code} สำหรับห้อง ${room.roomNumber} เรียบร้อยแล้ว (หมดอายุใน 48 ชม.)`,
        data: invite
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ดึงรายการ Invite Codes ของห้องพัก
   */
  async getRoomInvites(req, res, next) {
    try {
      const { id } = req.params; // roomId
      const invites = await billingService.prisma.roomInvite.findMany({
        where: { roomId: id },
        orderBy: { createdAt: 'desc' },
        include: { room: true }
      });

      return res.status(200).json({
        success: true,
        data: invites
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ยกเลิก/เพิกถอน Invite Code ที่ยังไม่ได้ใช้งาน
   */
  async revokeRoomInvite(req, res, next) {
    try {
      const { inviteId } = req.params;
      const invite = await billingService.prisma.roomInvite.findUnique({ where: { id: inviteId } });

      if (!invite) {
        return res.status(404).json({ success: false, message: 'ไม่พบรหัสเชิญในระบบ' });
      }

      await billingService.prisma.roomInvite.delete({ where: { id: inviteId } });

      return res.status(200).json({
        success: true,
        message: `ยกเลิกรหัสเชิญ ${invite.code} เรียบร้อยแล้ว`
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new RoomController();
