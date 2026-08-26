const billingService = require('../services/billingService');

class FeatureController {
  /**
   * ดึงรายการสถานะ Feature Toggles ทั้งหมด
   */
  async getFeatures(req, res, next) {
    try {
      const features = await billingService.prisma.featureToggle.findMany({
        orderBy: { key: 'asc' }
      });

      // แปลงเป็น Map Key-Value { ENABLE_VEHICLE_MANAGEMENT: true, ... }
      const featureMap = {};
      features.forEach((f) => {
        featureMap[f.key] = f.isActive;
      });

      return res.status(200).json({
        success: true,
        data: {
          features,
          featureMap
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * แอดมินอัปเดตสถานะการเปิด-ปิด Feature Toggle (isActive: true/false)
   */
  async updateFeature(req, res, next) {
    try {
      const { key } = req.params;
      const { isActive } = req.body;

      if (isActive == null) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาระบุค่า isActive (true หรือ false)'
        });
      }

      const updatedFeature = await billingService.prisma.featureToggle.upsert({
        where: { key },
        update: { isActive: Boolean(isActive) },
        create: {
          key,
          isActive: Boolean(isActive),
          description: req.body.description || `ฟีเจอร์ ${key}`
        }
      });

      return res.status(200).json({
        success: true,
        message: `อัปเดตสถานะฟีเจอร์ ${key} เป็น ${updatedFeature.isActive ? 'เปิดใช้งาน (ON)' : 'ปิดใช้งาน (OFF)'} เรียบร้อยแล้ว`,
        data: updatedFeature
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new FeatureController();
