const billingService = require('../services/billingService');

/**
 * สถานะจริงของฟีเจอร์สำหรับตึกหนึ่ง ใช้ลำดับเดียวกับ GET /api/v1/features ที่ LIFF ใช้ซ่อนเมนู:
 * ค่าเฉพาะตึก (Override) > ค่า Global (buildingId = null) > เปิดเป็นค่าเริ่มต้น
 * เดิมเช็คแค่ค่าเฉพาะตึก ทำให้ปิดแบบ Global ใน CMS แล้ว LIFF ซ่อนเมนู แต่ API ยังรับคำขอได้อยู่
 */
const isFeatureEnabled = async (key, buildingId = null) => {
  const rows = await billingService.prisma.featureToggle.findMany({
    where: { key, OR: [{ buildingId: null }, ...(buildingId ? [{ buildingId }] : [])] }
  });
  const row = (buildingId && rows.find((r) => r.buildingId === buildingId)) || rows.find((r) => !r.buildingId);
  return row ? row.isActive : true;
};

/**
 * Middleware เช็คว่าฟีเจอร์ (FeatureToggle) เปิดใช้งานอยู่สำหรับตึกนี้หรือไม่ ก่อนอนุญาตให้เขียนข้อมูล
 * ใช้เฉพาะ Route ที่เป็น Write (POST/PATCH) ฝั่ง Admin ที่มี req.params.buildingId
 *
 * @param {string} key คีย์ของฟีเจอร์ (เช่น ENABLE_FACILITY_BOOKING, ENABLE_VEHICLE_MANAGEMENT, ENABLE_VOTING)
 */
const requireFeature = (key) => async (req, res, next) => {
  try {
    if (!(await isFeatureEnabled(key, req.params.buildingId || null))) {
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
module.exports.isFeatureEnabled = isFeatureEnabled;
