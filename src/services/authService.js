const jwt = require('jsonwebtoken');
const config = require('../config/env');
const prisma = require('../config/prisma');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Service สำหรับจัดการการสร้าง ตรวจสอบ และหมุนเวียน (Rotate) JWT Access & Refresh Tokens
 */
class AuthService {
  /**
   * สร้าง (Sign) Access Token (อายุสั้น เช่น 15m)
   * @param {Object} userPayload
   * @returns {string} Access Token
   */
  generateAccessToken(userPayload) {
    const payload = {
      id: userPayload.id,
      email: userPayload.email,
      name: userPayload.displayName || userPayload.name,
      role: userPayload.role || 'user',
      ...(userPayload.tenantId && { tenantId: userPayload.tenantId }),
      ...(userPayload.lineUserId && { lineUserId: userPayload.lineUserId }),
      ...(userPayload.buildingId && { buildingId: userPayload.buildingId }),
      ...(userPayload.roomId && { roomId: userPayload.roomId })
    };

    return jwt.sign(payload, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiresIn
    });
  }

  /**
   * สร้าง (Sign) Refresh Token (อายุยาว เช่น 7d)
   * @param {Object} userPayload
   * @returns {string} Refresh Token
   */
  generateRefreshToken(userPayload) {
    const payload = {
      id: userPayload.id,
      email: userPayload.email,
      name: userPayload.name || userPayload.displayName,
      role: userPayload.role || 'admin'
    };

    return jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn
    });
  }

  /**
   * ตรวจสอบความถูกต้องของ Access Token
   * @param {string} token
   */
  verifyAccessToken(token) {
    return jwt.verify(token, config.jwt.accessSecret);
  }

  /**
   * ยืนยัน Claims ของ Access Token กับ DB ทุก Request: บัญชีถูกลบ = null, บัญชีในตาราง users ใช้ role ล่าสุดจาก DB
   * (ถูกลดสิทธิ์/เปลี่ยน role แล้วมีผลทันที ไม่ต้องรอ Token อายุ 15 นาทีหมด) ส่วนผู้เช่า (id อยู่ในตาราง tenants
   * ไม่ใช่ users) คง role ตาม Token เพราะออกจากการเข้าสู่ระบบด้วย PIN/LINE
   * ponytail: 1-2 Query ต่อ Request ถ้าโหลดสูงให้ใช้ Cache สั้นๆ (เช่น 30 วินาที) หรือ tokenVersion ใน Token
   * @param {Object} decoded Payload ที่ verify แล้ว
   * @returns {Promise<Object|null>}
   */
  async resolveCurrentClaims(decoded) {
    if (!UUID_RE.test(decoded?.id || '')) return null;

    const user = await prisma.user.findUnique({ where: { id: decoded.id }, select: { role: true } });
    if (user) return { ...decoded, role: user.role };

    const tenant = await prisma.tenant.findUnique({ where: { id: decoded.id }, select: { id: true } });
    return tenant ? decoded : null;
  }

  /**
   * ตรวจสอบความถูกต้องของ Refresh Token
   * @param {string} token
   */
  verifyRefreshToken(token) {
    return jwt.verify(token, config.jwt.refreshSecret);
  }

  /**
   * บันทึก Refresh Token ลงใน Database (ผ่าน Prisma RefreshToken model)
   * @param {number|string} userId
   * @param {string} token
   */
  async saveRefreshToken(userId, token) {
    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 วัน
      await prisma.refreshToken.create({
        data: { userId, token, expiresAt }
      });
    } catch (error) {
      // Fallback กรณีไม่ได้ต่อ DB
      console.warn('⚠️ ไม่สามารถบันทึก Refresh Token ลง DB ได้:', error.message);
    }
  }

  /**
   * ทำการหมุนเวียน Token (Token Rotation): ตรวจสอบ Refresh Token เดิม -> เพิกถอน -> ออกคู่ Token ใหม่
   * @param {string} oldRefreshToken
   */
  async rotateRefreshToken(oldRefreshToken) {
    // 1. ตรวจสอบความถูกต้องทางไวยากรณ์และลายเซ็นของ Refresh Token
    const decoded = this.verifyRefreshToken(oldRefreshToken);

    // 2. ดึงข้อมูล User ล่าสุดเพื่อถอด role ที่ถูกต้อง
    let userPayload = { ...decoded };
    try {
      const dbUser = await prisma.user.findUnique({ where: { email: decoded.email } });
      if (dbUser) {
        userPayload = {
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
          role: dbUser.role
        };
      }
    } catch (e) {
      // Fallback กรณีไม่ได้ต่อ DB
    }

    // 3. ตรวจสอบกับ Database ว่า Token นี้ยังมีผลใช้งานอยู่หรือไม่ (ไม่ถูก Revoke)
    try {
      const tokenInDb = await prisma.refreshToken.findFirst({
        where: { token: oldRefreshToken, userId: decoded.id }
      });

      if (!tokenInDb) {
        throw new Error('Refresh Token ไม่ถูกต้องหรือถูกเพิกถอนไปแล้ว');
      }

      // 4. เพิกถอน (ลบ) Refresh Token เดิมออกเพื่อป้องกัน Reuse Attack
      await prisma.refreshToken.deleteMany({ where: { token: oldRefreshToken } });
    } catch (error) {
      if (error.message.includes('เพิกถอน')) throw error;
    }

    // 5. สร้าง Access Token และ Refresh Token คู่ใหม่ (Token Rotation) พร้อมคงค่า role
    const newAccessToken = this.generateAccessToken(userPayload);
    const newRefreshToken = this.generateRefreshToken(userPayload);

    // 6. บันทึก Refresh Token ใหม่ลง DB
    await this.saveRefreshToken(userPayload.id, newRefreshToken);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: userPayload
    };
  }

  /**
   * เพิกถอน Refresh Token ออกจาก Database เมื่อ User ทำการ Logout
   * @param {string} token
   */
  async revokeRefreshToken(token) {
    try {
      await prisma.refreshToken.deleteMany({ where: { token } });
    } catch (error) {
      console.warn('⚠️ ไม่สามารถลบ Refresh Token จาก DB ได้:', error.message);
    }
  }
}

module.exports = new AuthService();
