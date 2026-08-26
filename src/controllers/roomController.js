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
}

module.exports = new RoomController();
