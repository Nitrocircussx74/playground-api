const billingService = require('../services/billingService');
const lineService = require('../services/lineService');
const slipService = require('../services/slipService');

class LiffController {
  /**
   * ตรวจสอบสถานะการเป็นลูกบ้านผ่าน lineUserId สำหรับ Smart Entry Gateway Router
   */
  async checkTenantStatus(req, res, next) {
    try {
      const lineUserId = req.lineUserId;
      const { phone, roomNumber, inviteCode, tenantId } = req.query || {};

      if (!lineUserId) {
        return res.status(200).json({
          success: true,
          isRegistered: false,
          data: null
        });
      }

      // 1. ค้นหาผู้เช่าที่ผูกกับ lineUserId อยู่แล้ว
      let tenant = await billingService.prisma.tenant.findFirst({
        where: { lineUserId },
        include: { rooms: { include: { building: true } } }
      });

      // 2. หากยังไม่พบ และมีการส่ง phone / roomNumber / tenantId เข้ามา ให้ทำการผูก lineUserId เข้ากับ Tenant ทันที
      if (!tenant && phone) {
        const cleanPhone = String(phone).trim();
        tenant = await billingService.prisma.tenant.findFirst({
          where: { phone: cleanPhone },
          include: { rooms: { include: { building: true } } }
        });
        if (tenant && !tenant.lineUserId) {
          tenant = await billingService.prisma.tenant.update({
            where: { id: tenant.id },
            data: {
              lineUserId,
              lineDisplayName: req.lineUser?.displayName || tenant.lineDisplayName,
              linePictureUrl: req.lineUser?.pictureUrl || tenant.linePictureUrl
            },
            include: { rooms: { include: { building: true } } }
          });
        }
      }

      if (!tenant && roomNumber) {
        const room = await billingService.prisma.room.findFirst({
          where: { roomNumber: String(roomNumber).trim() },
          include: { tenant: { include: { rooms: { include: { building: true } } } } }
        });
        if (room?.tenant) {
          tenant = room.tenant;
          if (!tenant.lineUserId) {
            tenant = await billingService.prisma.tenant.update({
              where: { id: tenant.id },
              data: {
                lineUserId,
                lineDisplayName: req.lineUser?.displayName || tenant.lineDisplayName,
                linePictureUrl: req.lineUser?.pictureUrl || tenant.linePictureUrl
              },
              include: { rooms: { include: { building: true } } }
            });
          }
        }
      }

      if (!tenant && tenantId) {
        const matched = await billingService.prisma.tenant.findUnique({
          where: { id: tenantId },
          include: { rooms: { include: { building: true } } }
        });
        if (matched) {
          tenant = await billingService.prisma.tenant.update({
            where: { id: matched.id },
            data: {
              lineUserId,
              lineDisplayName: req.lineUser?.displayName || matched.lineDisplayName,
              linePictureUrl: req.lineUser?.pictureUrl || matched.linePictureUrl
            },
            include: { rooms: { include: { building: true } } }
          });
        }
      }

      // 3. Fallback: หากยังไม่พบผู้เช่า และอยู่ใน Dev/Test Mode ให้ auto-bind กับผู้เช่าที่ยังไม่มี lineUserId
      if (!tenant && (process.env.NODE_ENV !== 'production' || process.env.LINE_MOCK_MODE === 'true')) {
        const unlinked = await billingService.prisma.tenant.findFirst({
          where: { lineUserId: null },
          include: { rooms: { include: { building: true } } }
        });
        if (unlinked) {
          tenant = await billingService.prisma.tenant.update({
            where: { id: unlinked.id },
            data: {
              lineUserId,
              lineDisplayName: req.lineUser?.displayName || unlinked.lineDisplayName,
              linePictureUrl: req.lineUser?.pictureUrl || unlinked.linePictureUrl
            },
            include: { rooms: { include: { building: true } } }
          });
        }
      }

      if (!tenant) {
        return res.status(200).json({
          success: true,
          isRegistered: false,
          data: null
        });
      }

      // Sync LINE profile หากมีการเปลี่ยนแปลง
      if (req.lineUser) {
        if ((req.lineUser.displayName && req.lineUser.displayName !== tenant.lineDisplayName) ||
            (req.lineUser.pictureUrl && req.lineUser.pictureUrl !== tenant.linePictureUrl)) {
          await billingService.prisma.tenant.update({
            where: { id: tenant.id },
            data: {
              lineDisplayName: req.lineUser.displayName || tenant.lineDisplayName,
              linePictureUrl: req.lineUser.pictureUrl || tenant.linePictureUrl
            }
          }).catch(() => {});
        }
      }

      const room = tenant.rooms && tenant.rooms.length > 0 ? tenant.rooms[0] : null;
      const building = room && room.building ? room.building : null;

      return res.status(200).json({
        success: true,
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
      });
    } catch (error) {
      console.error('checkTenantStatus error:', error);
      next(error);
    }
  }

  /**
   * สร้างรหัสเชิญ (Invite Code) 6 หลักสำหรับผู้เช่า (Admin API)
   */
  async generateTenantInvite(req, res, next) {
    try {
      const { id } = req.params;

      const tenant = await billingService.prisma.tenant.findUnique({
        where: { id }
      });

      if (!tenant) {
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้เช่ารายนี้' });
      }

      const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let inviteCode = '';
      for (let i = 0; i < 6; i++) {
        inviteCode += characters.charAt(Math.floor(Math.random() * characters.length));
      }

      const inviteExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const updatedTenant = await billingService.prisma.tenant.update({
        where: { id },
        data: {
          inviteCode,
          inviteExpiresAt
        }
      });

      return res.status(200).json({
        success: true,
        message: 'สร้างรหัสเชิญสำเร็จ',
        data: {
          tenantId: updatedTenant.id,
          inviteCode: updatedTenant.inviteCode,
          inviteExpiresAt: updatedTenant.inviteExpiresAt
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ยืนยันตัวตนและผูกบัญชีลูกบ้านผ่านหมายเลขโทรศัพท์ (Phone Number Verification)
   * POST /api/v1/liff/auth/verify-phone
   */
  async verifyPhoneAndLinkTenant(req, res, next) {
    try {
      const { phone, roomNumber, lineDisplayName, linePictureUrl, lineStatusMessage } = req.body;
      const lineUserId = req.lineUserId;

      if (!phone) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาระบุหมายเลขโทรศัพท์ที่ลงทะเบียนไว้'
        });
      }

      const cleanPhone = String(phone).replace(/[^0-9]/g, '');

      // ค้นหาผู้เช่าจากเบอร์โทรศัพท์
      let tenant = await billingService.prisma.tenant.findFirst({
        where: {
          OR: [
            { phone: cleanPhone },
            { phone: cleanPhone.startsWith('0') ? cleanPhone : `0${cleanPhone}` },
            { phone: cleanPhone.startsWith('66') ? `0${cleanPhone.slice(2)}` : cleanPhone }
          ]
        },
        include: {
          rooms: { include: { building: true } },
          leaseContracts: { where: { status: 'ACTIVE' }, include: { room: { include: { building: true } } } }
        }
      });

      // หากมีระบุ roomNumber เพิ่มเติม ช่วยค้นหา
      if (!tenant && roomNumber) {
        const room = await billingService.prisma.room.findFirst({
          where: { roomNumber: String(roomNumber).trim() },
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
        return res.status(404).json({
          success: false,
          message: `ไม่พบข้อมูลผู้เช่าที่ลงทะเบียนด้วยเบอร์โทร ${phone} ในระบบ กรุณาตรวจสอบเบอร์โทรศัพท์หรือติดต่อผู้ดูแลตึก`
        });
      }

      // ตรวจสอบว่า lineUserId นี้เคยผูกกับผู้เช่ารายอื่นหรือไม่
      if (lineUserId) {
        const existingTenant = await billingService.prisma.tenant.findUnique({
          where: { lineUserId }
        });
        if (existingTenant && existingTenant.id !== tenant.id) {
          await billingService.prisma.tenant.update({
            where: { id: existingTenant.id },
            data: { lineUserId: null }
          }).catch(() => {});
        }
      }

      // ดึงโปรไฟล์ LINE จริง
      let realDisplayName = req.lineUser?.displayName || lineDisplayName || tenant.lineDisplayName;
      let realPictureUrl = req.lineUser?.pictureUrl || linePictureUrl || tenant.linePictureUrl;
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

      const updatedTenant = await billingService.prisma.tenant.update({
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

      if (lineUserId) {
        lineService.sendWelcomeFlexMessage(lineUserId, updatedTenant).catch(() => {});
      }

      const room = updatedTenant.rooms && updatedTenant.rooms.length > 0 ? updatedTenant.rooms[0] : null;

      return res.status(200).json({
        success: true,
        message: 'ยืนยันตัวตนและผูกบัญชี LINE สำเร็จเรียบร้อยแล้ว',
        data: {
          tenant: {
            id: updatedTenant.id,
            firstName: updatedTenant.firstName,
            lastName: updatedTenant.lastName,
            phone: updatedTenant.phone,
            lineUserId: updatedTenant.lineUserId,
            lineDisplayName: updatedTenant.lineDisplayName,
            linePictureUrl: updatedTenant.linePictureUrl,
            lineStatusMessage: updatedTenant.lineStatusMessage
          },
          room: room ? { id: room.id, roomNumber: room.roomNumber } : null
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ผูกบัญชี LINE ลูกบ้านผ่าน Invite Code 6 หลัก และเบอร์โทร 4 ตัวท้าย (LIFF API)
   */
  async linkTenantAccount(req, res, next) {
    try {
      const { inviteCode, phoneLast4, lineDisplayName, linePictureUrl, lineStatusMessage } = req.body;
      const lineUserId = req.lineUserId;

      if (!inviteCode || !phoneLast4) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาระบุรหัสเชิญ 6 หลัก และเบอร์โทรศัพท์ 4 ตัวท้าย'
        });
      }

      const cleanInviteCode = String(inviteCode).trim().toUpperCase();
      const cleanPhoneLast4 = String(phoneLast4).trim();

      const tenant = await billingService.prisma.tenant.findFirst({
        where: { inviteCode: cleanInviteCode },
        include: { rooms: true }
      });

      if (!tenant) {
        return res.status(400).json({
          success: false,
          message: 'รหัสเชิญไม่ถูกต้อง หรือถูกใช้งานไปแล้ว'
        });
      }

      if (tenant.inviteExpiresAt && new Date() > new Date(tenant.inviteExpiresAt)) {
        return res.status(400).json({
          success: false,
          message: 'รหัสเชิญนี้หมดอายุแล้ว กรุณาติดต่อแอดมินเพื่อขอรหัสใหม่'
        });
      }

      const tenantPhone = tenant.phone ? tenant.phone.trim() : '';
      const actualLast4 = tenantPhone.slice(-4);
      if (actualLast4 !== cleanPhoneLast4) {
        return res.status(400).json({
          success: false,
          message: 'เบอร์โทรศัพท์ 4 ตัวท้ายไม่ตรงกับข้อมูลในระบบ'
        });
      }

      if (lineUserId) {
        const existingTenant = await billingService.prisma.tenant.findUnique({
          where: { lineUserId }
        });
        if (existingTenant && existingTenant.id !== tenant.id) {
          return res.status(400).json({
            success: false,
            message: 'บัญชี LINE นี้ถูกนำไปผูกกับผู้เช่ารายอื่นในระบบแล้ว'
          });
        }
      }

      // ดึงข้อมูลโปรไฟล์ LINE จริง (จาก Verified Token Payload หรือ LINE Messaging API)
      let realDisplayName = req.lineUser?.displayName || lineDisplayName || tenant.lineDisplayName;
      let realPictureUrl = req.lineUser?.pictureUrl || linePictureUrl || tenant.linePictureUrl;
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

      const updatedTenant = await billingService.prisma.tenant.update({
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

      return res.status(200).json({
        success: true,
        message: 'ผูกบัญชีลูกบ้านสำเร็จเรียบร้อยแล้ว',
        data: {
          tenant: {
            id: updatedTenant.id,
            firstName: updatedTenant.firstName,
            lastName: updatedTenant.lastName,
            phone: updatedTenant.phone,
            lineUserId: updatedTenant.lineUserId,
            lineDisplayName: updatedTenant.lineDisplayName,
            linePictureUrl: updatedTenant.linePictureUrl,
            lineStatusMessage: updatedTenant.lineStatusMessage
          },
          room: room ? { id: room.id, roomNumber: room.roomNumber } : null
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ซิงค์ข้อมูลโปรไฟล์ LINE ของลูกบ้านอัตโนมัติ (Profile Auto-Sync & Bind)
   */
  async syncLineProfile(req, res, next) {
    try {
      const { lineDisplayName, linePictureUrl, lineStatusMessage, tenantId, phone, roomNumber } = req.body;
      const lineUserId = req.lineUserId || req.body.lineUserId;

      let tenant = null;

      // 1. ค้นหาด้วย lineUserId
      if (lineUserId) {
        tenant = await billingService.prisma.tenant.findUnique({
          where: { lineUserId }
        });
      }

      // 2. ค้นหาด้วย tenantId (ถ้าส่งมา)
      if (!tenant && tenantId) {
        tenant = await billingService.prisma.tenant.findUnique({
          where: { id: tenantId }
        });
      }

      // 3. ค้นหาด้วย phone (ถ้าส่งมา)
      if (!tenant && phone) {
        tenant = await billingService.prisma.tenant.findFirst({
          where: { phone: String(phone).trim() }
        });
      }

      // 4. ค้นหาด้วย roomNumber (ถ้าส่งมา)
      if (!tenant && roomNumber) {
        const room = await billingService.prisma.room.findFirst({
          where: { roomNumber: String(roomNumber).trim() },
          include: { tenant: true }
        });
        tenant = room?.tenant || null;
      }

      // 5. Fallback ใน Dev/Mock Mode
      if (!tenant && (process.env.NODE_ENV !== 'production' || process.env.LINE_MOCK_MODE === 'true')) {
        tenant = await billingService.prisma.tenant.findFirst({
          where: { lineUserId: null }
        });
      }

      if (!tenant) {
        return res.status(404).json({ success: false, message: 'ไม่พบผู้เช่าที่ผูกกับบัญชี LINE นี้' });
      }

      let realDisplayName = lineDisplayName !== undefined ? lineDisplayName : (req.lineUser?.displayName || tenant.lineDisplayName);
      let realPictureUrl = linePictureUrl !== undefined ? linePictureUrl : (req.lineUser?.pictureUrl || tenant.linePictureUrl);
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

      const updatedTenant = await billingService.prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          lineUserId: lineUserId || tenant.lineUserId,
          lineDisplayName: realDisplayName || tenant.lineDisplayName,
          linePictureUrl: realPictureUrl || tenant.linePictureUrl,
          lineStatusMessage: realStatusMessage || tenant.lineStatusMessage
        }
      });

      return res.status(200).json({
        success: true,
        message: 'ซิงค์ข้อมูลโปรไฟล์ LINE สำเร็จ',
        data: {
          id: updatedTenant.id,
          lineUserId: updatedTenant.lineUserId,
          lineDisplayName: updatedTenant.lineDisplayName,
          linePictureUrl: updatedTenant.linePictureUrl,
          lineStatusMessage: updatedTenant.lineStatusMessage
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ดึงข้อมูลโปรไฟล์ผู้เช่าสำหรับ LIFF App (รองรับ Multi-Room Tenancy)
   */
  async getTenantProfile(req, res, next) {
    try {
      const lineUserId = req.lineUserId || req.query?.lineUserId;
      const { tenantId, room: queryRoomNumber, roomNumber: queryRoomNumberAlt } = req.query || {};
      const targetRoomNumber = queryRoomNumber || queryRoomNumberAlt;

      let tenant = null;

      // 1. ค้นหาจาก lineUserId ที่ยืนยันตัวตนผ่าน LIFF Token หรือ Query
      if (lineUserId) {
        tenant = await billingService.prisma.tenant.findUnique({
          where: { lineUserId },
          include: {
            rooms: {
              include: { building: true }
            },
            leaseContracts: {
              where: { status: 'ACTIVE' },
              include: { room: { include: { building: true } } },
              orderBy: { createdAt: 'desc' }
            }
          }
        });
      }

      // 2. ค้นหาจาก tenantId (ถ้ามีการส่งมา)
      if (!tenant && tenantId) {
        tenant = await billingService.prisma.tenant.findUnique({
          where: { id: tenantId },
          include: {
            rooms: {
              include: { building: true }
            },
            leaseContracts: {
              where: { status: 'ACTIVE' },
              include: { room: { include: { building: true } } },
              orderBy: { createdAt: 'desc' }
            }
          }
        });
      }

      // 3. ค้นหาจากหมายเลขห้องพัก (กรณีระบุ roomNumber ใน dev mode)
      if (!tenant && targetRoomNumber) {
        const room = await billingService.prisma.room.findFirst({
          where: { roomNumber: targetRoomNumber },
          include: {
            tenant: {
              include: {
                rooms: {
                  include: { building: true }
                },
                leaseContracts: {
                  where: { status: 'ACTIVE' },
                  include: { room: { include: { building: true } } },
                  orderBy: { createdAt: 'desc' }
                }
              }
            }
          }
        });
        if (room?.tenant) {
          tenant = room.tenant;
        }
      }

      // 4. Fallback ดึงผู้เช่าคนแรก
      if (!tenant) {
        tenant = await billingService.prisma.tenant.findFirst({
          include: {
            rooms: {
              include: { building: true }
            },
            leaseContracts: {
              where: { status: 'ACTIVE' },
              include: { room: { include: { building: true } } },
              orderBy: { createdAt: 'desc' }
            }
          }
        });
      }

      if (!tenant) {
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้เช่า' });
      }

      // หากพบผู้เช่าและมี lineUserId ที่ยืนยันแล้ว แต่ผู้เช่ายังไม่ได้ผูก ให้ทำการ Auto-bind ทันที
      if (lineUserId && !tenant.lineUserId) {
        try {
          tenant = await billingService.prisma.tenant.update({
            where: { id: tenant.id },
            data: {
              lineUserId,
              lineDisplayName: req.lineUser?.displayName || tenant.lineDisplayName,
              linePictureUrl: req.lineUser?.pictureUrl || tenant.linePictureUrl
            },
            include: {
              rooms: { include: { building: true } },
              leaseContracts: {
                where: { status: 'ACTIVE' },
                include: { room: { include: { building: true } } },
                orderBy: { createdAt: 'desc' }
              }
            }
          });
        } catch (bindErr) {
          console.warn('Auto-bind tenant lineUserId error:', bindErr.message);
        }
      }

      // รวมรายชื่อห้องพักทั้งหมดที่ผู้เช่าถือครอง (Multi-Room Data)
      const roomsMap = new Map();
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
            themeColor: r.building?.themeColor || '#3B82F6',
            theme_color: r.building?.themeColor || '#3B82F6',
            logoUrl: r.building?.logoUrl || null,
            logo_url: r.building?.logoUrl || null
          });
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
              themeColor: c.room.building?.themeColor || '#3B82F6',
              theme_color: c.room.building?.themeColor || '#3B82F6',
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
      const primaryThemeColor = primaryRoom?.themeColor || '#3B82F6';
      const primaryLogoUrl = primaryRoom?.logoUrl || null;
      const primaryBuildingName = primaryRoom?.buildingName || 'อาคารหลัก';
      const primaryBuildingId = primaryRoom?.buildingId || null;

      let contractEndDate = '31 ธันวาคม 2026';
      const activeContract = tenant.leaseContracts?.find((c) => c.status === 'ACTIVE');
      if (activeContract?.expectedEndDate) {
        contractEndDate = new Date(activeContract.expectedEndDate).toLocaleDateString('th-TH', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      }

      return res.status(200).json({
        success: true,
        data: {
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
          logo_url: primaryLogoUrl
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * อัปเดตข้อมูลติดต่อผู้เช่า (เบอร์โทรศัพท์) สำหรับ LIFF App
   */
  async updateTenantProfile(req, res, next) {
    try {
      const { phone, lineUserId, tenantId } = req.body;

      if (!phone) {
        return res.status(400).json({ success: false, message: 'กรุณาระบุเบอร์โทรศัพท์' });
      }

      // Validation เบื้องต้น: เบอร์โทรศัพท์เป็นตัวเลข 9-10 หลัก
      const phoneRegex = /^[0-9]{9,10}$/;
      const cleanPhone = String(phone).replace(/[^0-9]/g, '');
      if (!phoneRegex.test(cleanPhone)) {
        return res.status(400).json({
          success: false,
          message: 'เบอร์โทรศัพท์ไม่ถูกต้อง ต้องเป็นตัวเลขความยาว 9-10 หลัก'
        });
      }

      let targetTenantId = tenantId;

      if (!targetTenantId && lineUserId) {
        const tenant = await billingService.prisma.tenant.findUnique({
          where: { lineUserId }
        });
        if (tenant) targetTenantId = tenant.id;
      }

      if (!targetTenantId) {
        const firstTenant = await billingService.prisma.tenant.findFirst();
        targetTenantId = firstTenant?.id;
      }

      if (!targetTenantId) {
        return res.status(404).json({ success: false, message: 'ไม่พบผู้เช่าในระบบ' });
      }

      const updatedTenant = await billingService.prisma.tenant.update({
        where: { id: targetTenantId },
        data: { phone: cleanPhone }
      });

      return res.status(200).json({
        success: true,
        message: 'อัปเดตข้อมูลเบอร์โทรศัพท์เรียบร้อยแล้ว',
        data: updatedTenant
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ดึงการตั้งค่า QR Code และบัญชีชำระเงินเฉพาะตึกที่ลูกบ้านสังกัดอยู่
   * (Tenant -> Room -> Building -> BuildingSetting)
   */
  async getSettingsForTenant(req, res, next) {
    try {
      // Endpoint นี้ถูกเรียกจาก 2 เส้นทาง: /api/v1/liff/settings (ผ่าน liffAuthMiddleware มี req.lineUserId ที่ verify แล้ว)
      // และ /api/settings แบบ Public เดิม (ไม่มี req.lineUserId) — ถ้ามี req.lineUserId ที่ verify แล้ว ต้องยึดค่านั้นเป็นหลัก
      // ห้ามให้ roomId/tenantId ที่ Client ส่งมาเอง Override เพื่อไปดูตึก/ห้องของคนอื่น (IDOR)
      const lineUserId = req.lineUserId || req.query.lineUserId;
      const { tenantId, roomId } = req.lineUserId ? {} : req.query;

      let targetRoom = null;

      if (roomId) {
        targetRoom = await billingService.prisma.room.findUnique({
          where: { id: roomId },
          include: { building: { include: { setting: true } } }
        });
      }

      if (!targetRoom && lineUserId) {
        const tenant = await billingService.prisma.tenant.findUnique({
          where: { lineUserId },
          include: {
            rooms: {
              include: { building: { include: { setting: true } } }
            }
          }
        });
        if (tenant && tenant.rooms.length > 0) {
          targetRoom = tenant.rooms[0];
        }
      }

      if (!targetRoom && tenantId) {
        const tenant = await billingService.prisma.tenant.findUnique({
          where: { id: tenantId },
          include: {
            rooms: {
              include: { building: { include: { setting: true } } }
            }
          }
        });
        if (tenant && tenant.rooms.length > 0) {
          targetRoom = tenant.rooms[0];
        }
      }

      // Fallback: ดึงตึกแรกในระบบ
      if (!targetRoom) {
        targetRoom = await billingService.prisma.room.findFirst({
          include: { building: { include: { setting: true } } }
        });
      }

      let buildingSetting = targetRoom?.building?.setting;

      if (!buildingSetting) {
        buildingSetting = await billingService.prisma.buildingSetting.findFirst();
      }

      const buildingThemeColor = targetRoom?.building?.themeColor || '#3B82F6';
      const buildingLogoUrl = targetRoom?.building?.logoUrl || null;

      return res.status(200).json({
        success: true,
        data: {
          buildingId: targetRoom?.building?.id || null,
          buildingName: targetRoom?.building?.name || 'หอพักหลัก',
          themeColor: buildingThemeColor,
          theme_color: buildingThemeColor,
          logoUrl: buildingLogoUrl,
          logo_url: buildingLogoUrl,
          promptpayNum: buildingSetting?.promptpayNum || '0812345678',
          paymentQrUrl: buildingSetting?.paymentQrUrl || 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=600&q=80'
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ดึงข้อมูลบิลพร้อม PromptPay QR สำหรับแสดงผลใน LIFF App
   */
  async getInvoiceForLiff(req, res, next) {
    try {
      const { id } = req.params;
      const lineUserId = req.lineUserId || req.query?.lineUserId;

      const invoice = await billingService.prisma.invoice.findUnique({
        where: { id },
        include: {
          room: {
            include: {
              building: {
                include: { setting: true }
              }
            }
          },
          tenant: true
        }
      });

      if (!invoice) {
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลใบแจ้งหนี้' });
      }

      // ตรวจสอบสิทธิ์การเข้าถึง: หากมี lineUserId ให้ตรวจสอบว่าเป็นเจ้าของบิลหรือห้องพักนี้จริง
      if (lineUserId) {
        const callerTenant = await billingService.prisma.tenant.findUnique({
          where: { lineUserId },
          include: {
            rooms: true,
            leaseContracts: {
              where: { status: 'ACTIVE' },
              include: { room: true }
            }
          }
        });

        const callerRoomIds = [];
        if (callerTenant?.rooms) callerTenant.rooms.forEach((r) => callerRoomIds.push(r.id));
        if (callerTenant?.leaseContracts) callerTenant.leaseContracts.forEach((c) => callerRoomIds.push(c.roomId));

        const isOwner =
          invoice.tenant?.lineUserId === lineUserId ||
          (callerTenant && invoice.tenantId === callerTenant.id) ||
          callerRoomIds.includes(invoice.roomId);

        if (!isOwner && invoice.tenant?.lineUserId && invoice.tenant.lineUserId !== lineUserId) {
          return res.status(403).json({
            success: false,
            message: 'ปฏิเสธการเข้าถึง: คุณไม่มีสิทธิ์ดูใบแจ้งหนี้ของผู้อื่น'
          });
        }
      }

      const buildingPromptPay = invoice.room?.building?.setting?.promptpayNum || null;
      const qrData = await lineService.generatePromptPayQr(invoice.grandTotal, buildingPromptPay);

      return res.status(200).json({
        success: true,
        data: {
          invoice,
          qrData
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * รับไฟล์สลิปการโอนเงินจาก LIFF App
   */
  async uploadSlipFromLiff(req, res, next) {
    try {
      const { id } = req.params;
      const lineUserId = req.lineUserId || req.body?.lineUserId;

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'กรุณาแนบไฟล์รูปภาพสลิปโอนเงิน' });
      }

      const invoice = await billingService.prisma.invoice.findUnique({
        where: { id },
        include: { tenant: true, room: true }
      });

      if (!invoice) {
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลใบแจ้งหนี้' });
      }

      if (lineUserId && invoice.tenant?.lineUserId && invoice.tenant.lineUserId !== lineUserId) {
        const callerTenant = await billingService.prisma.tenant.findUnique({
          where: { lineUserId },
          include: { rooms: true, leaseContracts: { where: { status: 'ACTIVE' } } }
        });
        const callerRoomIds = (callerTenant?.rooms || []).map((r) => r.id);
        (callerTenant?.leaseContracts || []).forEach((c) => callerRoomIds.push(c.roomId));

        const isOwner =
          (callerTenant && invoice.tenantId === callerTenant.id) ||
          callerRoomIds.includes(invoice.roomId);

        if (!isOwner) {
          return res.status(403).json({
            success: false,
            message: 'ปฏิเสธการเข้าถึง: คุณไม่มีสิทธิ์แนบสลิปสำหรับบิลของผู้อื่น'
          });
        }
      }

      const protocol = req.protocol;
      const host = req.get('host');
      const slipUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

      // Trigger Auto Slip Verification Engine
      const verification = await slipService.verifyAndProcessSlip(invoice, req.file, req.body.declaredAmount);

      const updateData = {
        slipUrl,
        slipHash: verification.fileHash,
        status: verification.status
      };

      if (verification.autoApproved) {
        updateData.paidAt = new Date();
      }

      const updatedInvoice = await billingService.prisma.invoice.update({
        where: { id },
        data: updateData,
        include: { tenant: true, room: true }
      });

      const recipientLineId = invoice.tenant?.lineUserId || lineUserId;
      if (recipientLineId) {
        if (verification.autoApproved) {
          lineService.sendPaymentSuccessNotification(updatedInvoice).catch((err) => {
            console.warn('⚠️ ไม่สามารถส่ง LINE Payment Success Push Message ได้:', err.message);
          });
        } else {
          await lineService.pushSlipReceivedNotification(
            recipientLineId,
            invoice.invoiceNumber
          );
        }
      }

      return res.status(200).json({
        success: true,
        message: verification.autoApproved
          ? '✓ ตรวจสอบสลิปอัตโนมัติสำเร็จ! ยอดเงินโอนตรงกับยอดบิล บิลเปลี่ยนสถานะเป็น PAID เรียบร้อยแล้ว'
          : `แนบสลิปเรียบร้อยแล้ว สถานะเปลี่ยนเป็นรอตรวจสอบ (reviewing): ${verification.reason}`,
        data: {
          ...updatedInvoice,
          autoApproved: verification.autoApproved,
          verificationReason: verification.reason
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ลงทะเบียนผู้เช่าใหม่ด้วย Invite Code ผ่าน LIFF (ใช้ Prisma Transaction)
   */
  async registerTenantWithInvite(req, res, next) {
    try {
      const { inviteCode, firstName, lastName, phone, idCard, lineDisplayName, linePictureUrl, lineStatusMessage } = req.body;
      const lineUserId = req.lineUserId;

      if (!inviteCode || !firstName || !lastName || !phone) {
        return res.status(400).json({
          success: false,
          message: 'กรุณากรอกข้อมูล inviteCode, firstName, lastName และ phone ให้ครบถ้วน'
        });
      }

      const normalizedCode = String(inviteCode).trim().toUpperCase();

      const invite = await billingService.prisma.roomInvite.findUnique({
        where: { code: normalizedCode },
        include: {
          room: {
            include: {
              building: {
                include: { setting: true }
              }
            }
          }
        }
      });

      if (!invite) {
        return res.status(404).json({
          success: false,
          message: 'รหัสเชิญ (Invite Code) ไม่ถูกต้อง'
        });
      }

      if (invite.isUsed) {
        return res.status(400).json({
          success: false,
          message: 'รหัสเชิญนี้ถูกใช้งานไปแล้ว'
        });
      }

      if (new Date() > new Date(invite.expiresAt)) {
        return res.status(400).json({
          success: false,
          message: 'รหัสเชิญนี้หมดอายุแล้ว (เกิน 48 ชั่วโมง)'
        });
      }

      if (invite.room.status !== 'available' && !invite.room.tenantId) {
        return res.status(400).json({
          success: false,
          message: `ห้อง ${invite.room.roomNumber} ไม่ว่างหรือถูกลงทะเบียนไปแล้ว`
        });
      }

      // ดึงข้อมูลโปรไฟล์ LINE จริง (จาก Verified Token Payload หรือ LINE Messaging API)
      let realDisplayName = req.lineUser?.displayName || lineDisplayName || null;
      let realPictureUrl = req.lineUser?.pictureUrl || linePictureUrl || null;
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
        existingTenant = await billingService.prisma.tenant.findUnique({
          where: { lineUserId },
          include: { rooms: true }
        });
      }
      if (!existingTenant && phone) {
        const cleanPhone = String(phone).trim();
        existingTenant = await billingService.prisma.tenant.findFirst({
          where: { phone: cleanPhone },
          include: { rooms: true }
        });
      }
      if (!existingTenant && invite.room.tenantId) {
        existingTenant = await billingService.prisma.tenant.findUnique({
          where: { id: invite.room.tenantId },
          include: { rooms: true }
        });
      }

      const result = await billingService.prisma.$transaction(async (tx) => {
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

        const updatedRoom = await tx.room.update({
          where: { id: invite.roomId },
          data: {
            tenantId: tenantRecord.id,
            status: 'occupied'
          }
        });

        await tx.roomInvite.update({
          where: { id: invite.id },
          data: { isUsed: true }
        });

        // 📝 คำนวณเงินประกันจาก Building Setting หากมี
        const depositMonths = invite.room.building?.setting?.depositMonths || 0;
        const roomPrice = Number(invite.room.price) || 0;
        const depositAmount = depositMonths > 0 ? depositMonths * roomPrice : 0;

        // 📝 สร้างสัญญาเช่าเริ่มต้น (Active Lease Contract) สำหรับห้องใหม่
        const startDate = new Date();
        const expectedEndDate = new Date(startDate);
        expectedEndDate.setFullYear(expectedEndDate.getFullYear() + 1);

        const lease = await tx.leaseContract.create({
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

        return { tenant: tenantRecord, room: updatedRoom, lease };
      });

      // 📲 ส่ง LINE Welcome Flex Message หากมี LINE User ID
      if (lineUserId) {
        lineService.sendWelcomeFlexMessage(lineUserId, result.tenant).catch(() => {});
      }

      return res.status(201).json({
        success: true,
        message: `ลงทะเบียนผู้เช่า ${firstName} ${lastName} และผูกเข้ากับห้อง ${result.room.roomNumber} เรียบร้อยแล้ว`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ตรวจสอบความถูกต้องของ Invite Code ล่วงหน้าก่อนลงทะเบียน
   */
  async verifyInviteCode(req, res, next) {
    try {
      const { code } = req.params;
      const normalizedCode = String(code).trim().toUpperCase();

      const invite = await billingService.prisma.roomInvite.findUnique({
        where: { code: normalizedCode },
        include: { room: true }
      });

      if (!invite) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบรหัสเชิญ (Invite Code) นี้ในระบบ'
        });
      }

      if (invite.isUsed) {
        return res.status(400).json({
          success: false,
          message: 'รหัสเชิญนี้ถูกใช้งานไปแล้ว'
        });
      }

      if (new Date() > new Date(invite.expiresAt)) {
        return res.status(400).json({
          success: false,
          message: 'รหัสเชิญนี้หมดอายุแล้ว (เกิน 48 ชั่วโมง)'
        });
      }

      if (invite.room.status !== 'available') {
        return res.status(400).json({
          success: false,
          message: `ห้อง ${invite.room.roomNumber} มีผู้เช่าอยู่แล้ว`
        });
      }

      return res.status(200).json({
        success: true,
        message: `รหัสเชิญถูกต้อง: ห้องพัก ${invite.room.roomNumber}`,
        data: {
          code: invite.code,
          roomNumber: invite.room.roomNumber,
          floor: invite.room.floor,
          price: Number(invite.room.price),
          expiresAt: invite.expiresAt
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new LiffController();
