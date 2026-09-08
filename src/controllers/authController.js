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
   * เข้าสู่ระบบด้วย LIFF Seamless PIN 6 หลัก
   * POST /api/auth/liff/pin-login
   */
  async pinLogin(req, res, next) {
    try {
      const { lineIdToken, idToken, pin, buildingId } = req.body;
      const rawToken = lineIdToken || idToken || req.headers['x-line-id-token'];

      if (!rawToken || !pin) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาระบุ LINE ID Token และรหัส PIN 6 หลัก'
        });
      }

      if (!/^\d{6}$/.test(String(pin))) {
        return res.status(400).json({
          success: false,
          message: 'รหัส PIN ต้องเป็นตัวเลข 6 หลักเท่านั้น'
        });
      }

      // 1. ถอดรหัส LINE ID Token เพื่อดึง lineUserId
      let lineUserId = null;
      let lineProfileData = null;
      try {
        const verified = await verifyLineIdToken(rawToken);
        lineUserId = verified?.sub;
        lineProfileData = {
          displayName: verified?.name || req.body?.lineDisplayName || null,
          pictureUrl: verified?.picture || req.body?.linePictureUrl || null
        };
      } catch (err) {
        return res.status(401).json({
          success: false,
          message: 'LINE ID Token ไม่ถูกต้องหรือหมดอายุแล้ว'
        });
      }

      if (!lineUserId) {
        return res.status(401).json({
          success: false,
          message: 'LINE ID Token ไม่ถูกต้องหรือหมดอายุ'
        });
      }

      // 2. ค้นหา Tenant: ตรวจสอบจากตาราง UserLineAccount ก่อน (Multi-Building Mapping)
      let tenant = null;
      if (buildingId) {
        const linkedAccount = await prisma.userLineAccount.findUnique({
          where: {
            buildingId_lineUserId: {
              buildingId,
              lineUserId
            }
          },
          include: {
            tenant: {
              include: { rooms: { include: { building: true } } }
            }
          }
        });
        tenant = linkedAccount?.tenant || null;
      }

      // Fallback: ค้นหาจาก UserLineAccount ใดๆ ที่ตรงกับ lineUserId
      if (!tenant) {
        const anyLinkedAccount = await prisma.userLineAccount.findFirst({
          where: { lineUserId },
          include: {
            tenant: {
              include: { rooms: { include: { building: true } } }
            }
          }
        });
        tenant = anyLinkedAccount?.tenant || null;
      }

      // Fallback: ค้นหาจากตาราง Tenant โดยตรง (Backward Compatibility)
      if (!tenant) {
        tenant = await prisma.tenant.findFirst({
          where: { lineUserId },
          include: { rooms: { include: { building: true } } }
        });
      }

      if (!tenant) {
        return res.status(404).json({
          success: false,
          code: 'TENANT_NOT_FOUND',
          isRegistered: false,
          message: 'ยังไม่พบบัญชีผู้เช่าที่ผูกกับ LINE ในตึกนี้ กรุณาผูกบัญชีด้วยเบอร์โทรศัพท์'
        });
      }

      // 3. ตรวจสอบสถานะการตั้งรหัส PIN
      if (!tenant.pinHash) {
        return res.status(400).json({
          success: false,
          code: 'PIN_NOT_SET',
          message: 'คุณยังไม่ได้ตั้งค่ารหัส PIN 6 หลัก กรุณาตั้งค่า PIN ก่อนใช้งาน'
        });
      }

      // 4. เปรียบเทียบรหัส PIN ด้วย Bcrypt
      const isMatch = await bcrypt.compare(String(pin), tenant.pinHash);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_PIN',
          message: 'รหัส PIN 6 หลักไม่ถูกต้อง'
        });
      }

      // 5. บันทึก/อัปเดต UserLineAccount สำหรับตึกนี้อัตโนมัติ (Seamless Sync)
      if (buildingId) {
        await prisma.userLineAccount.upsert({
          where: {
            buildingId_lineUserId: {
              buildingId,
              lineUserId
            }
          },
          update: {
            tenantId: tenant.id,
            lineDisplayName: lineProfileData?.displayName || tenant.lineDisplayName,
            linePictureUrl: lineProfileData?.pictureUrl || tenant.linePictureUrl
          },
          create: {
            tenantId: tenant.id,
            buildingId,
            lineUserId,
            lineDisplayName: lineProfileData?.displayName || tenant.lineDisplayName,
            linePictureUrl: lineProfileData?.pictureUrl || tenant.linePictureUrl
          }
        }).catch((e) => console.warn('UserLineAccount sync warning in pinLogin:', e.message));
      }

      // 6. ออก Backend JWT และ Refresh Token
      const tenantUser = {
        id: tenant.id,
        tenantId: tenant.id,
        phone: tenant.phone,
        email: `tenant_${tenant.id}@dorm.local`,
        name: tenant.name || `${tenant.firstName} ${tenant.lastName}`.trim(),
        displayName: tenant.lineDisplayName || tenant.firstName,
        role: 'tenant',
        lineUserId: tenant.lineUserId || lineUserId,
        roomId: tenant.rooms?.[0]?.id,
        buildingId: buildingId || tenant.rooms?.[0]?.buildingId
      };

      const accessToken = authService.generateAccessToken(tenantUser);
      const refreshToken = authService.generateRefreshToken(tenantUser);

      await authService.saveRefreshToken(tenant.id, refreshToken);
      setRefreshTokenCookie(res, refreshToken, req);

      return res.status(200).json({
        success: true,
        message: 'เข้าสู่ระบบด้วย PIN สำเร็จ (LIFF PIN Auto-Login Success)',
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
   * ตั้งค่าหรือเปลี่ยนรหัส PIN 6 หลัก
   * POST /api/auth/liff/setup-pin
   */
  async setupPin(req, res, next) {
    try {
      const { pin, newPin, lineIdToken, idToken } = req.body;
      const targetPin = newPin || pin;
      const rawToken = lineIdToken || idToken || req.headers['x-line-id-token'];

      if (!targetPin || !/^\d{6}$/.test(String(targetPin))) {
        return res.status(400).json({
          success: false,
          message: 'รหัส PIN ต้องเป็นตัวเลข 6 หลักเท่านั้น'
        });
      }

      let lineUserId = req.lineUserId || req.user?.lineUserId;
      if (!lineUserId && rawToken) {
        try {
          const verified = await verifyLineIdToken(rawToken);
          lineUserId = verified?.sub;
        } catch {}
      }

      const tenantId = req.tenantId || req.user?.tenantId || req.user?.id;
      let tenant = null;

      if (tenantId) {
        tenant = await prisma.tenant.findUnique({
          where: { id: tenantId },
          include: { rooms: true }
        });
      }
      if (!tenant && lineUserId) {
        tenant = await prisma.tenant.findFirst({
          where: { lineUserId },
          include: { rooms: true }
        });
      }

      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบข้อมูลลูกบ้านสำหรับตั้งค่า PIN'
        });
      }

      const pinHash = await bcrypt.hash(String(targetPin), 10);
      const updatedTenant = await prisma.tenant.update({
        where: { id: tenant.id },
        data: { pinHash },
        include: { rooms: true }
      });

      // ออก Backend JWT เพื่อให้ลูกบ้านเข้าใช้งานระบบได้ทันทีหลังตั้งค่า PIN ครั้งแรก
      const tenantUser = {
        id: updatedTenant.id,
        tenantId: updatedTenant.id,
        phone: updatedTenant.phone,
        email: `tenant_${updatedTenant.id}@dorm.local`,
        name: updatedTenant.name || `${updatedTenant.firstName} ${updatedTenant.lastName}`.trim(),
        displayName: updatedTenant.lineDisplayName || updatedTenant.firstName,
        role: 'tenant',
        lineUserId: updatedTenant.lineUserId,
        roomId: updatedTenant.rooms?.[0]?.id,
        buildingId: updatedTenant.rooms?.[0]?.buildingId
      };

      const accessToken = authService.generateAccessToken(tenantUser);
      const refreshToken = authService.generateRefreshToken(tenantUser);

      await authService.saveRefreshToken(updatedTenant.id, refreshToken);
      setRefreshTokenCookie(res, refreshToken, req);

      return res.status(200).json({
        success: true,
        message: 'ตั้งค่ารหัส PIN 6 หลักสำเร็จเรียบร้อยแล้ว',
        accessToken,
        token: accessToken,
        user: tenantUser,
        tenant: updatedTenant,
        data: {
          accessToken,
          token: accessToken,
          user: tenantUser,
          tenant: updatedTenant
        }
      });
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

      if (!oldPin || !newPin) {
        return res.status(400).json({
          success: false,
          message: 'กรุณากรอกรหัส PIN เดิมและรหัส PIN ใหม่'
        });
      }

      if (!/^\d{6}$/.test(String(newPin))) {
        return res.status(400).json({
          success: false,
          message: 'รหัส PIN ใหม่ต้องเป็นตัวเลข 6 หลักเท่านั้น'
        });
      }

      const tenantId = req.tenantId || req.user?.tenantId || req.user?.id;
      const lineUserId = req.lineUserId || req.user?.lineUserId;

      let tenant = null;
      if (tenantId) {
        tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      } else if (lineUserId) {
        tenant = await prisma.tenant.findFirst({ where: { lineUserId } });
      }

      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบข้อมูลลูกบ้าน'
        });
      }

      // ถ้ามี PIN เดิมอยู่ใน DB ให้ตรวจสอบว่าตรงไหม
      if (tenant.pinHash) {
        const isMatch = await bcrypt.compare(String(oldPin), tenant.pinHash);
        if (!isMatch) {
          return res.status(400).json({
            success: false,
            message: 'รหัส PIN เดิมไม่ถูกต้อง'
          });
        }
      }

      const pinHash = await bcrypt.hash(String(newPin), 10);
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { pinHash }
      });

      return res.status(200).json({
        success: true,
        message: 'เปลี่ยนรหัส PIN สำเร็จเรียบร้อยแล้ว'
      });
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

      let lineUserId = req.lineUserId || req.user?.lineUserId;

      if (!lineUserId && rawToken) {
        try {
          const verified = await verifyLineIdToken(rawToken);
          lineUserId = verified?.sub;
        } catch {
          return res.status(401).json({
            success: false,
            message: 'LINE ID Token ไม่ถูกต้องหรือหมดอายุแล้ว'
          });
        }
      }

      if (!lineUserId) {
        return res.status(200).json({
          success: true,
          isLinked: false,
          hasPin: false,
          data: null
        });
      }

      // 1. ค้นหาในตาราง UserLineAccount ตาม buildingId + lineUserId ก่อน
      let tenant = null;
      if (buildingId) {
        const linkedAccount = await prisma.userLineAccount.findUnique({
          where: {
            buildingId_lineUserId: {
              buildingId,
              lineUserId
            }
          },
          include: {
            tenant: {
              include: { rooms: { include: { building: true } } }
            }
          }
        });
        tenant = linkedAccount?.tenant || null;
      }

      // 2. Fallback: ค้นหาจาก UserLineAccount ใดๆ ที่ตรงกับ lineUserId
      if (!tenant) {
        const anyLinked = await prisma.userLineAccount.findFirst({
          where: { lineUserId },
          include: {
            tenant: {
              include: { rooms: { include: { building: true } } }
            }
          }
        });
        tenant = anyLinked?.tenant || null;
      }

      // 3. Fallback: ค้นหาในตาราง Tenant โดยตรง (Backward-Compatible)
      if (!tenant) {
        tenant = await prisma.tenant.findFirst({
          where: { lineUserId },
          include: { rooms: { include: { building: true } } }
        });
      }

      if (!tenant) {
        return res.status(200).json({
          success: true,
          isLinked: false,
          hasPin: false,
          isRegistered: false,
          data: null
        });
      }

      return res.status(200).json({
        success: true,
        isLinked: true,
        hasPin: Boolean(tenant.pinHash),
        isRegistered: true,
        data: {
          isLinked: true,
          hasPin: Boolean(tenant.pinHash),
          tenant: {
            id: tenant.id,
            firstName: tenant.firstName,
            lastName: tenant.lastName,
            phone: tenant.phone,
            lineDisplayName: tenant.lineDisplayName,
            linePictureUrl: tenant.linePictureUrl
          },
          room: tenant.rooms?.[0] ? {
            id: tenant.rooms[0].id,
            roomNumber: tenant.rooms[0].roomNumber
          } : null
        }
      });
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
      const { phone, phoneNumber, buildingId } = req.body;
      const rawPhone = phone || phoneNumber;

      if (!rawPhone) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาระบุเบอร์โทรศัพท์'
        });
      }

      const cleanDigits = String(rawPhone).replace(/\D/g, '');
      const possiblePhones = [
        rawPhone.trim(),
        cleanDigits,
        cleanDigits.startsWith('0') ? cleanDigits.slice(1) : '0' + cleanDigits,
        cleanDigits.startsWith('66') ? '0' + cleanDigits.slice(2) : cleanDigits
      ];

      const tenant = await prisma.tenant.findFirst({
        where: {
          phone: { in: possiblePhones }
        },
        include: {
          rooms: {
            include: { building: true }
          },
          lineAccounts: true
        }
      });

      if (tenant) {
        const fullName = `${tenant.firstName} ${tenant.lastName}`.trim();
        return res.status(200).json({
          success: true,
          isExistingUser: true,
          hasPin: Boolean(tenant.pinHash),
          userName: fullName,
          tenantName: fullName,
          tenant: {
            id: tenant.id,
            firstName: tenant.firstName,
            lastName: tenant.lastName,
            phone: tenant.phone
          },
          message: 'พบข้อมูลบัญชีของคุณในระบบ HorHub แล้ว กรุณากรอกรหัส PIN เดิมเพื่อยืนยันตัวตนและผูกเข้ากับตึกนี้'
        });
      }

      return res.status(200).json({
        success: true,
        isExistingUser: false,
        hasPin: false,
        message: 'เป็นลูกบ้านใหม่ กรุณากรอกข้อมูลและตั้งค่ารหัส PIN 6 หลักใหม่'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ผูก LINE ID ตึกใหม่เข้ากับบัญชีผู้ใช้เดิมด้วย PIN 6 หลัก และออก Token ทันที
   * POST /api/v1/liff/auth/link-and-login
   */
  async linkAndLogin(req, res, next) {
    try {
      const { phone, phoneNumber, pin, buildingId, lineIdToken, idToken, lineDisplayName, linePictureUrl, lineStatusMessage } = req.body;
      const rawPhone = phone || phoneNumber;
      const rawToken = lineIdToken || idToken || req.headers['x-line-id-token'];

      if (!rawPhone || !pin) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาระบุเบอร์โทรศัพท์และรหัส PIN 6 หลัก'
        });
      }

      let lineUserId = null;
      let profileFromToken = null;
      if (rawToken) {
        try {
          const verified = await verifyLineIdToken(rawToken);
          lineUserId = verified?.sub;
          profileFromToken = {
            displayName: verified?.name || null,
            pictureUrl: verified?.picture || null
          };
        } catch {}
      }

      if (!lineUserId && req.body?.lineUserId) {
        lineUserId = req.body.lineUserId;
      }

      const cleanDigits = String(rawPhone).replace(/\D/g, '');
      const possiblePhones = [
        rawPhone.trim(),
        cleanDigits,
        cleanDigits.startsWith('0') ? cleanDigits.slice(1) : '0' + cleanDigits,
        cleanDigits.startsWith('66') ? '0' + cleanDigits.slice(2) : cleanDigits
      ];

      const tenant = await prisma.tenant.findFirst({
        where: {
          phone: { in: possiblePhones }
        },
        include: {
          rooms: {
            include: { building: true }
          }
        }
      });

      if (!tenant) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบบัญชีผู้ใช้ที่ตรงกับเบอร์โทรศัพท์นี้'
        });
      }

      if (!tenant.pinHash) {
        return res.status(400).json({
          success: false,
          code: 'PIN_NOT_SET',
          message: 'บัญชีนี้ยังไม่ได้ตั้งรหัส PIN 6 หลัก'
        });
      }

      const isMatch = await bcrypt.compare(String(pin), tenant.pinHash);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          code: 'INVALID_PIN',
          message: 'รหัส PIN 6 หลักไม่ถูกต้อง'
        });
      }

      // Upsert UserLineAccount สำหรับตึกนี้
      if (buildingId && lineUserId) {
        await prisma.userLineAccount.upsert({
          where: {
            buildingId_lineUserId: {
              buildingId,
              lineUserId
            }
          },
          update: {
            tenantId: tenant.id,
            lineDisplayName: lineDisplayName || profileFromToken?.displayName || tenant.lineDisplayName,
            linePictureUrl: linePictureUrl || profileFromToken?.pictureUrl || tenant.linePictureUrl,
            lineStatusMessage: lineStatusMessage || tenant.lineStatusMessage
          },
          create: {
            tenantId: tenant.id,
            buildingId,
            lineUserId,
            lineDisplayName: lineDisplayName || profileFromToken?.displayName || tenant.lineDisplayName,
            linePictureUrl: linePictureUrl || profileFromToken?.pictureUrl || tenant.linePictureUrl,
            lineStatusMessage: lineStatusMessage || tenant.lineStatusMessage
          }
        }).catch((e) => console.warn('UserLineAccount upsert warning in linkAndLogin:', e.message));
      }

      const tenantUser = {
        id: tenant.id,
        tenantId: tenant.id,
        phone: tenant.phone,
        email: `tenant_${tenant.id}@dorm.local`,
        name: tenant.name || `${tenant.firstName} ${tenant.lastName}`.trim(),
        displayName: tenant.lineDisplayName || tenant.firstName,
        role: 'tenant',
        lineUserId: lineUserId || tenant.lineUserId,
        roomId: tenant.rooms?.[0]?.id,
        buildingId: buildingId || tenant.rooms?.[0]?.buildingId
      };

      const accessToken = authService.generateAccessToken(tenantUser);
      const refreshToken = authService.generateRefreshToken(tenantUser);

      await authService.saveRefreshToken(tenant.id, refreshToken);
      setRefreshTokenCookie(res, refreshToken, req);

      return res.status(200).json({
        success: true,
        message: 'ยืนยันตัวตนและผูก LINE กับตึกนี้สำเร็จเรียบร้อย',
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
