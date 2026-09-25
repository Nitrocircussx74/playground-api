const crypto = require('crypto');
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
   * ฝังแค่ id ของบัญชี (users หรือ tenants) — role/claims อื่นอ่านสดจาก DB ตอน rotate เสมอ ไม่เชื่อค่าที่ฝังไว้
   * jti ทำให้ Token ที่ออกในวินาทีเดียวกันไม่ซ้ำกัน (คอลัมน์ token เป็น unique)
   * @param {Object} userPayload ต้องมี id
   * @returns {string} Refresh Token
   */
  generateRefreshToken(userPayload) {
    return jwt.sign({ id: userPayload.id, jti: crypto.randomUUID() }, config.jwt.refreshSecret, {
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
    // ต้องล้มเหลวให้เห็น: ถ้าเก็บไม่สำเร็จแล้วปล่อยผ่าน ผู้ใช้จะได้ Token ที่ต่ออายุไม่ได้ (rotate ตรวจกับ DB)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 วัน
    await prisma.refreshToken.create({ data: { userId, token, expiresAt } });
  }

  /**
   * ทำการหมุนเวียน Token (Token Rotation): ตรวจ Refresh Token -> ใช้ได้ครั้งเดียว (ลบแบบ atomic) -> ออกคู่ใหม่
   * - หาบัญชีด้วย id ใน users ก่อน แล้ว tenants (ห้ามใช้ email: email ผู้เช่าไปตรงกับ email แอดมินแล้วได้ role แอดมิน)
   * - บัญชีถูกลบแล้วต้องต่ออายุไม่ได้ และ DB มีปัญหาต้องล้มเหลว (fail-closed) ไม่ปล่อยผ่าน
   * - ผู้เช่าได้ claims ครบเหมือนตอน Login (tenantId/lineUserId/roomId/buildingId/role) จาก buildTenantUserPayload
   * ponytail: ยังไม่ตรวจการนำ Token เก่ามาใช้ซ้ำแล้วเพิกถอนทั้งชุด (reuse detection) — ใช้ซ้ำแล้วแค่ถูกปฏิเสธ
   * @param {string} oldRefreshToken
   */
  async rotateRefreshToken(oldRefreshToken) {
    const decoded = this.verifyRefreshToken(oldRefreshToken);

    // ใช้ Token ครั้งเดียว: ลบสำเร็จ 1 แถว = ผู้เรียกคนนี้ได้สิทธิ์ต่ออายุ (เรียกซ้อนสองครั้งพร้อมกัน ตัวหลังได้ count = 0)
    const { count } = await prisma.refreshToken.deleteMany({ where: { token: oldRefreshToken, userId: decoded.id } });
    if (count === 0) {
      throw new Error('Refresh Token ไม่ถูกต้องหรือถูกเพิกถอนไปแล้ว');
    }

    let userPayload = null;
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (user) {
      userPayload = { id: user.id, email: user.email, name: user.name, role: user.role };
    } else {
      const tenant = await prisma.tenant.findUnique({
        where: { id: decoded.id },
        include: { rooms: { include: { building: true } } }
      });
      if (tenant) {
        // Lazy require: tenantAuthService require authService อยู่แล้ว (กัน Circular Dependency ตอนโหลดโมดูล)
        userPayload = await require('./tenantAuthService').buildTenantUserPayload(tenant);
      }
    }

    if (!userPayload) {
      throw new Error('ไม่พบบัญชีผู้ใช้งานนี้ในระบบแล้ว กรุณาเข้าสู่ระบบใหม่');
    }

    const newAccessToken = this.generateAccessToken(userPayload);
    const newRefreshToken = this.generateRefreshToken(userPayload);
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
