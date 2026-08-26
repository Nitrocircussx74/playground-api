const jwt = require('jsonwebtoken');
const config = require('../config/env');

/**
 * Service สำหรับจัดการการสร้างและตรวจสอบ JWT Token
 */
class AuthService {
  /**
   * สร้าง (Sign) JWT Token สำหรับ User
   * @param {Object} userPayload - ข้อมูลของ User ที่ต้องการใส่ไว้ใน Payload
   * @returns {string} JWT Token
   */
  generateToken(userPayload) {
    const payload = {
      id: userPayload.id,
      email: userPayload.email,
      name: userPayload.displayName || userPayload.name,
      role: userPayload.role || 'user'
    };

    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn
    });
  }

  /**
   * ตรวจสอบความถูกต้องของ JWT Token (Verify)
   * @param {string} token - JWT Token ที่ส่งมาจาก Client
   * @returns {Object} Decoded Payload
   */
  verifyToken(token) {
    return jwt.verify(token, config.jwt.secret);
  }
}

module.exports = new AuthService();
