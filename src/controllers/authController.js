const authService = require('../services/authService');
const config = require('../config/env');

/**
 * Controller สำหรับจัดการระบบ Authentication (Login, OAuth Callback)
 */
class AuthController {
  /**
   * Callback หลังจากยืนยันตัวตนผ่าน Google OAuth 2.0 สำเร็จ
   */
  async googleCallback(req, res, next) {
    try {
      const user = req.user; // ได้มาจาก Passport Google Strategy

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'ยืนยันตัวตนผ่าน Google ไม่สำเร็จ'
        });
      }

      // สร้าง JWT Token ให้กับ User ที่ยืนยันตัวตนผ่าน Google สำเร็จ
      const token = authService.generateToken(user);

      // ส่ง Token กลับไปให้ Client เป็น JSON Response
      return res.status(200).json({
        success: true,
        message: 'เข้าสู่ระบบด้วย Google สำเร็จ',
        token,
        user
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Controller สำหรับทดสอบสร้าง JWT Token แบบ Manual (Mock Login)
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาระบุ Email และ Password'
        });
      }

      // Mock user payload
      const mockUser = {
        id: 'user_123456',
        email: email,
        name: 'Test User',
        role: 'developer'
      };

      // ออก JWT Token
      const token = authService.generateToken(mockUser);

      return res.status(200).json({
        success: true,
        message: 'เข้าสู่ระบบสำเร็จ (JWT Signed)',
        token,
        user: mockUser
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ดูข้อมูล Profile ของ User ปัจจุบัน (รับข้อมูลจาก JWT Token)
   */
  async getProfile(req, res, next) {
    try {
      return res.status(200).json({
        success: true,
        user: req.user
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
