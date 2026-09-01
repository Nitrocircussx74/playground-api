const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class TenantService {
  /**
   * ดึงข้อมูลรายชื่อผู้เช่าทั้งหมดในระบบพร้อมห้องพักปัจจุบันและสัญญาเช่าล่าสุด (รองรับการกรองตาม buildingId และ RBAC)
   * @param {Object} queryParams - ตัวเลือกการค้นหา { search, buildingId }
   * @param {Object} userOptions - ตัวเลือกบริบทผู้ร้องขอ { role, userId }
   */
  async getAllTenants(queryParams = {}, userOptions = {}) {
    const { search, buildingId } = queryParams;
    const andConditions = [];

    // Building Filter & RBAC Permission Checking
    const viewerRole = (userOptions.role || '').toLowerCase();
    const userId = userOptions.userId || userOptions.id;
    const isFullAdmin = ['super_admin', 'superadmin', 'owner'].includes(viewerRole);

    if (buildingId) {
      if (!isFullAdmin && userId) {
        const perm = await prisma.userBuildingPermission.findUnique({
          where: { userId_buildingId: { userId, buildingId } }
        });
        if (!perm) {
          const err = new Error('คุณไม่มีสิทธิ์เข้าถึงข้อมูลของอาคาร/ตึกนี้');
          err.statusCode = 403;
          throw err;
        }
      }
      andConditions.push({
        OR: [
          { rooms: { some: { buildingId } } },
          { leaseContracts: { some: { buildingId } } }
        ]
      });
    } else if (!isFullAdmin && userId) {
      const permissions = await prisma.userBuildingPermission.findMany({
        where: { userId },
        select: { buildingId: true }
      });
      const allowedBuildingIds = permissions.map((p) => p.buildingId);
      andConditions.push({
        OR: [
          { rooms: { some: { buildingId: { in: allowedBuildingIds } } } },
          { leaseContracts: { some: { buildingId: { in: allowedBuildingIds } } } }
        ]
      });
    }

    if (search) {
      andConditions.push({
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { idCard: { contains: search, mode: 'insensitive' } }
        ]
      });
    }

    const where = andConditions.length > 0 ? { AND: andConditions } : {};

    const tenants = await prisma.tenant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        rooms: {
          include: {
            building: true
          }
        },
        leaseContracts: {
          orderBy: { startDate: 'desc' },
          take: 1,
          include: {
            room: true,
            building: true
          }
        }
      }
    });

    return tenants;
  }

  /**
   * ดึงข้อมูลผู้เช่าแบบจัดเต็ม (Deep Fetching 360-Degree Profile)
   * Relation ที่ดึงมา:
   * 1. Rooms ทั้งหมดที่ผูกอยู่ปัจจุบัน
   * 2. LeaseContracts สัญญาเช่าทั้งหมด (เรียงจากใหม่ไปเก่า) พร้อมข้อมูล Room, Building และ MoveOutRecord
   * 3. Invoices ประวัติการจ่ายเงินทั้งหมด (เรียงจากใหม่ไปเก่า) พร้อมข้อมูล Room
   * 4. MaintenanceRequests ประวัติการแจ้งซ่อมทั้งหมด (เรียงจากใหม่ไปเก่า) พร้อมข้อมูล Room และ Building
   * 
   * @param {string} tenantId - UUID ของผู้เช่า
   * @param {Object} userOptions - ตัวเลือกบริบทผู้ร้องขอ (เช่น user role, buildingId สำหรับ RBAC)
   */
  async getTenantProfile(tenantId, userOptions = {}) {
    const { buildingId } = userOptions;

    // Build filter for relations if buildingId is passed
    const leaseWhere = buildingId ? { buildingId } : {};
    const maintenanceWhere = buildingId ? { buildingId } : {};

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        rooms: {
          include: {
            building: true
          }
        },
        leaseContracts: {
          where: leaseWhere,
          orderBy: { startDate: 'desc' },
          include: {
            room: {
              include: {
                building: true
              }
            },
            building: true,
            moveOutRecord: true
          }
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          include: {
            room: {
              include: {
                building: true
              }
            }
          }
        },
        maintenanceRequests: {
          where: maintenanceWhere,
          orderBy: { createdAt: 'desc' },
          include: {
            room: {
              include: {
                building: true
              }
            },
            building: true
          }
        }
      }
    });

    if (!tenant) {
      return null;
    }

    // RBAC Sanitization: หากบทบาทผู้ขอข้อมูลไม่อยู่ในกลุ่ม OWNER / MANAGER / Admin จะลบ internalNotes ออก
    const viewerRole = (userOptions.role || '').toLowerCase();
    const canViewNotes = ['owner', 'manager', 'super_admin', 'superadmin', 'admin'].includes(viewerRole);

    if (!canViewNotes) {
      tenant.internalNotes = null;
    }

    return tenant;
  }

  /**
   * อัปเดตบันทึกภายใน (Internal Notes) และสถานะ Blacklist ของผู้เช่า
   * @param {string} tenantId - UUID ของผู้เช่า
   * @param {Object} payload - ข้อมูลที่ต้องการอัปเดต { internalNotes, isBlacklisted }
   */
  async updateTenantNotes(tenantId, payload) {
    const updateData = {};

    if (payload.internalNotes !== undefined) {
      updateData.internalNotes = payload.internalNotes;
    }

    if (payload.isBlacklisted !== undefined) {
      updateData.isBlacklisted = Boolean(payload.isBlacklisted);
    }

    const updatedTenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: updateData,
      include: {
        rooms: {
          include: {
            building: true
          }
        },
        leaseContracts: {
          orderBy: { startDate: 'desc' },
          take: 1
        }
      }
    });

    return updatedTenant;
  }
}

module.exports = new TenantService();
