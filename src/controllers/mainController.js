const mainService = require('../services/mainService');

/**
 * Controller สำหรับจัดการ Endpoint หลัก (/api)
 */
class MainController {
  /**
   * GET /api
   * ดึงข้อมูลหน้าหลัก API (ต้องแนบ JWT Token มาด้วย)
   */
  async getOverview(req, res, next) {
    try {
      // req.user ได้มาจาก authMiddleware หลังผ่านการตรวจเช็ค Token แล้ว
      const result = await mainService.getApiOverview(req.user);

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api
   * ส่งและประมวลผลข้อมูลใหม่ (ต้องแนบ JWT Token มาด้วย)
   */
  async createData(req, res, next) {
    try {
      const payload = req.body;

      if (!payload || Object.keys(payload).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาส่งข้อมูล JSON มาใน Request Body'
        });
      }

      const result = await mainService.processData(payload, req.user);

      return res.status(201).json({
        success: true,
        message: 'สร้างและประมวลผลข้อมูลสำเร็จ',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new MainController();
