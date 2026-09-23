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

  async findOrCreateLocalUser(email, password, name = 'User') {
    if (!password) {
      const error = new Error('กรุณาระบุรหัสผ่าน');
      error.statusCode = 400;
      throw error;
    }

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      const passwordHash = await bcrypt.hash(password, 10);
      user = await prisma.user.create({
        data: {
          email,
          name,
          role: 'TENANT',
          passwordHash
        }
      });
    } else {
      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        const error = new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
        error.statusCode = 401;
        throw error;
      }
    }

    return user;
  }
}

module.exports = new UserService();
