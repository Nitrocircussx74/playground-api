const crypto = require('crypto');
const billingService = require('../services/billingService');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedPasswordHash) {
  if (!storedPasswordHash || !storedPasswordHash.includes(':')) return false;
  const [salt, originalHash] = storedPasswordHash.split(':');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === originalHash;
}

class AdminController {
  /**
   * GET /api/admin/me
   * ดึงข้อมูลโปรไฟล์แอดมินที่ล็อกอินอยู่ปัจจุบัน พร้อมตึกที่มีสิทธิ์ดูแล
   */
  async getMe(req, res, next) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const user = await billingService.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          phone: true,
          createdAt: true,
          buildingPermissions: {
            include: {
              building: true
            }
          }
        }
      });

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      return res.status(200).json({
        success: true,
        data: user
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/admin/me/password
   * เปลี่ยนรหัสผ่านของแอดมินที่ล็อกอินอยู่
   */
  async updatePassword(req, res, next) {
    try {
      const userId = req.user?.id;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'กรุณากรอกรหัสผ่านเดิมและรหัสผ่านใหม่'
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร'
        });
      }

      const user = await billingService.prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
        return res.status(400).json({
          success: false,
          message: 'รหัสผ่านเดิมไม่ถูกต้อง'
        });
      }

      const newPasswordHash = hashPassword(newPassword);
      await billingService.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash }
      });

      return res.status(200).json({
        success: true,
        message: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/admin/users
   * ดึงรายชื่อแอดมินทั้งหมด (เฉพาะ OWNER / super_admin)
   */
  async getAdminUsers(req, res, next) {
    try {
      const users = await billingService.prisma.user.findMany({
        where: {
          role: { in: ['OWNER', 'MANAGER', 'ADMIN', 'SUPERADMIN', 'super_admin', 'owner', 'manager'] }
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          phone: true,
          createdAt: true,
          buildingPermissions: {
            include: {
              building: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return res.status(200).json({
        success: true,
        data: users
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/users
   * สร้างบัญชีแอดมินใหม่ (เฉพาะ OWNER / super_admin)
   */
  async createAdminUser(req, res, next) {
    try {
      const { email, password, name, role, phone, buildingIds } = req.body;

      if (!email || !password || !name) {
        return res.status(400).json({
          success: false,
          message: 'กรุณากรอก email, password และ name ให้ครบถ้วน'
        });
      }

      const existing = await billingService.prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() }
      });

      if (existing) {
        return res.status(400).json({
          success: false,
          message: 'อีเมลนี้ถูกใช้งานในระบบแล้ว'
        });
      }

      const passwordHash = hashPassword(password);
      const userRole = (role || 'MANAGER').toUpperCase();

      const newUser = await billingService.prisma.user.create({
        data: {
          email: email.trim().toLowerCase(),
          passwordHash,
          name: name.trim(),
          role: userRole,
          phone: phone ? phone.trim() : null
        }
      });

      // Map building permissions if role is MANAGER and buildingIds provided
      if (userRole === 'MANAGER' && Array.isArray(buildingIds) && buildingIds.length > 0) {
        const permissionsData = buildingIds.map((bId) => ({
          userId: newUser.id,
          buildingId: bId
        }));
        await billingService.prisma.userBuildingPermission.createMany({
          data: permissionsData
        });
      }

      const createdUser = await billingService.prisma.user.findUnique({
        where: { id: newUser.id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          phone: true,
          createdAt: true,
          buildingPermissions: {
            include: { building: true }
          }
        }
      });

      return res.status(201).json({
        success: true,
        message: `สร้างบัญชีผู้ใช้ ${createdUser.name} (${createdUser.role}) เรียบร้อยแล้ว`,
        data: createdUser
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/admin/users/:id/permissions
   * อัปเดต Role และ Map สิทธิ์การเข้าถึงตึก (เฉพาะ OWNER / super_admin)
   */
  async updateUserPermissions(req, res, next) {
    try {
      const { id } = req.params;
      const { role, name, phone, buildingIds } = req.body;

      const user = await billingService.prisma.user.findUnique({
        where: { id }
      });

      if (!user) {
        return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งานที่ต้องการอัปเดต' });
      }

      const newRole = (role || user.role).toUpperCase();

      // 1. Update basic fields & role
      await billingService.prisma.user.update({
        where: { id },
        data: {
          role: newRole,
          ...(name && { name: name.trim() }),
          ...(phone !== undefined && { phone: phone ? phone.trim() : null })
        }
      });

      // 2. Clear old building permissions
      await billingService.prisma.userBuildingPermission.deleteMany({
        where: { userId: id }
      });

      // 3. Re-create permissions if MANAGER
      if (newRole === 'MANAGER' && Array.isArray(buildingIds) && buildingIds.length > 0) {
        const permissionsData = buildingIds.map((bId) => ({
          userId: id,
          buildingId: bId
        }));
        await billingService.prisma.userBuildingPermission.createMany({
          data: permissionsData
        });
      }

      const updatedUser = await billingService.prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          phone: true,
          createdAt: true,
          buildingPermissions: {
            include: { building: true }
          }
        }
      });

      return res.status(200).json({
        success: true,
        message: `อัปเดตสิทธิ์ของ ${updatedUser.name} เรียบร้อยแล้ว`,
        data: updatedUser
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/admin/users/:id
   * ลบบัญชีผู้ใช้งานแอดมิน (เฉพาะ OWNER / super_admin)
   */
  async deleteAdminUser(req, res, next) {
    try {
      const { id } = req.params;

      if (id === req.user?.id) {
        return res.status(400).json({
          success: false,
          message: 'ไม่สามารถลบบัญชีของตัวเองที่กำลังใช้งานอยู่ได้'
        });
      }

      const user = await billingService.prisma.user.findUnique({
        where: { id }
      });

      if (!user) {
        return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งานที่ต้องการลบ' });
      }

      await billingService.prisma.user.delete({
        where: { id }
      });

      return res.status(200).json({
        success: true,
        message: `ลบบัญชี ${user.name} เรียบร้อยแล้ว`
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AdminController();
