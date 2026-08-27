const billingService = require('../services/billingService');

class FeatureController {
  /**
   * ดึงรายการสถานะ Feature Toggles ทั้งหมด (รองรับแยกตามตึก)
   */
  async getFeatures(req, res, next) {
    try {
      const { buildingId } = req.query;
      const where = buildingId ? { OR: [{ buildingId }, { buildingId: null }] } : {};

      const features = await billingService.prisma.featureToggle.findMany({
        where,
        orderBy: { key: 'asc' }
      });

      // แปลงเป็น Map Key-Value { ENABLE_VEHICLE_MANAGEMENT: true, ... }
      const featureMap = {};
      features.forEach((f) => {
        if (featureMap[f.key] === undefined || f.buildingId === buildingId) {
          featureMap[f.key] = f.isActive;
        }
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
   * แอดมินอัปเดตสถานะการเปิด-ปิด Feature Toggle (isActive: true/false) ประจำตึก
   */
  async updateFeature(req, res, next) {
    try {
      const { key } = req.params;
      const { isActive, buildingId } = req.body;

      if (isActive == null) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาระบุค่า isActive (true หรือ false)'
        });
      }

      const targetBuildingId = buildingId || req.query.buildingId || null;

      let updatedFeature;
      if (targetBuildingId) {
        updatedFeature = await billingService.prisma.featureToggle.upsert({
          where: { key_buildingId: { key, buildingId: targetBuildingId } },
          update: { isActive: Boolean(isActive) },
          create: {
            key,
            isActive: Boolean(isActive),
            buildingId: targetBuildingId,
            description: req.body.description || `ฟีเจอร์ ${key}`
          }
        });
      } else {
        const firstMatch = await billingService.prisma.featureToggle.findFirst({
          where: { key, buildingId: null }
        });
        if (firstMatch) {
          updatedFeature = await billingService.prisma.featureToggle.update({
            where: { id: firstMatch.id },
            data: { isActive: Boolean(isActive) }
          });
        } else {
          updatedFeature = await billingService.prisma.featureToggle.create({
            data: {
              key,
              isActive: Boolean(isActive),
              description: req.body.description || `ฟีเจอร์ ${key}`
            }
          });
        }
      }

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
