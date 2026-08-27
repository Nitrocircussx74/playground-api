/**
 * Middleware สำหรับจำกัดสิทธิ์การเข้าถึง API ตาม Role (Role-Based Access Control)
 * @param  {...string} allowedRoles รายชื่อ Roles ที่อนุญาตให้เข้าถึง (เช่น 'admin', 'staff')
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'ปฏิเสธการเข้าถึง: ไม่พบข้อมูลการยืนยันตัวตน (Unauthenticated)'
      });
    }

    const userRole = req.user.role || 'tenant';

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `ปฏิเสธการเข้าถึง: คุณไม่มีสิทธิ์ใช้งานส่วนนี้ (Required role: [${allowedRoles.join(', ')}], Current role: [${userRole}])`
      });
    }

    next();
  };
};

module.exports = requireRole;
