const authService = require('../services/authService');
const userService = require('../services/userService');
const config = require('../config/env');

const setRefreshTokenCookie = (res, refreshToken) => {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true, // ป้องกัน XSS (Client อ่านค่าไม่ได้)
    secure: config.nodeEnv === 'production', // บังคับใช้ HTTPS ในโหมด Production
    sameSite: config.nodeEnv === 'production' ? 'strict' : 'lax', // ป้องกัน CSRF Attacks
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 วัน
  });
};

class AuthController {
  async login(req, res, next) {
    try {
      const { email } = req.body;

      // ค้นหาหรือบันทึกข้อมูลผู้ใช้ลง PostgreSQL Database
      const user = await userService.findOrCreateLocalUser(email);

      const accessToken = authService.generateAccessToken(user);
      const refreshToken = authService.generateRefreshToken(user);

      await authService.saveRefreshToken(user.id, refreshToken);
      setRefreshTokenCookie(res, refreshToken);

      return res.status(200).json({
        success: true,
        message: 'เข้าสู่ระบบสำเร็จ (JWT Dual Tokens Issued)',
        accessToken,
        user
      });
    } catch (error) {
      next(error);
    }
  }

  async googleCallback(req, res, next) {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ success: false, message: 'ยืนยันตัวตนผ่าน Google ไม่สำเร็จ' });

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

  async refresh(req, res, next) {
    try {
      const refreshToken = req.cookies.refreshToken;
      if (!refreshToken) {
        return res.status(401).json({ success: false, message: 'ปฏิเสธการขอ Token ใหม่: ไม่พบ Refresh Token Cookie' });
      }

      const result = await authService.rotateRefreshToken(refreshToken);
      setRefreshTokenCookie(res, result.refreshToken);

      return res.status(200).json({
        success: true,
        message: 'ออก Access Token ใหม่สำเร็จ (Token Rotated)',
        accessToken: result.accessToken
      });
    } catch (error) {
      res.clearCookie('refreshToken');
      return res.status(401).json({ success: false, message: error.message || 'Refresh Token ไม่ถูกต้องหรือหมดอายุ' });
    }
  }

  async logout(req, res, next) {
    try {
      const refreshToken = req.cookies.refreshToken;
      if (refreshToken) {
        await authService.revokeRefreshToken(refreshToken);
      }

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

  async getProfile(req, res, next) {
    try {
      return res.status(200).json({ success: true, user: req.user });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
