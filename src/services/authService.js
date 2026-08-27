const jwt = require('jsonwebtoken');
const config = require('../config/env');
const db = require('../config/db');

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
      role: userPayload.role || 'user'
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
   * ตรวจสอบความถูกต้องของ Refresh Token
   * @param {string} token
   */
  verifyRefreshToken(token) {
    return jwt.verify(token, config.jwt.refreshSecret);
  }

  /**
   * บันทึก Refresh Token ลงใน PostgreSQL Database
   * @param {number|string} userId
   * @param {string} token
   */
  async saveRefreshToken(userId, token) {
    try {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 วัน
      await db.query(
        'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [userId, token, expiresAt]
      );
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
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
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
      const tokenInDb = await db.query(
        'SELECT * FROM refresh_tokens WHERE token = $1 AND user_id = $2',
        [oldRefreshToken, decoded.id]
      );

      if (tokenInDb.rows.length === 0) {
        throw new Error('Refresh Token ไม่ถูกต้องหรือถูกเพิกถอนไปแล้ว');
      }

      // 4. เพิกถอน (ลบ) Refresh Token เดิมออกเพื่อป้องกัน Reuse Attack
      await db.query('DELETE FROM refresh_tokens WHERE token = $1', [oldRefreshToken]);
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
      await db.query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
    } catch (error) {
      console.warn('⚠️ ไม่สามารถลบ Refresh Token จาก DB ได้:', error.message);
    }
  }
}

module.exports = new AuthService();
