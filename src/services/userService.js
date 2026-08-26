const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function verifyPassword(password, storedPasswordHash) {
  if (!storedPasswordHash || !storedPasswordHash.includes(':')) return false;
  const [salt, originalHash] = storedPasswordHash.split(':');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === originalHash;
}

class UserService {
  async findByEmail(email) {
    return await prisma.user.findUnique({ where: { email } });
  }

  async findById(id) {
    return await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, phone: true, createdAt: true }
    });
  }

  async findOrCreateLocalUser(email, password, name = 'User') {
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.pbkdf2Sync(password || 'password123', salt, 1000, 64, 'sha512').toString('hex');
      const passwordHash = `${salt}:${hash}`;

      user = await prisma.user.create({
        data: {
          email,
          name,
          role: email.includes('admin') ? 'ADMIN' : 'TENANT',
          passwordHash
        }
      });
    } else if (password) {
      const isValid = verifyPassword(password, user.passwordHash);
      if (!isValid) {
        throw new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      }
    }

    return user;
  }
}

module.exports = new UserService();
