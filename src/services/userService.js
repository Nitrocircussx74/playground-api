const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../config/prisma');

async function verifyPassword(password, storedPasswordHash) {
  if (!storedPasswordHash) return false;
  if (storedPasswordHash.includes(':')) {
    const [salt, originalHash] = storedPasswordHash.split(':');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return hash === originalHash;
  }
  return await bcrypt.compare(password, storedPasswordHash);
}

class UserService {
  async findById(id) {
    return await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, phone: true, createdAt: true }
    });
  }

  /**
   * ตรวจอีเมล/รหัสผ่านของบัญชีที่มีอยู่แล้วเท่านั้น (ห้ามสร้างบัญชีใหม่จากหน้า Login)
   * ตอบข้อความเดียวกันทั้งกรณีไม่พบอีเมลและรหัสผิด กันการเดาว่าอีเมลไหนมีในระบบ
   */
  async verifyLocalUser(email, password) {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      const error = new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      error.statusCode = 401;
      throw error;
    }

    return user;
  }
}

module.exports = new UserService();
