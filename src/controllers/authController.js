const authService = require('../services/authService');
const userService = require('../services/userService');
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

const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { verifyLineIdToken } = require('../middlewares/liffAuthMiddleware');

class AuthController {
  /**
   * เข้าสู่ระบบด้วย LINE SSO Token
   * POST /api/auth/login/line
   */
  async loginLine(req, res, next) {
    try {
      const idToken = req.body?.idToken || req.body?.lineIdToken || req.headers['x-line-id-token'];
      if (!idToken) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาระบุ LINE ID Token สำหรับยืนยันตัวตน'
        });
      }

      let lineUserId;
      let lineProfileData = null;
      try {
        const verified = await verifyLineIdToken(idToken);
        lineUserId = verified.sub;
        lineProfileData = {
          displayName: verified.name || req.body?.lineDisplayName || null,
          pictureUrl: verified.picture || req.body?.linePictureUrl || null
        };
      } catch (err) {
        return res.status(401).json({
          success: false,
          message: 'LINE ID Token ไม่ถูกต้องหรือหมดอายุแล้ว'
        });
      }

      // ค้นหาผู้เช่าตาม lineUserId
      let tenant = await prisma.tenant.findFirst({
        where: { lineUserId },
        include: { rooms: { include: { building: true } } }
      });

      if (!tenant) {
        return res.status(404).json({
          success: false,
          isRegistered: false,
          message: 'ไม่พบข้อมูลลูกบ้านที่ผูกกับบัญชี LINE นี้ กรุณาลงทะเบียนก่อน'
        });
      }

      // ซิงค์ชื่อและรูป LINE หากมี
      if (lineProfileData && (lineProfileData.displayName || lineProfileData.pictureUrl)) {
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            ...(lineProfileData.displayName && { lineDisplayName: lineProfileData.displayName }),
            ...(lineProfileData.pictureUrl && { linePictureUrl: lineProfileData.pictureUrl })
          }
        }).catch(() => {});
      }

      const tenantUser = {
        id: tenant.id,
        tenantId: tenant.id,
        phone: tenant.phone,
        email: `tenant_${tenant.id}@dorm.local`,
        name: tenant.name || `${tenant.firstName} ${tenant.lastName}`.trim(),
        displayName: tenant.lineDisplayName || tenant.firstName,
        role: 'tenant',
        lineUserId: tenant.lineUserId,
        roomId: tenant.rooms?.[0]?.id,
        buildingId: tenant.rooms?.[0]?.buildingId
      };

      const accessToken = authService.generateAccessToken(tenantUser);
      const refreshToken = authService.generateRefreshToken(tenantUser);

      await authService.saveRefreshToken(tenant.id, refreshToken);
      setRefreshTokenCookie(res, refreshToken, req);

      return res.status(200).json({
        success: true,
        message: 'เข้าสู่ระบบด้วย LINE สำเร็จ (LINE SSO Login Success)',
        accessToken,
        token: accessToken,
        user: tenantUser,
        tenant,
        data: {
          accessToken,
          token: accessToken,
          user: tenantUser,
          tenant
        }
      });
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
      const rawPhone = phoneNumber || phone;

      if (!rawPhone || !password) {
        return res.status(400).json({
          success: false,
          message: 'กรุณากรอกเบอร์โทรศัพท์และรหัสผ่าน'
        });
      }

      const cleanDigits = String(rawPhone).replace(/\D/g, '');
      const possiblePhones = [
        rawPhone.trim(),
        cleanDigits,
        cleanDigits.startsWith('0') ? cleanDigits.slice(1) : '0' + cleanDigits,
        cleanDigits.startsWith('66') ? '0' + cleanDigits.slice(2) : cleanDigits
      ];

      // 1. ค้นหาในตาราง Tenant ก่อน
      const tenant = await prisma.tenant.findFirst({
        where: {
          phone: { in: possiblePhones }
        },
        include: { rooms: { include: { building: true } } }
      });

      if (tenant) {
        if (!tenant.passwordHash) {
          return res.status(400).json({
            success: false,
            code: 'PASSWORD_NOT_SET',
            message: 'คุณยังไม่ได้ตั้งรหัสผ่าน กรุณาเข้าสู่ระบบด้วย LINE เพื่อตั้งค่ารหัสผ่าน'
          });
        }

        const isMatch = await bcrypt.compare(password, tenant.passwordHash);
        if (!isMatch) {
          return res.status(401).json({
            success: false,
            message: 'เบอร์โทรศัพท์หรือรหัสผ่านไม่ถูกต้อง'
          });
        }

        const tenantUser = {
          id: tenant.id,
          tenantId: tenant.id,
          phone: tenant.phone,
          email: `tenant_${tenant.id}@dorm.local`,
          name: tenant.name || `${tenant.firstName} ${tenant.lastName}`.trim(),
          displayName: tenant.lineDisplayName || tenant.firstName,
          role: 'tenant',
          lineUserId: tenant.lineUserId,
          roomId: tenant.rooms?.[0]?.id,
          buildingId: tenant.rooms?.[0]?.buildingId
        };

        const accessToken = authService.generateAccessToken(tenantUser);
        const refreshToken = authService.generateRefreshToken(tenantUser);

        await authService.saveRefreshToken(tenant.id, refreshToken);
        setRefreshTokenCookie(res, refreshToken, req);

        return res.status(200).json({
          success: true,
          message: 'เข้าสู่ระบบสำเร็จ (Local Password Login Success)',
          accessToken,
          token: accessToken,
          user: tenantUser,
          tenant,
          data: {
            accessToken,
            token: accessToken,
            user: tenantUser,
            tenant
          }
        });
      }

      // 2. ค้นหาในตาราง User (สำหรับ Admin/Staff)
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { phone: { in: possiblePhones } },
            { email: rawPhone.trim().toLowerCase() }
          ]
        }
      });

      if (user && user.passwordHash) {
        let isMatch = false;
        if (user.passwordHash.includes(':')) {
          const [salt, key] = user.passwordHash.split(':');
          const crypto = require('crypto');
          const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
          isMatch = (hash === key);
        } else {
          isMatch = await bcrypt.compare(password, user.passwordHash);
        }

        if (isMatch) {
          const accessToken = authService.generateAccessToken(user);
          const refreshToken = authService.generateRefreshToken(user);

          await authService.saveRefreshToken(user.id, refreshToken);
          setRefreshTokenCookie(res, refreshToken, req);

          return res.status(200).json({
            success: true,
            message: 'เข้าสู่ระบบสำเร็จ (Admin / Staff Login Success)',
            accessToken,
            token: accessToken,
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role
            }
          });
        }
      }

      return res.status(401).json({
        success: false,
        message: 'เบอร์โทรศัพท์หรือรหัสผ่านไม่ถูกต้อง'
      });
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
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร'
        });
      }

      const tenantId = req.tenantId || req.user?.tenantId || req.user?.id;
      const lineUserId = req.lineUserId || req.user?.lineUserId;
      const phone = req.user?.phone;

      let tenant = null;
      if (tenantId) {
        tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      }
      if (!tenant && lineUserId) {
        tenant = await prisma.tenant.findFirst({ where: { lineUserId } });
      }
      if (!tenant && phone) {
        tenant = await prisma.tenant.findFirst({ where: { phone } });
      }

      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบข้อมูลลูกบ้านสำหรับตั้งรหัสผ่าน'
        });
      }

      // หากมีรหัสผ่านเดิมอยู่แล้ว และระบุ oldPassword มา ให้ตรวจก่อน
      if (tenant.passwordHash && oldPassword) {
        const isOldMatch = await bcrypt.compare(oldPassword, tenant.passwordHash);
        if (!isOldMatch) {
          return res.status(400).json({
            success: false,
            message: 'รหัสผ่านเดิมไม่ถูกต้อง'
          });
        }
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { passwordHash: hashedPassword }
      });

      return res.status(200).json({
        success: true,
        message: 'ตั้งค่ารหัสผ่านใหม่สำเร็จเรียบร้อยแล้ว สามารถใช้เบอร์โทรศัพท์และรหัสผ่านนี้ล็อกอินได้'
      });
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

  async getProfile(req, res, next) {
    try {
      return res.status(200).json({ success: true, user: req.user });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AuthController();
