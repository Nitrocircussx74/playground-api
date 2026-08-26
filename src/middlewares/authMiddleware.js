const authService = require('../services/authService');

/**
 * Middleware สำหรับยืนยันตัวตนด้วย JWT Token (Protect Route)
 */
const authenticateJWT = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // ตรวจสอบว่ามีการแนบ Header Authorization มาหรือไม่
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'ปฏิเสธการเข้าถึง: ไม่พบ Token กรุณาแนบ Bearer Token มาใน Authorization Header'
      });
    }

    // สกัดเอาเฉพาะส่วน Token (ตัดคำว่า 'Bearer ' ออก)
    const token = authHeader.split(' ')[1];

    // ตรวจสอบความถูกต้องของ Token
    const decodedPayload = authService.verifyToken(token);

    // ฝังข้อมูล user ที่ยืนยันตัวตนแล้วเข้าสู่ req.user เพื่อให้ Controller ใช้งานต่อได้
    req.user = decodedPayload;

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token หมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่อีกครั้ง'
      });
    }

    return res.status(403).json({
      success: false,
      message: 'Token ไม่ถูกต้องหรือถูกแก้ไข (Invalid Token)'
    });
  }
};

module.exports = authenticateJWT;
