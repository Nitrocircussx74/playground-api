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
          invoices: { orderBy: { createdAt: 'desc' }, take: 10 }
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
}

module.exports = new RoomController();
