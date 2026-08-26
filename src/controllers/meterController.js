const billingService = require('../services/billingService');

class MeterController {
  /**
   * ดึงรายการบันทึกมิเตอร์ตามห้องพักหรือรอบบิล
   */
  async getMeterRecords(req, res, next) {
    try {
      const { roomId, billingCycle } = req.query;

      const where = {};
      if (roomId) where.roomId = roomId;
      if (billingCycle) where.billingCycle = billingCycle;

      const records = await billingService.prisma.meterRecord.findMany({
        where,
        orderBy: [{ recordedAt: 'desc' }],
        include: { room: true }
      });

      return res.status(200).json({
        success: true,
        data: records
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * บันทึกข้อมูลมิเตอร์ประจำรอบบิล
   */
  async createMeterRecord(req, res, next) {
    try {
      const { roomId, meterType, currentReading, billingCycle, isReset } = req.body;

      if (!roomId || !meterType || currentReading == null || !billingCycle) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: roomId, meterType, currentReading, and billingCycle'
        });
      }

      const record = await billingService.recordMeterReading({
        roomId,
        meterType,
        currentReading,
        billingCycle,
        isReset
      });

      return res.status(200).json({
        success: true,
        message: 'Meter reading recorded successfully',
        data: record
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new MeterController();
