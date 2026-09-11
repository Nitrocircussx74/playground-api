const billingService = require('../services/billingService');

/**
 * Middleware เช็คว่าฟีเจอร์ (FeatureToggle) เปิดใช้งานอยู่สำหรับตึกนี้หรือไม่ ก่อนอนุญาตให้เขียนข้อมูล
 * ใช้เฉพาะ Route ที่เป็น Write (POST/PATCH) เท่านั้น — Route แบบ GET/List ไม่เช็ค เพื่อให้ข้อมูลเก่ายังดูได้
 * แม้จะปิดฟีเจอร์ไปแล้วภายหลัง
 *
 * ต้องเรียกหลังจากที่ req.params.buildingId มีค่าแล้ว (Admin Route) หรือ req.buildingId ถูก set แล้ว
 * (LIFF Route ที่ resolve tenant -> room -> building มาก่อนหน้านี้)
 *
 * @param {string} key คีย์ของฟีเจอร์ (เช่น ENABLE_FACILITY_BOOKING, ENABLE_VEHICLE_MANAGEMENT, ENABLE_VOTING)
 */
const requireFeature = (key) => async (req, res, next) => {
  try {
    const buildingId = req.params.buildingId || req.buildingId;
    if (!buildingId) {
      return next();
    }

    const toggle = await billingService.prisma.featureToggle.findFirst({
      where: { key, buildingId }
    });

    // ไม่เจอ Record เฉพาะตึก = ใช้ค่าเริ่มต้น "เปิด" ตรงกับ useFeatureStore.isEnabled() ฝั่ง Frontend
    if (toggle && !toggle.isActive) {
      return res.status(403).json({
        success: false,
        message: 'ฟีเจอร์นี้ถูกปิดใช้งานสำหรับตึกนี้'
      });
    }

    return next();
  } catch (error) {
    next(error);
  }
};

module.exports = requireFeature;
