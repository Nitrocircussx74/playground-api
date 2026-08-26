const db = require('../config/db');

/**
 * Service สำหรับจัดการข้อมูลผู้ใช้ร่วมกับ PostgreSQL Database
 */
class UserService {
  /**
   * ค้นหาผู้ใช้จาก Email
   * @param {string} email
   */
  async findByEmail(email) {
    try {
      const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
      return result.rows[0] || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * ค้นหาผู้ใช้จาก User ID
   * @param {string} id
   */
  async findById(id) {
    try {
      const result = await db.query('SELECT id, email, name, role, provider, created_at FROM users WHERE id = $1', [id]);
      return result.rows[0] || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * ค้นหาหรือสร้างผู้ใช้ใหม่จากการยืนยันตัวตน Google OAuth
   * @param {Object} googleProfile
   */
  async findOrCreateGoogleUser(googleProfile) {
    try {
      const existingUser = await db.query(
        'SELECT * FROM users WHERE google_id = $1 OR email = $2',
        [googleProfile.id, googleProfile.email]
      );

      if (existingUser.rows.length > 0) {
        return existingUser.rows[0];
      }

      const newUser = await db.query(
        `INSERT INTO users (google_id, email, name, avatar, provider, role)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, email, name, avatar, provider, role, created_at`,
        [
          googleProfile.id,
          googleProfile.email,
          googleProfile.displayName,
          googleProfile.avatar,
          'google',
          'user'
        ]
      );

      return newUser.rows[0];
    } catch (error) {
      return {
        id: googleProfile.id,
        email: googleProfile.email,
        name: googleProfile.displayName,
        provider: 'google',
        role: 'user'
      };
    }
  }
}

module.exports = new UserService();
