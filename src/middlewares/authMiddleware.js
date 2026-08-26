const authService = require('../services/authService');

/**
 * Middleware สำหรับยืนยันตัวตนด้วย JWT Access Token (Protect Route)
 */
const authenticateJWT = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'ปฏิเสธการเข้าถึง: ไม่พบ Token กรุณาแนบ Bearer Token มาใน Authorization Header'
      });
    }

    const token = authHeader.split(' ')[1];
    
    // ตรวจสอบความถูกต้องของ Access Token
    const decodedPayload = authService.verifyAccessToken(token);

    req.user = decodedPayload;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Access Token หมดอายุแล้ว กรุณาขอ Access Token ใหม่ผ่าน /auth/refresh'
      });
    }

    return res.status(403).json({
      success: false,
      message: 'Access Token ไม่ถูกต้องหรือถูกแก้ไข (Invalid Token)'
    });
  }
};

module.exports = authenticateJWT;
