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

    const userRole = (req.user.role || 'tenant').toLowerCase();
    const normalizedAllowed = allowedRoles.map((r) => r.toLowerCase());

    const isSuperOrOwner = ['super_admin', 'superadmin', 'owner', 'admin'].includes(userRole);

    // Block explicit manager or tenant from owner endpoints if allowedRoles contains 'owner' or 'super_admin'
    if (normalizedAllowed.includes('owner') && (userRole === 'manager' || userRole === 'tenant')) {
      return res.status(403).json({
        success: false,
        message: `ปฏิเสธการเข้าถึง: คุณไม่มีสิทธิ์ใช้งานส่วนนี้ (Required role: [${allowedRoles.join(', ')}], Current role: [${userRole}])`
      });
    }

    if (isSuperOrOwner || normalizedAllowed.includes(userRole)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: `ปฏิเสธการเข้าถึง: คุณไม่มีสิทธิ์ใช้งานส่วนนี้ (Required role: [${allowedRoles.join(', ')}], Current role: [${userRole}])`
    });
  };
};

module.exports = requireRole;
