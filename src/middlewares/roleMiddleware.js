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

    const isHighAdmin = ['super_admin', 'superadmin', 'owner'].includes(userRole);
    const isStaffOrManager = ['admin', 'manager'].includes(userRole);

    // Block non-owners from strict owner-only endpoints (e.g. user management, full system audit log)
    const requiresOwner =
      normalizedAllowed.includes('owner') ||
      normalizedAllowed.includes('super_admin') ||
      normalizedAllowed.includes('superadmin');

    if (requiresOwner && !isHighAdmin) {
      return res.status(403).json({
        success: false,
        message: `ปฏิเสธการเข้าถึง: คุณไม่มีสิทธิ์ใช้งานส่วนนี้ (Required role: [${allowedRoles.join(', ')}], Current role: [${userRole}])`
      });
    }

    // Allow manager and staff for standard admin actions (such as sending LINE notifications, reminders, meter, invoices, parcels)
    if (normalizedAllowed.includes('admin') && (isHighAdmin || isStaffOrManager)) {
      return next();
    }

    if (isHighAdmin || isStaffOrManager || normalizedAllowed.includes(userRole)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: `ปฏิเสธการเข้าถึง: คุณไม่มีสิทธิ์ใช้งานส่วนนี้ (Required role: [${allowedRoles.join(', ')}], Current role: [${userRole}])`
    });
  };
};

module.exports = requireRole;
