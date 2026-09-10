const authService = require('../services/authService');
const userService = require('../services/userService');
const tenantAuthService = require('../services/tenantAuthService');
const config = require('../config/env');

const getCookieOptions = (req) => {
  const isHttps =
    config.nodeEnv === 'production' ||
    Boolean(
      req &&
      (req.secure ||
        req.headers['x-forwarded-proto'] === 'https' ||
        req.headers['x-forwarded-ssl'] === 'on')
    );

  return {
    httpOnly: true, // ป้องกัน XSS (Client อ่านค่าไม่ได้)
    secure: isHttps, // ต้องเป็น true เสมอเมื่อใช้ HTTPS / Cloudflare Tunnel
    sameSite: isHttps ? 'none' : 'lax', // 'none' รองรับ Cross-Origin Cloudflare Tunnels และ LIFF
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 วัน
  };
};

const setRefreshTokenCookie = (res, refreshToken, req) => {
  res.cookie('refreshToken', refreshToken, getCookieOptions(req));
};

/**
 * ส่งผลลัพธ์จาก tenantAuthService ({ statusCode, body, refreshToken }) ออกเป็น HTTP Response
 * พร้อมฝัง Refresh Token Cookie ให้อัตโนมัติถ้ามีการออก Token ใหม่ (Login สำเร็จ)
 */
function respondWithAuthResult(res, req, result) {
  if (result.refreshToken) {
    setRefreshTokenCookie(res, result.refreshToken, req);
  }
  return res.status(result.statusCode).json(result.body);
}

class AuthController {
  /**
   * เข้าสู่ระบบด้วย LINE SSO Token
   * POST /api/auth/login/line
   */
  async loginLine(req, res, next) {
    try {
      const idToken = req.body?.idToken || req.body?.lineIdToken || req.headers['x-line-id-token'];
      const result = await tenantAuthService.loginWithLine({
        idToken,
        lineDisplayName: req.body?.lineDisplayName,
        linePictureUrl: req.body?.linePictureUrl
      });
      return respondWithAuthResult(res, req, result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * เข้าสู่ระบบด้วย LIFF Seamless PIN 6 หลัก
   * POST /api/auth/liff/pin-login
   */
  async pinLogin(req, res, next) {
    try {
      const { lineIdToken, idToken, pin, buildingId } = req.body;
      const rawToken = lineIdToken || idToken || req.headers['x-line-id-token'];
      const result = await tenantAuthService.pinLogin({ rawToken, pin, buildingId });
      return respondWithAuthResult(res, req, result);
    } catch (error) {
      next(error);
    }
  }

  /**
  /**
   * ตั้งค่าหรือรีเซ็ตรหัส PIN 6 หลักสำหรับลูกบ้าน (Setup / Reset PIN)
   * POST /api/auth/liff/setup-pin
   * POST /api/v1/liff/auth/setup-pin
   * POST /api/v1/liff/auth/reset-pin
   */
  async setupPin(req, res, next) {
    try {
      const { pin, newPin, lineIdToken, idToken, phone, phoneNumber, buildingId, lineDisplayName, linePictureUrl, lineStatusMessage } = req.body;
      const targetPin = newPin || pin;
      const rawToken = lineIdToken || idToken || req.headers['x-line-id-token'];
      const rawPhone = phone || phoneNumber;

      const result = await tenantAuthService.setupOrResetPin({
        targetPin,
        rawToken,
        rawPhone,
        buildingId,
        lineDisplayName,
        linePictureUrl,
        lineStatusMessage,
        lineUserIdFromRequest: req.lineUserId || req.user?.lineUserId,
        tenantIdFromRequest: req.tenantId || req.user?.tenantId || req.user?.id
      });
      return respondWithAuthResult(res, req, result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * เปลี่ยนรหัส PIN สำหรับลูกบ้าน (ต้องยืนยันตัวตนด้วย Bearer JWT)
   * POST /api/liff/profile/change-pin
   */
  async changePin(req, res, next) {
    try {
      const { oldPin, newPin } = req.body;
      const result = await tenantAuthService.changePin({
        oldPin,
        newPin,
        tenantId: req.tenantId || req.user?.tenantId || req.user?.id,
        lineUserId: req.lineUserId || req.user?.lineUserId
      });
      return res.status(result.statusCode).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  /**
   * ตรวจสอบสถานะการผูกบัญชีและการตั้งค่า PIN ของลูกบ้าน
   * POST /api/liff/auth/check-status
   */
  async checkAuthStatus(req, res, next) {
    try {
      const { lineIdToken, idToken, buildingId } = req.body;
      const rawToken = lineIdToken || idToken || req.headers['x-line-id-token'];
      const result = await tenantAuthService.checkAuthStatus({
        rawToken,
        buildingId,
        lineUserIdFromRequest: req.lineUserId || req.user?.lineUserId
      });
      return res.status(result.statusCode).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  /**
   * ตรวจสอบว่าเบอร์โทรศัพท์เป็นผู้ใช้เดิมในระบบ HorHub หรือเป็นลูกบ้านใหม่
   * POST /api/v1/liff/auth/verify-phone-status
   */
  async verifyPhoneStatus(req, res, next) {
    try {
      const { phone, phoneNumber } = req.body;
      const result = await tenantAuthService.verifyPhoneStatus({ rawPhone: phone || phoneNumber });
      return res.status(result.statusCode).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  /**
   * ผูก LINE ID ตึกใหม่เข้ากับบัญชีผู้ใช้เดิมด้วย PIN 6 หลัก และออก Token ทันที
   * หากบัญชีนี้ยังไม่เคยตั้งรหัส PIN มาก่อน จะบันทึก PIN ที่ส่งมาเป็นรหัส PIN ใหม่ให้ทันที
   * POST /api/v1/liff/auth/link-and-login
   */
  async linkAndLogin(req, res, next) {
    try {
      const { phone, phoneNumber, pin, buildingId, lineIdToken, idToken, lineDisplayName, linePictureUrl, lineStatusMessage } = req.body;
      const result = await tenantAuthService.linkAndLogin({
        rawPhone: phone || phoneNumber,
        pin,
        buildingId,
        rawToken: lineIdToken || idToken || req.headers['x-line-id-token'],
        lineDisplayName,
        linePictureUrl,
        lineStatusMessage
      });
      return respondWithAuthResult(res, req, result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * เข้าสู่ระบบด้วยเบอร์โทรศัพท์และรหัสผ่าน (Local Password Login)
   * POST /api/auth/login/local
   */
  async loginLocal(req, res, next) {
    try {
      const { phoneNumber, phone, password } = req.body;
      const result = await tenantAuthService.loginLocal({ rawPhone: phoneNumber || phone, password });
      return respondWithAuthResult(res, req, result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * ตั้งค่ารหัสผ่านใหม่หรือเปลี่ยนรหัสผ่านสำหรับลูกบ้าน
   * POST /api/auth/setup-password
   */
  async setupPassword(req, res, next) {
    try {
      const { newPassword, oldPassword } = req.body;
      const result = await tenantAuthService.setupPassword({
        newPassword,
        oldPassword,
        tenantId: req.tenantId || req.user?.tenantId || req.user?.id,
        lineUserId: req.lineUserId || req.user?.lineUserId,
        phone: req.user?.phone
      });
      return res.status(result.statusCode).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  async login(req, res, next) {
    try {
      const { email } = req.body;

      // ค้นหาหรือบันทึกข้อมูลผู้ใช้ลง PostgreSQL Database
      const user = await userService.findOrCreateLocalUser(email);

      const accessToken = authService.generateAccessToken(user);
      const refreshToken = authService.generateRefreshToken(user);

      await authService.saveRefreshToken(user.id, refreshToken);
      setRefreshTokenCookie(res, refreshToken, req);

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
      setRefreshTokenCookie(res, refreshToken, req);

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
      setRefreshTokenCookie(res, result.refreshToken, req);

      return res.status(200).json({
        success: true,
        message: 'ออก Access Token ใหม่สำเร็จ (Token Rotated)',
        accessToken: result.accessToken
      });
    } catch (error) {
      const cookieOpts = getCookieOptions(req);
      delete cookieOpts.maxAge;
      res.clearCookie('refreshToken', cookieOpts);
      return res.status(401).json({ success: false, message: error.message || 'Refresh Token ไม่ถูกต้องหรือหมดอายุ' });
    }
  }

  async logout(req, res, next) {
    try {
      const refreshToken = req.cookies.refreshToken;
      if (refreshToken) {
        await authService.revokeRefreshToken(refreshToken);
      }

      const cookieOpts = getCookieOptions(req);
      delete cookieOpts.maxAge;
      res.clearCookie('refreshToken', cookieOpts);

      return res.status(200).json({
        success: true,
        message: 'ออกจากระบบสำเร็จ (Refresh Token Revoked & Cookie Cleared)'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * เข้าสู่ระบบผ่าน Web Browser ปกติ (Dual-Mode Login สำหรับลูกบ้านที่ไม่ใช้ LINE)
   * POST /api/auth/web/login หรือ POST /api/v1/auth/web/login
   */
  async loginWeb(req, res, next) {
    try {
      const phoneNumber = req.body.phone_number || req.body.phone || req.body.phoneNumber;
      const pin = req.body.pin || req.body.password;
      const result = await tenantAuthService.loginWeb({ phoneNumber, pin });
      return respondWithAuthResult(res, req, result);
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
