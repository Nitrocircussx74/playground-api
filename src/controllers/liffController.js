const billingService = require('../services/billingService');
const { isFeatureEnabled } = require('../middlewares/requireFeatureMiddleware');
const tenantService = require('../services/tenantService');
const tenantAuthService = require('../services/tenantAuthService');
const lineService = require('../services/lineService');
const config = require('../config/env');

class LiffController {
  /**
   * Silent Re-Authentication สำหรับต่ออายุเซสชัน LIFF อัตโนมัติเบื้องหลัง
   * 1. รับ LINE ID Token จาก Payload หรือ Header
   * 2. Verify Signature กับ LINE API Server
   * 3. ค้นหา Tenant ในระบบ
   * 4. ออก Backend JWT ตัวใหม่และส่งกลับ
   */
  async silentLogin(req, res, next) {
    try {
      const result = await tenantAuthService.silentLogin({
        lineIdToken: req.body?.lineIdToken || req.body?.idToken || req.headers['x-line-id-token'],
        authHeader: req.headers['authorization'],
        buildingId: req.body?.buildingId || req.query?.buildingId || null,
        lineDisplayName: req.body?.lineDisplayName,
        linePictureUrl: req.body?.linePictureUrl,
        lineUserIdFromRequest: req.lineUserId,
        devLineUserId: req.headers['x-line-user-id'] || req.body?.lineUserId,
        // ⚠️ เจตนาใช้แค่ nodeEnv==='development' (ไม่รวม mockMode) เหมือน liffAuthMiddleware.js —
        // นี่คือ "ไม่มี Token เลย ปล่อยผ่านเป็น Anonymous Dev User" ซึ่งเป็นคนละเรื่องกับ mockMode
        // ที่มีไว้ข้ามการยิง Network ไปตรวจ Token ที่ "มี" ส่งมาจริง (อยู่ใน verifyLineIdToken() แล้ว)
        isDevOrMock: config.nodeEnv === 'development',
        accessExpiresIn: config.jwt.accessExpiresIn
      });
      return res.status(result.statusCode).json(result.body);
    } catch (error) {
      next(error);
    }
  }

  /**
   * ตรวจสอบสถานะการเป็นลูกบ้านผ่าน lineUserId สำหรับ Smart Entry Gateway Router
   */
  async checkTenantStatus(req, res, next) {
    try {
      // ผูก LINE กับผู้เช่าจาก phone/roomNumber/tenantId ที่ไม่ผ่านการยืนยัน (PIN/Invite) ได้เฉพาะ Dev
      // Production ต้องผูกผ่าน /auth/verify-phone หรือ /link-account ที่มี Rate Limit + ตรวจสอบเท่านั้น
      const { phone, roomNumber, tenantId } = config.nodeEnv === 'development' ? req.query || {} : {};
      const result = await tenantService.checkTenantStatus({
        lineUserId: req.lineUserId,
        phone,
        roomNumber,
        tenantId,
        lineUser: req.lineUser
      });
      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      console.error('checkTenantStatus error:', error);
      next(error);
    }
  }

  /**
   * ยืนยันตัวตนและผูกบัญชีลูกบ้านผ่านหมายเลขโทรศัพท์ (Phone Number Verification)
   * POST /api/v1/liff/auth/verify-phone
   */
  async verifyPhoneAndLinkTenant(req, res, next) {
    try {
      const { phone, roomNumber, buildingId, building, lineDisplayName, linePictureUrl, lineStatusMessage } = req.body;
      const { tenant: updatedTenant, room, accessToken } = await tenantService.verifyPhoneAndLinkTenant({
        phone,
        roomNumber,
        buildingId,
        building,
        lineDisplayName,
        linePictureUrl,
        lineStatusMessage,
        lineUserId: req.lineUserId,
        lineUser: req.lineUser
      });

      return res.status(200).json({
        success: true,
        message: 'ยืนยันตัวตนและผูกบัญชี LINE สำเร็จเรียบร้อยแล้ว',
        accessToken,
        token: accessToken,
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
          room: room ? { id: room.id, roomNumber: room.roomNumber } : null,
          accessToken
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
      const { tenant: updatedTenant, room } = await tenantService.linkTenantAccountByInviteCode({
        inviteCode,
        phoneLast4,
        lineDisplayName,
        linePictureUrl,
        lineStatusMessage,
        lineUserId: req.lineUserId,
        lineUser: req.lineUser
      });

      return res.status(200).json({
        success: true,
        message: 'ผูกบัญชีลูกบ้านสำเร็จเรียบร้อยแล้ว',
        hasPin: Boolean(updatedTenant.pinHash),
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
          room: room ? { id: room.id, roomNumber: room.roomNumber } : null,
          // ระบุว่าบัญชีนี้ตั้งรหัส PIN ไว้แล้วหรือยัง เพื่อให้ฝั่ง Frontend พาไปตั้ง PIN ต่อทันทีหากยังไม่เคยตั้ง
          hasPin: Boolean(updatedTenant.pinHash)
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
      const { lineDisplayName, linePictureUrl, lineStatusMessage, phone, roomNumber } = req.body;
      const isDev = config.nodeEnv === 'development';
      // ระบุตัวผู้เช่าจาก Token ที่ verify แล้วเท่านั้น เดิมหาจาก tenantId/phone/roomNumber ที่ Client ส่งมาได้
      // แล้วเขียน lineUserId ของผู้ส่งทับลงไป = ยึดบัญชีคนอื่นได้แค่รู้เบอร์หรือเลขห้อง (phone/roomNumber เหลือไว้ใน Dev)
      const updatedTenant = await tenantService.syncLineProfile({
        lineDisplayName,
        linePictureUrl,
        lineStatusMessage,
        tenantId: req.scope?.tenantId || req.tenantId,
        phone: isDev ? phone : undefined,
        roomNumber: isDev ? roomNumber : undefined,
        lineUserId: req.lineUserId,
        lineUser: req.lineUser,
        isDevOrMockFallback: isDev
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

      const profile = await tenantService.getTenantProfileForLiff({
        lineUserId,
        tenantId: req.scope?.tenantId || tenantId,
        roomNumber: targetRoomNumber,
        activeRoomId: req.roomId,
        activeBuildingId: req.buildingId
      });

      if (!profile) {
        return res.status(200).json({
          success: true,
          isRegistered: false,
          isLinked: false,
          hasPin: false,
          data: null
        });
      }

      return res.status(200).json({ success: true, data: profile });
    } catch (error) {
      next(error);
    }
  }

  /**
   * อัปเดตข้อมูลติดต่อผู้เช่า (เบอร์โทรศัพท์) สำหรับ LIFF App
   */
  async updateTenantProfile(req, res, next) {
    try {
      const { phone, lineUserId, tenantId } = req.body || {};
      const updatedTenant = await tenantService.updateTenantContactPhone({
        phone,
        lineUserId: req.lineUserId || lineUserId,
        tenantId: req.tenantId || tenantId
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
      const targetRoomId = req.roomId;
      const targetBuildingId = req.buildingId;
      const { tenantId } = req.lineUserId ? {} : req.query;

      const settings = await tenantService.getBuildingSettingForTenant({
        lineUserId,
        tenantId,
        roomId: targetRoomId,
        buildingId: targetBuildingId
      });

      if (!settings) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบข้อมูลห้องพัก/ตึกที่ผูกกับบัญชีนี้'
        });
      }

      return res.status(200).json({ success: true, data: settings });
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
      const { invoice, qrData } = await billingService.getInvoiceForLiff({ id, lineUserId });
      return res.status(200).json({ success: true, data: { invoice, qrData } });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ดาวน์โหลดไฟล์รูปภาพ PromptPay QR Code ของใบแจ้งหนี้โดยตรง (Direct PNG Image Download)
   * GET /api/v1/liff/invoices/:id/qr-image
   */
  async getInvoiceQrImage(req, res, next) {
    try {
      const { id } = req.params;
      const { buffer, filename } = await billingService.getInvoiceQrImage(id);

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(buffer);
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
      const lineUserId = req.lineUserId;

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'กรุณาแนบไฟล์รูปภาพสลิปโอนเงิน' });
      }

      const invoiceRoom = await billingService.prisma.invoice.findUnique({ where: { id }, select: { room: { select: { buildingId: true } } } });
      if (!(await isFeatureEnabled('ENABLE_LINE_PAYMENT', invoiceRoom?.room?.buildingId || null))) {
        return res.status(403).json({ success: false, message: 'ฟีเจอร์ชำระเงินออนไลน์ถูกปิดใช้งานสำหรับตึกนี้' });
      }

      const slipUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
      const { updatedInvoice, verification } = await billingService.uploadSlipFromLiff({
        id,
        lineUserId,
        file: req.file,
        declaredAmount: req.body.declaredAmount,
        slipUrl
      });

      // 🔔 แนบสลิปที่รอตรวจสอบด้วยมือ (ไม่ auto-approve) ต้องเตือนแอดมินให้มาดู ส่วนที่ auto-approve แล้วไม่ต้องรบกวน
      if (!verification.autoApproved) {
        lineService.logDelivery({
          buildingId: updatedInvoice.room?.buildingId || null,
          tenantId: updatedInvoice.tenantId,
          roomId: updatedInvoice.roomId,
          notificationType: 'SLIP_UPLOADED',
          messagePreview: `แนบสลิปรอตรวจสอบ: บิล ${updatedInvoice.invoiceNumber}${updatedInvoice.room?.roomNumber ? ` (ห้อง ${updatedInvoice.room.roomNumber})` : ''}`
        }).catch(() => {});
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
      const result = await tenantService.registerTenantWithInvite({
        inviteCode,
        firstName,
        lastName,
        phone,
        idCard,
        lineDisplayName,
        linePictureUrl,
        lineStatusMessage,
        lineUserId: req.lineUserId,
        lineUser: req.lineUser
      });

      const isCoResident = result.role === 'CO_RESIDENT';

      return res.status(201).json({
        success: true,
        message: isCoResident
          ? `ลงทะเบียนรูมเมท ${firstName} ${lastName} เข้าสู่ห้อง ${result.room.roomNumber} เรียบร้อยแล้ว`
          : `ลงทะเบียนผู้เช่า ${firstName} ${lastName} และผูกเข้ากับห้อง ${result.room.roomNumber} เรียบร้อยแล้ว`,
        hasPin: Boolean(result.tenant.pinHash),
        data: {
          ...result,
          tenant: {
            id: result.tenant.id,
            firstName: result.tenant.firstName,
            lastName: result.tenant.lastName,
            phone: result.tenant.phone,
            lineUserId: result.tenant.lineUserId,
            lineDisplayName: result.tenant.lineDisplayName,
            linePictureUrl: result.tenant.linePictureUrl,
            lineStatusMessage: result.tenant.lineStatusMessage
          },
          hasPin: Boolean(result.tenant.pinHash)
        }
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
      const invite = await tenantService.verifyInviteCode(code);

      return res.status(200).json({
        success: true,
        message: `รหัสเชิญถูกต้อง: ห้องพัก ${invite.room.roomNumber} (${invite.role === 'CO_RESIDENT' ? 'ผู้อยู่อาศัยร่วม' : 'ผู้เช่าหลัก'})`,
        data: {
          code: invite.code,
          role: invite.role,
          roomNumber: invite.room.roomNumber,
          floor: invite.room.floor,
          price: Number(invite.room.price),
          buildingName: invite.room.building?.name || 'อาคารหลัก',
          expiresAt: invite.expiresAt
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * สร้างรหัสเชิญรูมเมทสำหรับผู้เช่าหลัก (Create Roommate Invite)
   * POST /api/v1/liff/invites/roommate
   */
  async createRoommateInvite(req, res, next) {
    try {
      const { invite, targetRoom } = await tenantService.createRoommateInvite({
        lineUserId: req.lineUserId,
        tenantId: req.tenantId,
        activeRoomId: req.roomId,
        activeBuildingId: req.buildingId
      });

      return res.status(201).json({
        success: true,
        message: `สร้างรหัสเชิญรูมเมท ${invite.code} สำหรับห้อง ${targetRoom.roomNumber} สำเร็จ`,
        data: {
          code: invite.code,
          role: invite.role,
          roomNumber: targetRoom.roomNumber,
          buildingName: invite.room?.building?.name || 'อาคารหลัก',
          expiresAt: invite.expiresAt
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ดึงข้อมูลสาธารณะของตึก (ชื่อ, ธีมสี, โลโก้, ที่อยู่) สำหรับ Onboarding & Branding
   * GET /api/v1/liff/building-info?building=...
   */
  async getBuildingPublicInfo(req, res, next) {
    try {
      const buildingParam = req.query.building || req.query.buildingId || req.query.id || req.query.code;
      if (!buildingParam) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาระบุรหัสตึกหรือชื่อตึก (building หรือ buildingId)'
        });
      }

      const building = await tenantService.getBuildingPublicInfo(buildingParam);
      return res.status(200).json({ success: true, data: building });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/liff/meter-history
   * ดึงประวัติมิเตอร์น้ำ/ไฟย้อนหลัง 6 เดือน สำหรับแสดงกราฟใน LIFF
   */
  async getMeterHistory(req, res, next) {
    try {
      const { tenantId, lineUserId } = req;
      let tenant = null;
      if (tenantId) {
        tenant = await billingService.prisma.tenant.findUnique({ where: { id: tenantId }, include: { rooms: true } });
      }
      if (!tenant && lineUserId) {
        tenant = await billingService.prisma.tenant.findUnique({ where: { lineUserId }, include: { rooms: true } });
      }
      if (!tenant || !tenant.rooms?.length) {
        return res.status(200).json({ success: true, data: [] });
      }

      const targetRoomId = req.roomId;
      const targetBuildingId = req.buildingId;

      let roomId = tenant.rooms[0].id;
      if (targetRoomId && tenant.rooms.some(r => r.id === targetRoomId)) {
        roomId = targetRoomId;
      } else if (targetBuildingId) {
        const roomInBuilding = tenant.rooms.find(r => r.buildingId === targetBuildingId);
        if (roomInBuilding) roomId = roomInBuilding.id;
      }
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const records = await billingService.prisma.meterRecord.findMany({
        where: { roomId, recordedAt: { gte: sixMonthsAgo } },
        orderBy: { recordedAt: 'asc' }
      });

      return res.status(200).json({ success: true, data: records });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/liff/inspections
   * ดึงรายการตรวจสภาพห้องพัก (Move-in/Move-out) ของผู้เช่าปัจจุบัน
   */
  async getInspections(req, res, next) {
    try {
      const { tenantId, lineUserId } = req;
      let tenant = null;
      if (tenantId) {
        tenant = await billingService.prisma.tenant.findUnique({
          where: { id: tenantId },
          include: { leaseContracts: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } } }
        });
      }
      if (!tenant && lineUserId) {
        tenant = await billingService.prisma.tenant.findUnique({
          where: { lineUserId },
          include: { leaseContracts: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } } }
        });
      }
      if (!tenant || !tenant.leaseContracts?.length) {
        return res.status(200).json({ success: true, data: [] });
      }

      const targetRoomId = req.roomId;
      const targetBuildingId = req.buildingId;

      let activeLease = tenant.leaseContracts[0];
      if (targetRoomId) {
        const matched = tenant.leaseContracts.find(l => l.roomId === targetRoomId);
        if (matched) activeLease = matched;
      } else if (targetBuildingId) {
        const matched = tenant.leaseContracts.find(l => l.buildingId === targetBuildingId || l.room?.buildingId === targetBuildingId);
        if (matched) activeLease = matched;
      }
      const leaseId = activeLease.id;
      const inspections = await billingService.prisma.roomInspection.findMany({
        where: { leaseId },
        orderBy: { createdAt: 'desc' }
      });

      return res.status(200).json({ success: true, data: inspections });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/liff/contract
   * ดึงสัญญาเช่าห้องพักปัจจุบันพร้อมรายละเอียดตึกและกฎระเบียบ สำหรับลูกบ้านดู E-Contract
   */
  async getTenantContract(req, res, next) {
    try {
      const { tenantId, lineUserId } = req;
      let tenant = null;
      if (tenantId) {
        tenant = await billingService.prisma.tenant.findUnique({
          where: { id: tenantId },
          include: {
            leaseContracts: {
              where: { status: 'ACTIVE' },
              orderBy: { createdAt: 'desc' },
              include: {
                room: true,
                building: {
                  include: {
                    setting: true
                  }
                },
                inspections: true
              }
            }
          }
        });
      }
      if (!tenant && lineUserId) {
        tenant = await billingService.prisma.tenant.findUnique({
          where: { lineUserId },
          include: {
            leaseContracts: {
              where: { status: 'ACTIVE' },
              orderBy: { createdAt: 'desc' },
              include: {
                room: true,
                building: {
                  include: {
                    setting: true
                  }
                },
                inspections: true
              }
            }
          }
        });
      }
      if (!tenant || !tenant.leaseContracts?.length) {
        return res.status(200).json({ success: true, data: null });
      }

      let activeLease = tenant.leaseContracts[0];
      const targetRoomId = req.roomId;
      const targetBuildingId = req.buildingId;
      if (targetRoomId) {
        const matched = tenant.leaseContracts.find(l => l.roomId === targetRoomId);
        if (matched) activeLease = matched;
      } else if (targetBuildingId) {
        const matched = tenant.leaseContracts.find(l => l.buildingId === targetBuildingId || l.room?.buildingId === targetBuildingId);
        if (matched) activeLease = matched;
      }

      // เช็ค FeatureToggle ของตึกผู้เช่า (inline เหมือน facilityController/pollController — Endpoint นี้
      // ไม่เคยเช็คมาก่อนเลยตั้งแต่เพิ่มฟีเจอร์ ทำให้ปิด ENABLE_E_CONTRACT ใน CMS แล้วลูกบ้านยังเข้าดูสัญญาผ่าน
      // /liff/contract ตรงๆ ได้อยู่ดี ถ้าเคยเปิดหน้านี้ค้างไว้หรือมีลิงก์เดิม ปุ่มในหน้าโปรไฟล์ที่หายไปช่วยซ่อน
      // ทางเข้าปกติได้แค่จุดเดียว ไม่ได้ปิดกั้น Endpoint จริง)
      const contractBuildingId = activeLease.buildingId || activeLease.room?.buildingId || null;
      if (!(await isFeatureEnabled('ENABLE_E_CONTRACT', contractBuildingId))) {
        return res.status(403).json({ success: false, message: 'ฟีเจอร์ดูสัญญาเช่าถูกปิดใช้งานสำหรับตึกนี้' });
      }

      return res.status(200).json({
        success: true,
        data: {
          ...activeLease,
          tenant: {
            id: tenant.id,
            firstName: tenant.firstName,
            lastName: tenant.lastName,
            phone: tenant.phone,
            idCard: tenant.idCard || null,
            lineUserId: tenant.lineUserId || null
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new LiffController();
