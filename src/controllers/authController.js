const authService = require('../services/authService');
const config = require('../config/env');

/**
 * ฟังก์ชันผู้ช่วยสำหรับตั้งค่า HTTP-Only Cookie ให้กับ Refresh Token
 */
const setRefreshTokenCookie = (res, refreshToken) => {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true, // ป้องกัน XSS (JavaScript ฝั่ง Client อ่านค่าไม่ได้)
    secure: config.nodeEnv === 'production', // บังคับใช้ HTTPS ในโหมด Production
    sameSite: config.nodeEnv === 'production' ? 'strict' : 'lax', // ป้องกัน CSRF Attacks
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 วัน
  });
};

/**
 * Controller สำหรับจัดการระบบ Authentication ตามมาตรฐาน JWT Best Practices
 */
class AuthController {
  /**
   * POST /auth/login
   * เข้าสู่ระบบด้วย Email/Password -> ออก Access Token (Body) และ Refresh Token (HttpOnly Cookie)
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;

      // Mock user payload (ในระบบจริงจะค้นหาและเช็ค Password Hash ใน PostgreSQL)
      const mockUser = {
        id: 1,
        email: email,
        name: 'Developer User',
        role: 'developer'
      };

      // 1. สร้าง Access Token (15m) และ Refresh Token (7d)
      const accessToken = authService.generateAccessToken(mockUser);
      const refreshToken = authService.generateRefreshToken(mockUser);

      // 2. บันทึก Refresh Token ลง PostgreSQL Database
      await authService.saveRefreshToken(mockUser.id, refreshToken);

      // 3. ฝัง Refresh Token ลงใน HTTP-Only Cookie
      setRefreshTokenCookie(res, refreshToken);

      // 4. ส่งคืนเฉพาะ Access Token และข้อมูล User ใน Response Body
      return res.status(200).json({
        success: true,
        message: 'เข้าสู่ระบบสำเร็จ (JWT Dual Tokens Issued)',
        accessToken,
        user: mockUser
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /auth/google/callback
   * OAuth Callback -> ออก Access Token และฝัง Refresh Token ใน HttpOnly Cookie
   */
  async googleCallback(req, res, next) {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'ยืนยันตัวตนผ่าน Google ไม่สำเร็จ'
        });
      }

      const accessToken = authService.generateAccessToken(user);
      const refreshToken = authService.generateRefreshToken(user);

      await authService.saveRefreshToken(user.id, refreshToken);
      setRefreshTokenCookie(res, refreshToken);

      return res.status(200).json({
        success: true,
        message: 'เข้าสู่ระบบด้วย Google สำเร็จ',
        accessToken,
        user
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/refresh
   * ขอ Access Token ชุดใหม่โดยใช้ Refresh Token จาก HTTP-Only Cookie (Token Rotation)
   */
  async refresh(req, res, next) {
    try {
      // 1. ดึง Refresh Token จาก HTTP-Only Cookie
      const refreshToken = req.cookies.refreshToken;

      if (!refreshToken) {
        return res.status(401).json({
          success: false,
          message: 'ปฏิเสธการขอ Token ใหม่: ไม่พบ Refresh Token Cookie'
        });
      }

      // 2. ดำเนินการหมุนเวียน Token (Token Rotation)
      const result = await authService.rotateRefreshToken(refreshToken);

      // 3. ตั้งค่า Refresh Token Cookie อันใหม่ส่งกลับไป
      setRefreshTokenCookie(res, result.refreshToken);

      // 4. ส่งคืน Access Token อันใหม่กลับไปให้ Client
      return res.status(200).json({
        success: true,
        message: 'ออก Access Token ใหม่สำเร็จ (Token Rotated)',
        accessToken: result.accessToken
      });
    } catch (error) {
      // หาก Refresh Token ไม่ถูกต้อง ให้เคลียร์ Cookie ทิ้ง
      res.clearCookie('refreshToken');
      return res.status(401).json({
        success: false,
        message: error.message || 'Refresh Token ไม่ถูกต้องหรือหมดอายุ'
      });
    }
  }

  /**
   * POST /auth/logout
   * ออกจากระบบ -> เพิกถอน Refresh Token ใน DB และเคลียร์ HTTP-Only Cookie
   */
  async logout(req, res, next) {
    try {
      const refreshToken = req.cookies.refreshToken;

      if (refreshToken) {
        // เพิกถอน Token ออกจาก Database
        await authService.revokeRefreshToken(refreshToken);
      }

      // เคลียร์ Cookie ออกจาก เบราว์เซอร์
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: config.nodeEnv === 'production' ? 'strict' : 'lax'
      });

      return res.status(200).json({
        success: true,
        message: 'ออกจากระบบสำเร็จ (Refresh Token Revoked & Cookie Cleared)'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /auth/me
   * ดึงข้อมูล Profile ปัจจุบันจาก Access Token
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
