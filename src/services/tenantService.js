const prisma = require('../config/prisma');
const auditService = require('./auditService');

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
    const isRoomOwner = ['room_owner', 'investor'].includes(viewerRole);

    if (isRoomOwner && userId) {
      andConditions.push({
        OR: [
          { rooms: { some: { ownerId: userId, ...(buildingId && { buildingId }) } } },
          { leaseContracts: { some: { room: { ownerId: userId }, ...(buildingId && { buildingId }) } } },
          { roomResidents: { some: { room: { ownerId: userId }, status: 'ACTIVE' } } }
        ]
      });
    } else if (buildingId) {
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
    const viewerRole = (userOptions.role || '').toLowerCase();
    const userId = userOptions.userId || userOptions.id;
    const isRoomOwner = ['room_owner', 'investor'].includes(viewerRole);

    // Build filter for relations if buildingId is passed
    const leaseWhere = {
      ...(buildingId && { buildingId }),
      ...(isRoomOwner && userId && { room: { ownerId: userId } })
    };
    const maintenanceWhere = {
      ...(buildingId && { buildingId }),
      ...(isRoomOwner && userId && { room: { ownerId: userId } })
    };
    const invoiceWhere = {
      ...(isRoomOwner && userId && { room: { ownerId: userId } })
    };

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        rooms: {
          where: isRoomOwner && userId ? { ownerId: userId } : {},
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
          where: invoiceWhere,
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

    // หากเป็น ROOM_OWNER แต่ผู้เช่ารายนี้ไม่มีห้อง/สัญญา/ประวัติที่ผูกกับห้องของตนเองเลย ให้ปฏิเสธการเข้าถึง
    if (isRoomOwner && userId && tenant.rooms.length === 0 && tenant.leaseContracts.length === 0) {
      const isResidentInRoom = await prisma.roomResident.findFirst({
        where: { tenantId, room: { ownerId: userId }, status: 'ACTIVE' }
      });
      if (!isResidentInRoom) {
        return null;
      }
    }

    // RBAC Sanitization: หากบทบาทผู้ขอข้อมูลไม่อยู่ในกลุ่ม OWNER / MANAGER / Admin จะลบ internalNotes ออก
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

  /**
   * ลงทะเบียนผู้เช่าแบบ Walk-in / ไม่ใช้ LINE (Manual Onboarding & Check-in)
   * รองรับการบันทึกข้อมูลผู้เช่า + ผูกเข้าห้องพัก + สร้างสัญญาเช่าใน Transaction เดียว
   * @param {Object} data - ข้อมูลผู้เช่าและสัญญาเช่า
   * @param {Object} adminUser - ข้อมูลแอดมินผู้ดำเนินการ
   */
  async createManualTenant(data, adminUser) {
    const {
      firstName,
      lastName,
      phone,
      idCard,
      internalNotes,
      roomId,
      startDate,
      expectedEndDate,
      depositAmount,
      adminNote
    } = data;

    return await prisma.$transaction(async (tx) => {
      // 1. ตรวจสอบว่ามีผู้เช่าเบอร์โทรนี้อยู่ในระบบแล้วหรือไม่ (ถ้ามีให้อัปเดต ถ้าไม่มีให้สร้างใหม่)
      let tenant = await tx.tenant.findFirst({
        where: { phone: String(phone).trim() }
      });

      if (!tenant) {
        tenant = await tx.tenant.create({
          data: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: String(phone).trim(),
            idCard: idCard ? String(idCard).trim() : null,
            internalNotes: internalNotes || null
          }
        });
      } else {
        tenant = await tx.tenant.update({
          where: { id: tenant.id },
          data: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            idCard: idCard ? String(idCard).trim() : tenant.idCard,
            internalNotes: internalNotes || tenant.internalNotes
          }
        });
      }

      let lease = null;
      // 2. กรณีระบุ roomId ให้ย้ายเข้าห้องพักและสร้างสัญญาเช่า (Active Lease)
      if (roomId) {
        const room = await tx.room.findUnique({ where: { id: roomId } });
        if (!room) {
          throw new Error('ไม่พบข้อมูลห้องพัก/ยูนิตที่ระบุ');
        }

        // อัปเดตห้องพักเป็น occupied และผูก tenantId
        await tx.room.update({
          where: { id: roomId },
          data: {
            status: 'occupied',
            tenantId: tenant.id
          }
        });

        // บันทึก/อัปเดตสถานะผู้เช่าหลักใน RoomResident
        await tx.roomResident.upsert({
          where: {
            roomId_tenantId: {
              roomId: room.id,
              tenantId: tenant.id
            }
          },
          create: {
            roomId: room.id,
            tenantId: tenant.id,
            role: 'PRIMARY',
            isPayer: true,
            status: 'ACTIVE'
          },
          update: {
            role: 'PRIMARY',
            isPayer: true,
            status: 'ACTIVE',
            leftAt: null
          }
        });

        const leaseStartDate = startDate ? new Date(startDate) : new Date();
        const leaseEndDate = expectedEndDate
          ? new Date(expectedEndDate)
          : new Date(new Date().setFullYear(new Date().getFullYear() + 1));

        lease = await tx.leaseContract.create({
          data: {
            tenantId: tenant.id,
            roomId: room.id,
            buildingId: room.buildingId,
            startDate: leaseStartDate,
            expectedEndDate: leaseEndDate,
            depositAmount: depositAmount ? Number(depositAmount) : 0,
            status: 'ACTIVE',
            adminNote: adminNote || 'Walk-in / ไม่ใช้ LINE (เพิ่มโดยผู้ดูแล)'
          },
          include: {
            room: true,
            building: true
          }
        });
      }

      return {
        tenant,
        lease
      };
    });
  }

  /**
   * POST /api/admin/tenants/:id/reset-pin
   * รีเซ็ตรหัส PIN ของผู้เช่า (ตั้งค่า pinHash = null)
   */
  async resetPin(tenantId, user = {}) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      const error = new Error('ไม่พบข้อมูลผู้เช่ารายนี้ในระบบ');
      error.statusCode = 404;
      throw error;
    }

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: { pinHash: null }
    });

    const adminId = user?.id || user?.userId;
    if (adminId) {
      try {
        await auditService.logAction({
          adminId,
          action: 'UPDATE',
          entity: 'TENANT',
          entityId: tenantId,
          oldValues: { hasPin: Boolean(tenant.pinHash) },
          newValues: { hasPin: false, pinHash: null }
        });
      } catch (e) {
        console.warn('AuditLog failed:', e.message);
      }
    }

    return updated;
  }

  /**
   * POST /api/admin/tenants/:id/unlink-line
   * ยกเลิกการผูกบัญชี LINE และล้าง PIN ของผู้เช่า (สำหรับกรณีเปลี่ยนเครื่อง/มือถือหาย)
   */
  async unlinkLine(tenantId, user = {}) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      const error = new Error('ไม่พบข้อมูลผู้เช่ารายนี้ในระบบ');
      error.statusCode = 404;
      throw error;
    }

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        lineUserId: null,
        lineDisplayName: null,
        linePictureUrl: null,
        lineStatusMessage: null,
        pinHash: null
      }
    });

    const adminId = user?.id || user?.userId;
    if (adminId) {
      try {
        await auditService.logAction({
          adminId,
          action: 'UPDATE',
          entity: 'TENANT',
          entityId: tenantId,
          oldValues: {
            lineUserId: tenant.lineUserId,
            lineDisplayName: tenant.lineDisplayName,
            hasPin: Boolean(tenant.pinHash)
          },
          newValues: {
            lineUserId: null,
            lineDisplayName: null,
            hasPin: false,
            pinHash: null
          }
        });
      } catch (e) {
        console.warn('AuditLog failed:', e.message);
      }
    }

    return updated;
  }

  /**
   * POST /api/admin/tenants/:id/generate-invite
   * สร้างรหัสเชิญใหม่ 6 หลัก และอัปเดตเวลาหมดอายุ 7 วัน
   */
  async generateInvite(tenantId, user = {}) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      const error = new Error('ไม่พบข้อมูลผู้เช่ารายนี้ในระบบ');
      error.statusCode = 404;
      throw error;
    }

    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let inviteCode = '';
    for (let i = 0; i < 6; i++) {
      inviteCode += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        inviteCode,
        inviteExpiresAt
      }
    });

    const adminId = user?.id || user?.userId;
    if (adminId) {
      try {
        await auditService.logAction({
          adminId,
          action: 'UPDATE',
          entity: 'TENANT',
          entityId: tenantId,
          newValues: { inviteCode, inviteExpiresAt }
        });
      } catch (e) {
        console.warn('AuditLog failed:', e.message);
      }
    }

    return updated;
  }

  /**
   * ดึงรายชื่อผู้อยู่อาศัยทั้งหมดในห้องพัก (Room Residents)
   */
  async getRoomResidents(roomId) {
    return await prisma.roomResident.findMany({
      where: { roomId, status: 'ACTIVE' },
      include: {
        tenant: true
      },
      orderBy: [
        { role: 'asc' }, // PRIMARY first
        { joinedAt: 'asc' }
      ]
    });
  }

  /**
   * เพิ่มผู้อยู่อาศัยร่วมในห้องพัก (Add Co-Resident)
   */
  async addResidentToRoom(roomId, payload, user = {}) {
    const { firstName, lastName, phone, idCard, role = 'CO_RESIDENT', isPayer = false } = payload;
    if (!firstName || !lastName || !phone) {
      const error = new Error('กรุณาระบุชื่อ นามสกุล และเบอร์โทรศัพท์ของผู้อยู่อาศัย');
      error.statusCode = 400;
      throw error;
    }

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      const error = new Error('ไม่พบข้อมูลห้องพัก');
      error.statusCode = 404;
      throw error;
    }

    return await prisma.$transaction(async (tx) => {
      // 1. ค้นหาหรือสร้างผู้เช่าใหม่
      let tenant = await tx.tenant.findFirst({
        where: { phone: String(phone).trim() }
      });

      if (!tenant) {
        tenant = await tx.tenant.create({
          data: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone: String(phone).trim(),
            idCard: idCard ? String(idCard).trim() : null
          }
        });
      }

      // 2. บันทึกความสัมพันธ์ใน RoomResident
      const resident = await tx.roomResident.upsert({
        where: {
          roomId_tenantId: {
            roomId,
            tenantId: tenant.id
          }
        },
        create: {
          roomId,
          tenantId: tenant.id,
          role,
          isPayer,
          status: 'ACTIVE'
        },
        update: {
          role,
          isPayer,
          status: 'ACTIVE',
          leftAt: null
        },
        include: {
          tenant: true
        }
      });

      return resident;
    });
  }

  /**
   * ลบ/นำผู้อยู่อาศัยออกจากห้องพัก (Remove Resident)
   */
  async removeResidentFromRoom(roomId, tenantId, user = {}) {
    const resident = await prisma.roomResident.findUnique({
      where: {
        roomId_tenantId: {
          roomId,
          tenantId
        }
      }
    });

    if (!resident) {
      const error = new Error('ไม่พบข้อมูลผู้อยู่อาศัยรายนี้ในห้อง');
      error.statusCode = 404;
      throw error;
    }

    // อัปเดตสถานะเป็น MOVED_OUT และลงวันที่ออก
    return await prisma.roomResident.update({
      where: {
        roomId_tenantId: {
          roomId,
          tenantId
        }
      },
      data: {
        status: 'MOVED_OUT',
        leftAt: new Date()
      },
      include: {
        tenant: true
      }
    });
  }
}

module.exports = new TenantService();
