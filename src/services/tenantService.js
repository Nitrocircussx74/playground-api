const prisma = require('../config/prisma');
const auditService = require('./auditService');
const lineService = require('./lineService');
const authService = require('./authService');
const { getPhoneVariants } = require('../utils/normalizePhone');

const ROOM_WITH_BUILDING_INCLUDE = { rooms: { include: { building: true } } };

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

    // ใช้ crypto.randomInt (CSPRNG) แทน Math.random() ที่เดาได้ง่ายกว่าสำหรับรหัสเชิญ
    const crypto = require('crypto');
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let inviteCode = '';
    for (let i = 0; i < 6; i++) {
      inviteCode += characters.charAt(crypto.randomInt(0, characters.length));
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

  /**
   * ตรวจสอบสถานะการเป็นลูกบ้านผ่าน lineUserId สำหรับ Smart Entry Gateway Router (LIFF)
   * ถ้ายังไม่เคยผูก LINE แต่ระบุ phone/roomNumber/tenantId มาด้วย จะผูก lineUserId ให้อัตโนมัติ
   */
  async checkTenantStatus({ lineUserId, phone, roomNumber, tenantId, lineUser }) {
    if (!lineUserId) {
      return { isRegistered: false, data: null };
    }

    // 1. ค้นหาผู้เช่าที่ผูกกับ lineUserId อยู่แล้ว
    let tenant = await prisma.tenant.findFirst({ where: { lineUserId }, include: ROOM_WITH_BUILDING_INCLUDE });

    // 2. หากยังไม่พบ และมีการส่ง phone / roomNumber / tenantId เข้ามา ให้ทำการผูก lineUserId เข้ากับ Tenant ทันที
    if (!tenant && phone) {
      const cleanPhone = String(phone).trim();
      tenant = await prisma.tenant.findFirst({ where: { phone: cleanPhone }, include: ROOM_WITH_BUILDING_INCLUDE });
      if (tenant && !tenant.lineUserId) {
        tenant = await prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            lineUserId,
            lineDisplayName: lineUser?.displayName || tenant.lineDisplayName,
            linePictureUrl: lineUser?.pictureUrl || tenant.linePictureUrl
          },
          include: ROOM_WITH_BUILDING_INCLUDE
        });
      }
    }

    if (!tenant && roomNumber) {
      const room = await prisma.room.findFirst({
        where: { roomNumber: String(roomNumber).trim() },
        include: { tenant: { include: ROOM_WITH_BUILDING_INCLUDE } }
      });
      if (room?.tenant) {
        tenant = room.tenant;
        if (!tenant.lineUserId) {
          tenant = await prisma.tenant.update({
            where: { id: tenant.id },
            data: {
              lineUserId,
              lineDisplayName: lineUser?.displayName || tenant.lineDisplayName,
              linePictureUrl: lineUser?.pictureUrl || tenant.linePictureUrl
            },
            include: ROOM_WITH_BUILDING_INCLUDE
          });
        }
      }
    }

    if (!tenant && tenantId) {
      const matched = await prisma.tenant.findUnique({ where: { id: tenantId }, include: ROOM_WITH_BUILDING_INCLUDE });
      // ⚠️ ต้องเช็คว่ายังไม่เคยผูก LINE ไว้ก่อน เหมือน branch phone/roomNumber ด้านบน
      // ห้ามเขียนทับ lineUserId ของ tenant ที่ผูกบัญชีแล้ว ไม่งั้นแค่รู้ tenantId (UUID)
      // ก็ยึดบัญชีคนอื่นได้ทันที (Account Takeover)
      if (matched && !matched.lineUserId) {
        tenant = await prisma.tenant.update({
          where: { id: matched.id },
          data: {
            lineUserId,
            lineDisplayName: lineUser?.displayName || matched.lineDisplayName,
            linePictureUrl: lineUser?.pictureUrl || matched.linePictureUrl
          },
          include: ROOM_WITH_BUILDING_INCLUDE
        });
      }
    }

    if (!tenant) {
      return { isRegistered: false, data: null };
    }

    // Sync LINE profile หากมีการเปลี่ยนแปลง
    if (lineUser) {
      if ((lineUser.displayName && lineUser.displayName !== tenant.lineDisplayName) ||
          (lineUser.pictureUrl && lineUser.pictureUrl !== tenant.linePictureUrl)) {
        await prisma.tenant.update({
          where: { id: tenant.id },
          data: {
            lineDisplayName: lineUser.displayName || tenant.lineDisplayName,
            linePictureUrl: lineUser.pictureUrl || tenant.linePictureUrl
          }
        }).catch(() => {});
      }
    }

    const room = tenant.rooms && tenant.rooms.length > 0 ? tenant.rooms[0] : null;
    const building = room && room.building ? room.building : null;

    return {
      isRegistered: true,
      data: {
        tenant: {
          id: tenant.id,
          firstName: tenant.firstName,
          lastName: tenant.lastName,
          phone: tenant.phone,
          lineUserId: tenant.lineUserId,
          lineDisplayName: tenant.lineDisplayName,
          linePictureUrl: tenant.linePictureUrl,
          lineStatusMessage: tenant.lineStatusMessage
        },
        room: room ? { id: room.id, roomNumber: room.roomNumber, price: room.price } : null,
        building: building ? { id: building.id, name: building.name } : null
      }
    };
  }

  /**
   * ยืนยันตัวตนและผูกบัญชีลูกบ้านผ่านหมายเลขโทรศัพท์ (Phone Number Verification)
   */
  async verifyPhoneAndLinkTenant({ phone, roomNumber, buildingId, building, lineDisplayName, linePictureUrl, lineStatusMessage, lineUserId, lineUser }) {
    if (!phone) {
      const error = new Error('กรุณาระบุหมายเลขโทรศัพท์ที่ลงทะเบียนไว้');
      error.statusCode = 400;
      throw error;
    }

    // Resolve buildingId หากส่งมาเป็น name หรือ UUID
    let resolvedBuildingId = buildingId || null;
    if (!resolvedBuildingId && building) {
      const trimmedBuilding = String(building).trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmedBuilding);
      const b = await prisma.building.findFirst({
        where: isUuid
          ? { id: trimmedBuilding }
          : {
              OR: [
                { name: { equals: trimmedBuilding, mode: 'insensitive' } },
                { name: { contains: trimmedBuilding, mode: 'insensitive' } }
              ]
            },
        select: { id: true }
      });
      if (b) resolvedBuildingId = b.id;
    }

    const phoneConditions = getPhoneVariants(phone).map((p) => ({ phone: p }));
    const tenantWhere = { OR: phoneConditions };

    if (resolvedBuildingId) {
      tenantWhere.AND = [
        {
          OR: [
            { rooms: { some: { buildingId: resolvedBuildingId } } },
            { leaseContracts: { some: { room: { buildingId: resolvedBuildingId } } } }
          ]
        }
      ];
    }

    // ค้นหาผู้เช่าจากเบอร์โทรศัพท์ (และตึกที่ระบุถ้ามี)
    let tenant = await prisma.tenant.findFirst({
      where: tenantWhere,
      include: {
        rooms: { include: { building: true } },
        leaseContracts: { where: { status: 'ACTIVE' }, include: { room: { include: { building: true } } } }
      }
    });

    // หากมีระบุ roomNumber เพิ่มเติม ช่วยค้นหา
    if (!tenant && roomNumber) {
      const roomWhere = { roomNumber: String(roomNumber).trim() };
      if (resolvedBuildingId) {
        roomWhere.buildingId = resolvedBuildingId;
      }

      const room = await prisma.room.findFirst({
        where: roomWhere,
        include: {
          tenant: {
            include: {
              rooms: { include: { building: true } },
              leaseContracts: { where: { status: 'ACTIVE' }, include: { room: { include: { building: true } } } }
            }
          }
        }
      });
      if (room?.tenant) {
        tenant = room.tenant;
      }
    }

    if (!tenant) {
      const error = new Error(`ไม่พบข้อมูลผู้เช่าที่ลงทะเบียนด้วยเบอร์โทร ${phone} ในระบบ กรุณาตรวจสอบเบอร์โทรศัพท์หรือติดต่อผู้ดูแลตึก`);
      error.statusCode = 404;
      throw error;
    }

    // ป้องกัน Account Takeover: ถ้าบัญชีนี้ผูกกับ LINE คนอื่นไว้แล้ว ห้ามให้ LINE ปัจจุบัน
    // (ที่แค่รู้เบอร์โทรของเจ้าของบัญชี) มาแย่งผูกทับแทนเจ้าของตัวจริง
    if (tenant.lineUserId && lineUserId && tenant.lineUserId !== lineUserId) {
      const error = new Error('บัญชีนี้ผูกกับ LINE อื่นไว้แล้ว กรุณาติดต่อนิติบุคคลประจำหอพักเพื่อยกเลิกการผูกก่อน');
      error.statusCode = 403;
      error.code = 'ACCOUNT_ALREADY_LINKED';
      throw error;
    }

    // ตรวจสอบว่า lineUserId นี้เคยผูกกับผู้เช่ารายอื่นหรือไม่
    if (lineUserId) {
      const existingTenant = await prisma.tenant.findUnique({ where: { lineUserId } });
      if (existingTenant && existingTenant.id !== tenant.id) {
        await prisma.tenant.update({ where: { id: existingTenant.id }, data: { lineUserId: null } }).catch(() => {});
      }
    }

    // ดึงโปรไฟล์ LINE จริง
    let realDisplayName = lineUser?.displayName || lineDisplayName || tenant.lineDisplayName;
    let realPictureUrl = lineUser?.pictureUrl || linePictureUrl || tenant.linePictureUrl;
    let realStatusMessage = lineStatusMessage || tenant.lineStatusMessage;

    if (lineUserId) {
      try {
        const liveProfile = await lineService.getUserProfile(lineUserId);
        if (liveProfile) {
          realDisplayName = liveProfile.displayName || realDisplayName;
          realPictureUrl = liveProfile.pictureUrl || realPictureUrl;
          realStatusMessage = liveProfile.statusMessage || realStatusMessage;
        }
      } catch (err) {
        console.warn('Could not fetch live LINE profile:', err.message);
      }
    }

    const updatedTenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        lineUserId: lineUserId || tenant.lineUserId,
        lineDisplayName: realDisplayName || null,
        linePictureUrl: realPictureUrl || null,
        lineStatusMessage: realStatusMessage || null
      },
      include: {
        rooms: { include: { building: true } },
        leaseContracts: { where: { status: 'ACTIVE' }, include: { room: { include: { building: true } } } }
      }
    });

    const room = updatedTenant.rooms && updatedTenant.rooms.length > 0 ? updatedTenant.rooms[0] : null;
    const targetBuildingId = room?.buildingId || resolvedBuildingId;

    // Upsert UserLineAccount ประจำตึก
    if (lineUserId && targetBuildingId) {
      await prisma.userLineAccount.upsert({
        where: { buildingId_lineUserId: { buildingId: targetBuildingId, lineUserId } },
        update: {
          tenantId: updatedTenant.id,
          lineDisplayName: realDisplayName || null,
          linePictureUrl: realPictureUrl || null,
          lineStatusMessage: realStatusMessage || null
        },
        create: {
          buildingId: targetBuildingId,
          lineUserId,
          tenantId: updatedTenant.id,
          lineDisplayName: realDisplayName || null,
          linePictureUrl: realPictureUrl || null,
          lineStatusMessage: realStatusMessage || null
        }
      }).catch((err) => console.warn('UserLineAccount upsert warning:', err.message));
    }

    if (lineUserId) {
      lineService.sendWelcomeFlexMessage(lineUserId, updatedTenant).catch(() => {});
    }

    const accessToken = authService.generateAccessToken({
      id: updatedTenant.id,
      tenantId: updatedTenant.id,
      email: updatedTenant.email || `tenant_${updatedTenant.id}@dorm.local`,
      name: updatedTenant.name,
      displayName: updatedTenant.lineDisplayName || updatedTenant.name,
      role: 'tenant',
      lineUserId: updatedTenant.lineUserId,
      roomId: room?.id,
      buildingId: targetBuildingId
    });

    return { tenant: updatedTenant, room, targetBuildingId, accessToken };
  }

  /**
   * ผูกบัญชี LINE ลูกบ้านผ่าน Invite Code 6 หลัก (Tenant.inviteCode) และเบอร์โทร 4 ตัวท้าย (LIFF API)
   */
  async linkTenantAccountByInviteCode({ inviteCode, phoneLast4, lineDisplayName, linePictureUrl, lineStatusMessage, lineUserId, lineUser }) {
    if (!inviteCode || !phoneLast4) {
      const error = new Error('กรุณาระบุรหัสเชิญ 6 หลัก และเบอร์โทรศัพท์ 4 ตัวท้าย');
      error.statusCode = 400;
      throw error;
    }

    const cleanInviteCode = String(inviteCode).trim().toUpperCase();
    const cleanPhoneLast4 = String(phoneLast4).trim();

    const tenant = await prisma.tenant.findFirst({ where: { inviteCode: cleanInviteCode }, include: { rooms: true } });

    if (!tenant) {
      const error = new Error('รหัสเชิญไม่ถูกต้อง หรือถูกใช้งานไปแล้ว');
      error.statusCode = 400;
      throw error;
    }

    if (tenant.inviteExpiresAt && new Date() > new Date(tenant.inviteExpiresAt)) {
      const error = new Error('รหัสเชิญนี้หมดอายุแล้ว กรุณาติดต่อแอดมินเพื่อขอรหัสใหม่');
      error.statusCode = 400;
      throw error;
    }

    const tenantPhone = tenant.phone ? tenant.phone.trim() : '';
    const actualLast4 = tenantPhone.slice(-4);
    if (actualLast4 !== cleanPhoneLast4) {
      const error = new Error('เบอร์โทรศัพท์ 4 ตัวท้ายไม่ตรงกับข้อมูลในระบบ');
      error.statusCode = 400;
      throw error;
    }

    if (lineUserId) {
      const existingTenant = await prisma.tenant.findUnique({ where: { lineUserId } });
      if (existingTenant && existingTenant.id !== tenant.id) {
        const error = new Error('บัญชี LINE นี้ถูกนำไปผูกกับผู้เช่ารายอื่นในระบบแล้ว');
        error.statusCode = 400;
        throw error;
      }
    }

    // ดึงข้อมูลโปรไฟล์ LINE จริง (จาก Verified Token Payload หรือ LINE Messaging API)
    let realDisplayName = lineUser?.displayName || lineDisplayName || tenant.lineDisplayName;
    let realPictureUrl = lineUser?.pictureUrl || linePictureUrl || tenant.linePictureUrl;
    let realStatusMessage = lineStatusMessage || tenant.lineStatusMessage;

    if (lineUserId) {
      try {
        const liveProfile = await lineService.getUserProfile(lineUserId);
        if (liveProfile) {
          realDisplayName = liveProfile.displayName || realDisplayName;
          realPictureUrl = liveProfile.pictureUrl || realPictureUrl;
          realStatusMessage = liveProfile.statusMessage || realStatusMessage;
        }
      } catch (err) {
        console.warn('Could not fetch live LINE profile:', err.message);
      }
    }

    const updatedTenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        lineUserId: lineUserId || tenant.lineUserId,
        lineDisplayName: realDisplayName || null,
        linePictureUrl: realPictureUrl || null,
        lineStatusMessage: realStatusMessage || null,
        inviteCode: null,
        inviteExpiresAt: null
      },
      include: { rooms: true }
    });

    if (lineUserId) {
      lineService.sendWelcomeFlexMessage(lineUserId, updatedTenant).catch(() => {});
    }

    const room = updatedTenant.rooms && updatedTenant.rooms.length > 0 ? updatedTenant.rooms[0] : null;
    return { tenant: updatedTenant, room };
  }

  /**
   * ซิงค์ข้อมูลโปรไฟล์ LINE ของลูกบ้านอัตโนมัติ (Profile Auto-Sync & Bind)
   */
  async syncLineProfile({ lineDisplayName, linePictureUrl, lineStatusMessage, tenantId, phone, roomNumber, lineUserId, lineUser, isDevOrMockFallback }) {
    let tenant = null;

    // 1. ค้นหาด้วย lineUserId
    if (lineUserId) {
      tenant = await prisma.tenant.findUnique({ where: { lineUserId } });
    }

    // 2. ค้นหาด้วย tenantId (ถ้าส่งมา)
    if (!tenant && tenantId) {
      tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    }

    // 3. ค้นหาด้วย phone (ถ้าส่งมา)
    if (!tenant && phone) {
      tenant = await prisma.tenant.findFirst({ where: { phone: String(phone).trim() } });
    }

    // 4. ค้นหาด้วย roomNumber (ถ้าส่งมา)
    if (!tenant && roomNumber) {
      const room = await prisma.room.findFirst({
        where: { roomNumber: String(roomNumber).trim() },
        include: { tenant: true }
      });
      tenant = room?.tenant || null;
    }

    // 5. Fallback ใน Dev/Mock Mode
    if (!tenant && isDevOrMockFallback) {
      tenant = await prisma.tenant.findFirst({ where: { lineUserId: null } });
    }

    if (!tenant) {
      const error = new Error('ไม่พบผู้เช่าที่ผูกกับบัญชี LINE นี้');
      error.statusCode = 404;
      throw error;
    }

    let realDisplayName = lineDisplayName !== undefined ? lineDisplayName : (lineUser?.displayName || tenant.lineDisplayName);
    let realPictureUrl = linePictureUrl !== undefined ? linePictureUrl : (lineUser?.pictureUrl || tenant.linePictureUrl);
    let realStatusMessage = lineStatusMessage !== undefined ? lineStatusMessage : tenant.lineStatusMessage;

    if (lineUserId) {
      try {
        const liveProfile = await lineService.getUserProfile(lineUserId);
        if (liveProfile) {
          realDisplayName = liveProfile.displayName || realDisplayName;
          realPictureUrl = liveProfile.pictureUrl || realPictureUrl;
          realStatusMessage = liveProfile.statusMessage || realStatusMessage;
        }
      } catch (err) {
        console.warn('Could not fetch live LINE profile:', err.message);
      }
    }

    return await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        lineUserId: lineUserId || tenant.lineUserId,
        lineDisplayName: realDisplayName || tenant.lineDisplayName,
        linePictureUrl: realPictureUrl || tenant.linePictureUrl,
        lineStatusMessage: realStatusMessage || tenant.lineStatusMessage
      }
    });
  }

  /**
   * ดึงข้อมูลโปรไฟล์ผู้เช่าสำหรับ LIFF App (รองรับ Multi-Room Tenancy)
   */
  async getTenantProfileForLiff({ lineUserId, tenantId, roomNumber }) {
    const tenantInclude = {
      rooms: {
        include: {
          building: true,
          residents: { where: { status: 'ACTIVE' }, include: { tenant: true } }
        }
      },
      roomResidents: {
        where: { status: 'ACTIVE' },
        include: {
          room: {
            include: {
              building: true,
              residents: { where: { status: 'ACTIVE' }, include: { tenant: true } }
            }
          }
        }
      },
      leaseContracts: {
        where: { status: 'ACTIVE' },
        include: { room: { include: { building: true } } },
        orderBy: { createdAt: 'desc' }
      }
    };

    let tenant = null;

    // 1. ค้นหาจาก lineUserId ที่ยืนยันตัวตนผ่าน LIFF Token หรือ Query
    if (lineUserId) {
      tenant = await prisma.tenant.findUnique({ where: { lineUserId }, include: tenantInclude });
    }

    // 2. ค้นหาจาก tenantId (ถ้ามีการส่งมา)
    if (!tenant && tenantId) {
      tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, include: tenantInclude });
    }

    // 3. ค้นหาจากหมายเลขห้องพัก (กรณีระบุ roomNumber ใน dev mode)
    if (!tenant && roomNumber) {
      const room = await prisma.room.findFirst({
        where: { roomNumber },
        include: { tenant: { include: tenantInclude } }
      });
      if (room?.tenant) {
        tenant = room.tenant;
      }
    }

    if (!tenant) {
      return null;
    }

    // รวมรายชื่อห้องพักทั้งหมดที่ผู้เช่าถือครอง หรือเป็นผู้อยู่อาศัยร่วม
    const roomsMap = new Map();
    const allRoomResidents = [];

    if (tenant.rooms && tenant.rooms.length > 0) {
      tenant.rooms.forEach((r) => {
        roomsMap.set(r.id, {
          id: r.id,
          roomNumber: r.roomNumber,
          floor: r.floor,
          price: Number(r.price),
          status: r.status,
          unitType: r.unitType,
          buildingId: r.buildingId,
          buildingName: r.building?.name || 'อาคารหลัก',
          themeColor: r.building?.themeColor || '#0E7490',
          theme_color: r.building?.themeColor || '#0E7490',
          logoUrl: r.building?.logoUrl || null,
          logo_url: r.building?.logoUrl || null
        });
        if (r.residents) {
          allRoomResidents.push(...r.residents);
        }
      });
    }

    if (tenant.roomResidents && tenant.roomResidents.length > 0) {
      tenant.roomResidents.forEach((rr) => {
        if (rr.room && !roomsMap.has(rr.room.id)) {
          roomsMap.set(rr.room.id, {
            id: rr.room.id,
            roomNumber: rr.room.roomNumber,
            floor: rr.room.floor,
            price: Number(rr.room.price),
            status: rr.room.status,
            unitType: rr.room.unitType,
            buildingId: rr.room.buildingId,
            buildingName: rr.room.building?.name || 'อาคารหลัก',
            themeColor: rr.room.building?.themeColor || '#0E7490',
            theme_color: rr.room.building?.themeColor || '#0E7490',
            logoUrl: rr.room.building?.logoUrl || null,
            logo_url: rr.room.building?.logoUrl || null
          });
          if (rr.room.residents) {
            allRoomResidents.push(...rr.room.residents);
          }
        }
      });
    }

    if (tenant.leaseContracts && tenant.leaseContracts.length > 0) {
      tenant.leaseContracts.forEach((c) => {
        if (c.room && !roomsMap.has(c.room.id)) {
          roomsMap.set(c.room.id, {
            id: c.room.id,
            roomNumber: c.room.roomNumber,
            floor: c.room.floor,
            price: Number(c.room.price),
            status: c.room.status,
            unitType: c.room.unitType,
            buildingId: c.room.buildingId,
            buildingName: c.room.building?.name || 'อาคารหลัก',
            themeColor: c.room.building?.themeColor || '#0E7490',
            theme_color: c.room.building?.themeColor || '#0E7490',
            logoUrl: c.room.building?.logoUrl || null,
            logo_url: c.room.building?.logoUrl || null
          });
        }
      });
    }

    const roomsList = Array.from(roomsMap.values());
    const roomNumbers = roomsList.map((r) => r.roomNumber).join(', ') || '-';
    const primaryRoomNumber = roomsList.length > 0 ? roomsList[0].roomNumber : '-';
    const primaryRoom = roomsList.length > 0 ? roomsList[0] : null;
    const primaryThemeColor = primaryRoom?.themeColor || '#0E7490';
    const primaryLogoUrl = primaryRoom?.logoUrl || null;
    const primaryBuildingName = primaryRoom?.buildingName || 'อาคารหลัก';
    const primaryBuildingId = primaryRoom?.buildingId || null;

    // คำนวณ Role และ Roommates
    const isDirectRoomOwner = tenant.rooms && tenant.rooms.some((r) => r.tenantId === tenant.id);
    const myResidentRecord = tenant.roomResidents?.find((rr) => rr.status === 'ACTIVE');
    const residentRole = isDirectRoomOwner ? 'PRIMARY' : (myResidentRecord?.role || 'PRIMARY');
    const isPrimaryTenant = residentRole === 'PRIMARY';

    // กรองรายชื่อรูมเมท (คนอื่นๆ ในห้องที่ไม่ใช่ตัวเอง)
    const roommatesMap = new Map();
    allRoomResidents.forEach((res) => {
      if (res.tenant && res.tenantId !== tenant.id) {
        roommatesMap.set(res.tenantId, {
          id: res.tenant.id,
          firstName: res.tenant.firstName,
          lastName: res.tenant.lastName,
          name: `${res.tenant.firstName} ${res.tenant.lastName}`.trim(),
          phone: res.tenant.phone,
          role: res.role,
          lineDisplayName: res.tenant.lineDisplayName,
          linePictureUrl: res.tenant.linePictureUrl,
          joinedAt: res.joinedAt
        });
      }
    });
    const roommates = Array.from(roommatesMap.values());

    let contractEndDate = '31 ธันวาคม 2026';
    const activeContract = tenant.leaseContracts?.find((c) => c.status === 'ACTIVE');
    if (activeContract?.expectedEndDate) {
      contractEndDate = new Date(activeContract.expectedEndDate).toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }

    return {
      id: tenant.id,
      firstName: tenant.firstName,
      lastName: tenant.lastName,
      phone: tenant.phone,
      idCard: tenant.idCard,
      lineUserId: tenant.lineUserId,
      lineDisplayName: tenant.lineDisplayName,
      linePictureUrl: tenant.linePictureUrl,
      lineStatusMessage: tenant.lineStatusMessage,
      roomNumber: primaryRoomNumber,
      roomNumbers,
      rooms: roomsList,
      totalRooms: roomsList.length,
      contractEndDate,
      buildingId: primaryBuildingId,
      buildingName: primaryBuildingName,
      themeColor: primaryThemeColor,
      theme_color: primaryThemeColor,
      logoUrl: primaryLogoUrl,
      logo_url: primaryLogoUrl,
      residentRole,
      isPrimaryTenant,
      roommates
    };
  }

  /**
   * อัปเดตข้อมูลติดต่อผู้เช่า (เบอร์โทรศัพท์) สำหรับ LIFF App
   */
  async updateTenantContactPhone({ phone, lineUserId, tenantId }) {
    if (!phone) {
      const error = new Error('กรุณาระบุเบอร์โทรศัพท์');
      error.statusCode = 400;
      throw error;
    }

    // Validation เบื้องต้น: เบอร์โทรศัพท์เป็นตัวเลข 9-10 หลัก
    const phoneRegex = /^[0-9]{9,10}$/;
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    if (!phoneRegex.test(cleanPhone)) {
      const error = new Error('เบอร์โทรศัพท์ไม่ถูกต้อง ต้องเป็นตัวเลขความยาว 9-10 หลัก');
      error.statusCode = 400;
      throw error;
    }

    let targetTenantId = tenantId;

    if (!targetTenantId && lineUserId) {
      const tenant = await prisma.tenant.findUnique({ where: { lineUserId } });
      if (tenant) targetTenantId = tenant.id;
    }

    if (!targetTenantId) {
      const error = new Error('ไม่พบผู้เช่าในระบบ');
      error.statusCode = 404;
      throw error;
    }

    return await prisma.tenant.update({ where: { id: targetTenantId }, data: { phone: cleanPhone } });
  }

  /**
   * ดึงการตั้งค่า QR Code และบัญชีชำระเงินเฉพาะตึกที่ลูกบ้านสังกัดอยู่ (Tenant -> Room -> Building -> BuildingSetting)
   */
  async getBuildingSettingForTenant({ lineUserId, tenantId, roomId }) {
    let targetRoom = null;

    if (roomId) {
      targetRoom = await prisma.room.findUnique({ where: { id: roomId }, include: { building: { include: { setting: true } } } });
    }

    if (!targetRoom && lineUserId) {
      const tenant = await prisma.tenant.findUnique({
        where: { lineUserId },
        include: { rooms: { include: { building: { include: { setting: true } } } } }
      });
      if (tenant && tenant.rooms.length > 0) {
        targetRoom = tenant.rooms[0];
      }
    }

    if (!targetRoom && tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: { rooms: { include: { building: { include: { setting: true } } } } }
      });
      if (tenant && tenant.rooms.length > 0) {
        targetRoom = tenant.rooms[0];
      }
    }

    const hadIdentity = Boolean(roomId || lineUserId || tenantId);

    // Fallback: ดึงตึกแรกในระบบ เฉพาะกรณีไม่มีข้อมูลระบุตัวตนมาเลย (เช่น Public/Dev call)
    // ถ้ามีการระบุตัวตนมาแล้วแต่ resolve ไม่เจอ ห้ามเดาโดยเด็ดขาด ไม่งั้นลูกบ้านอาจได้ QR
    // PromptPay ของอีกตึกหนึ่งไปโอนเงินผิดบัญชี
    if (!targetRoom && !hadIdentity) {
      targetRoom = await prisma.room.findFirst({ include: { building: { include: { setting: true } } } });
    }

    if (!targetRoom && hadIdentity) {
      return null;
    }

    let buildingSetting = targetRoom?.building?.setting;
    if (!buildingSetting) {
      buildingSetting = await prisma.buildingSetting.findFirst();
    }

    const buildingThemeColor = targetRoom?.building?.themeColor || '#0E7490';
    const buildingLogoUrl = targetRoom?.building?.logoUrl || null;

    return {
      buildingId: targetRoom?.building?.id || null,
      buildingName: targetRoom?.building?.name || 'หอพักหลัก',
      themeColor: buildingThemeColor,
      theme_color: buildingThemeColor,
      logoUrl: buildingLogoUrl,
      logo_url: buildingLogoUrl,
      promptpayNum: buildingSetting?.promptpayNum || '0812345678',
      paymentQrUrl: buildingSetting?.paymentQrUrl || 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=600&q=80'
    };
  }

  /**
   * ลงทะเบียนผู้เช่าใหม่ด้วย Invite Code (RoomInvite) ผ่าน LIFF (ใช้ Prisma Transaction)
   */
  async registerTenantWithInvite({ inviteCode, firstName, lastName, phone, idCard, lineDisplayName, linePictureUrl, lineStatusMessage, lineUserId, lineUser }) {
    if (!inviteCode || !firstName || !lastName || !phone) {
      const error = new Error('กรุณากรอกข้อมูล inviteCode, firstName, lastName และ phone ให้ครบถ้วน');
      error.statusCode = 400;
      throw error;
    }

    const normalizedCode = String(inviteCode).trim().toUpperCase();

    const invite = await prisma.roomInvite.findUnique({
      where: { code: normalizedCode },
      include: { room: { include: { building: { include: { setting: true } } } } }
    });

    if (!invite) {
      const error = new Error('รหัสเชิญ (Invite Code) ไม่ถูกต้อง');
      error.statusCode = 404;
      throw error;
    }

    if (invite.isUsed) {
      const error = new Error('รหัสเชิญนี้ถูกใช้งานไปแล้ว');
      error.statusCode = 400;
      throw error;
    }

    if (new Date() > new Date(invite.expiresAt)) {
      const error = new Error('รหัสเชิญนี้หมดอายุแล้ว (เกิน 48 ชั่วโมง)');
      error.statusCode = 400;
      throw error;
    }

    // เงื่อนไขต้องตรงกับ verifyInviteCode (เช็คแค่ room.status) ไม่งั้น verify ผ่านแต่ register จริงไม่ผ่าน
    if (invite.role !== 'CO_RESIDENT' && invite.room.status !== 'available') {
      const error = new Error(`ห้อง ${invite.room.roomNumber} ไม่ว่างหรือถูกลงทะเบียนไปแล้ว`);
      error.statusCode = 400;
      throw error;
    }

    // ดึงข้อมูลโปรไฟล์ LINE จริง (จาก Verified Token Payload หรือ LINE Messaging API)
    let realDisplayName = lineUser?.displayName || lineDisplayName || null;
    let realPictureUrl = lineUser?.pictureUrl || linePictureUrl || null;
    let realStatusMessage = lineStatusMessage || null;

    if (lineUserId) {
      try {
        const liveProfile = await lineService.getUserProfile(lineUserId);
        if (liveProfile) {
          realDisplayName = liveProfile.displayName || realDisplayName;
          realPictureUrl = liveProfile.pictureUrl || realPictureUrl;
          realStatusMessage = liveProfile.statusMessage || realStatusMessage;
        }
      } catch (err) {
        console.warn('Could not fetch live LINE profile:', err.message);
      }
    }

    // ตรวจสอบว่ามีผู้เช่าเดิมที่ผูกกับ LINE ID หรือเบอร์โทรศัพท์นี้อยู่แล้วหรือไม่ (Multi-Room Linking)
    let existingTenant = null;
    if (lineUserId) {
      existingTenant = await prisma.tenant.findUnique({ where: { lineUserId }, include: { rooms: true } });
    }
    if (!existingTenant && phone) {
      const cleanPhone = String(phone).trim();
      existingTenant = await prisma.tenant.findFirst({ where: { phone: cleanPhone }, include: { rooms: true } });
    }
    if (!existingTenant && invite.role !== 'CO_RESIDENT' && invite.room.tenantId) {
      existingTenant = await prisma.tenant.findUnique({ where: { id: invite.room.tenantId }, include: { rooms: true } });
    }

    const isCoResident = invite.role === 'CO_RESIDENT';

    const result = await prisma.$transaction(async (tx) => {
      let tenantRecord = existingTenant;

      if (tenantRecord) {
        // อัปเดตข้อมูลผู้เช่าเดิมหากมีข้อมูลใหม่
        tenantRecord = await tx.tenant.update({
          where: { id: tenantRecord.id },
          data: {
            firstName: firstName || tenantRecord.firstName,
            lastName: lastName || tenantRecord.lastName,
            phone: phone || tenantRecord.phone,
            idCard: idCard || tenantRecord.idCard,
            lineUserId: lineUserId || tenantRecord.lineUserId,
            lineDisplayName: realDisplayName || tenantRecord.lineDisplayName,
            linePictureUrl: realPictureUrl || tenantRecord.linePictureUrl,
            lineStatusMessage: realStatusMessage || tenantRecord.lineStatusMessage
          }
        });
      } else {
        // สร้างผู้เช่าใหม่
        tenantRecord = await tx.tenant.create({
          data: {
            firstName,
            lastName,
            phone,
            idCard: idCard || null,
            lineUserId: lineUserId || null,
            lineDisplayName: realDisplayName || null,
            linePictureUrl: realPictureUrl || null,
            lineStatusMessage: realStatusMessage || null
          }
        });
      }

      let updatedRoom = invite.room;
      let lease = null;

      if (isCoResident) {
        // บันทึกความสัมพันธ์ผู้อยู่อาศัยร่วมใน RoomResident
        await tx.roomResident.upsert({
          where: { roomId_tenantId: { roomId: invite.roomId, tenantId: tenantRecord.id } },
          create: { roomId: invite.roomId, tenantId: tenantRecord.id, role: 'CO_RESIDENT', isPayer: false, status: 'ACTIVE' },
          update: { role: 'CO_RESIDENT', status: 'ACTIVE', leftAt: null }
        });
      } else {
        // ผู้เช่าหลัก
        updatedRoom = await tx.room.update({
          where: { id: invite.roomId },
          data: { tenantId: tenantRecord.id, status: 'occupied' }
        });

        await tx.roomResident.upsert({
          where: { roomId_tenantId: { roomId: invite.roomId, tenantId: tenantRecord.id } },
          create: { roomId: invite.roomId, tenantId: tenantRecord.id, role: 'PRIMARY', isPayer: true, status: 'ACTIVE' },
          update: { role: 'PRIMARY', isPayer: true, status: 'ACTIVE', leftAt: null }
        });

        // 📝 คำนวณเงินประกันจาก Building Setting หากมี
        const depositMonths = invite.room.building?.setting?.depositMonths || 0;
        const roomPrice = Number(invite.room.price) || 0;
        const depositAmount = depositMonths > 0 ? depositMonths * roomPrice : 0;

        // 📝 สร้างสัญญาเช่าเริ่มต้น (Active Lease Contract) สำหรับห้องใหม่
        const startDate = new Date();
        const expectedEndDate = new Date(startDate);
        expectedEndDate.setFullYear(expectedEndDate.getFullYear() + 1);

        lease = await tx.leaseContract.create({
          data: {
            roomId: invite.roomId,
            tenantId: tenantRecord.id,
            buildingId: invite.room.buildingId || null,
            startDate,
            expectedEndDate,
            depositAmount,
            status: 'ACTIVE',
            adminNote: existingTenant
              ? 'เพิ่มห้องพักเพิ่มเติมสำหรับผู้เช่าเดิมผ่าน LINE LIFF (Invite Code)'
              : 'ลงทะเบียนเข้าพักผ่านระบบ LINE LIFF (Invite Code)'
          }
        });
      }

      await tx.roomInvite.update({ where: { id: invite.id }, data: { isUsed: true } });

      return { tenant: tenantRecord, room: updatedRoom, lease, role: invite.role };
    });

    // 📲 ส่ง LINE Welcome Flex Message หากมี LINE User ID
    if (lineUserId) {
      lineService.sendWelcomeFlexMessage(lineUserId, result.tenant).catch(() => {});
    }

    return { ...result, isCoResident };
  }

  /**
   * ตรวจสอบความถูกต้องของ Invite Code (RoomInvite) ล่วงหน้าก่อนลงทะเบียน
   */
  async verifyInviteCode(code) {
    const normalizedCode = String(code).trim().toUpperCase();

    const invite = await prisma.roomInvite.findUnique({
      where: { code: normalizedCode },
      include: { room: { include: { building: true } } }
    });

    if (!invite) {
      const error = new Error('ไม่พบรหัสเชิญ (Invite Code) นี้ในระบบ');
      error.statusCode = 404;
      throw error;
    }

    if (invite.isUsed) {
      const error = new Error('รหัสเชิญนี้ถูกใช้งานไปแล้ว');
      error.statusCode = 400;
      throw error;
    }

    if (new Date() > new Date(invite.expiresAt)) {
      const error = new Error('รหัสเชิญนี้หมดอายุแล้ว');
      error.statusCode = 400;
      throw error;
    }

    // ถ้าเป็นผู้เช่าหลัก ต้องเช็คว่าห้องว่าง แต่ถ้าเป็นรูมเมท (CO_RESIDENT) ห้องต้องมีผู้เช่าอยู่แล้ว
    if (invite.role !== 'CO_RESIDENT' && invite.room.status !== 'available') {
      const error = new Error(`ห้อง ${invite.room.roomNumber} มีผู้เช่าอยู่แล้ว`);
      error.statusCode = 400;
      throw error;
    }

    return invite;
  }

  /**
   * สร้างรหัสเชิญรูมเมทสำหรับผู้เช่าหลัก (Create Roommate Invite)
   */
  async createRoommateInvite({ lineUserId, tenantId }) {
    const tenant = await prisma.tenant.findFirst({
      where: lineUserId ? { lineUserId } : { id: tenantId },
      include: { rooms: true, roomResidents: { where: { status: 'ACTIVE' }, include: { room: true } } }
    });

    if (!tenant) {
      const error = new Error('ไม่พบข้อมูลผู้เช่า');
      error.statusCode = 404;
      throw error;
    }

    // ตรวจสอบว่าผู้เช่ามีห้องพักหรือไม่
    const targetRoom = tenant.rooms?.[0] || tenant.roomResidents?.[0]?.room;
    if (!targetRoom) {
      const error = new Error('ไม่พบห้องพักที่ผูกกับบัญชีนี้');
      error.statusCode = 400;
      throw error;
    }

    const crypto = require('crypto');
    const code = crypto.randomBytes(3).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 วัน

    const invite = await prisma.roomInvite.create({
      data: { roomId: targetRoom.id, code, role: 'CO_RESIDENT', invitedByTenantId: tenant.id, expiresAt, isUsed: false },
      include: { room: { include: { building: true } } }
    });

    return { invite, targetRoom };
  }

  /**
   * ดึงข้อมูลสาธารณะของตึก (ชื่อ, ธีมสี, โลโก้, ที่อยู่) สำหรับ Onboarding & Branding
   */
  async getBuildingPublicInfo(buildingParam) {
    const trimmed = String(buildingParam).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);

    const building = await prisma.building.findFirst({
      where: isUuid
        ? { id: trimmed }
        : {
            OR: [
              { name: { equals: trimmed, mode: 'insensitive' } },
              { name: { contains: trimmed, mode: 'insensitive' } }
            ]
          },
      select: { id: true, name: true, address: true, themeColor: true, logoUrl: true }
    });

    if (!building) {
      const error = new Error('ไม่พบข้อมูลตึกตามที่ระบุ');
      error.statusCode = 404;
      throw error;
    }

    return building;
  }
}

module.exports = new TenantService();
