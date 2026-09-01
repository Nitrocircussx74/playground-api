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

      if (!lineUserId) {
        return res.status(200).json({
          success: true,
          isRegistered: false,
          data: null
        });
      }

      const tenant = await billingService.prisma.tenant.findFirst({
        where: { lineUserId },
        include: { rooms: { include: { building: true } } }
      });

      if (!tenant) {
        return res.status(200).json({
          success: true,
          isRegistered: false,
          data: null
        });
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
   * ซิงค์ข้อมูลโปรไฟล์ LINE ของลูกบ้านอัตโนมัติ (Profile Auto-Sync)
   */
  async syncLineProfile(req, res, next) {
    try {
      const { lineDisplayName, linePictureUrl, lineStatusMessage } = req.body;
      const lineUserId = req.lineUserId;

      const tenant = await billingService.prisma.tenant.findUnique({
        where: { lineUserId }
      });

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
          lineDisplayName: realDisplayName || null,
          linePictureUrl: realPictureUrl || null,
          lineStatusMessage: realStatusMessage || null
        }
      });

      return res.status(200).json({
        success: true,
        message: 'ซิงค์ข้อมูลโปรไฟล์ LINE สำเร็จ',
        data: {
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
   * ดึงข้อมูลโปรไฟล์ผู้เช่าสำหรับ LIFF App
   */
  async getTenantProfile(req, res, next) {
    try {
      const { lineUserId } = req.query;

      let tenant = null;
      if (lineUserId) {
        tenant = await billingService.prisma.tenant.findUnique({
          where: { lineUserId },
          include: { rooms: true }
        });
      }

      if (!tenant) {
        tenant = await billingService.prisma.tenant.findFirst({
          include: { rooms: true }
        });
      }

      if (!tenant) {
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้เช่า' });
      }

      const roomNumber = tenant.rooms && tenant.rooms.length > 0 ? tenant.rooms[0].roomNumber : '101';

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
          roomNumber,
          contractEndDate: '31 ธันวาคม 2026'
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

      return res.status(200).json({
        success: true,
        data: {
          buildingId: targetRoom?.building?.id || null,
          buildingName: targetRoom?.building?.name || 'หอพักหลัก',
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

      const invoice = await billingService.prisma.invoice.findUnique({
        where: { id },
        include: { room: true, tenant: true }
      });

      if (!invoice) {
        return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลใบแจ้งหนี้' });
      }

      if (invoice.tenant?.lineUserId !== req.lineUserId) {
        return res.status(403).json({
          success: false,
          message: 'ปฏิเสธการเข้าถึง: คุณไม่มีสิทธิ์ดูใบแจ้งหนี้ของผู้อื่น'
        });
      }

      const qrData = await lineService.generatePromptPayQr(invoice.grandTotal);

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
      const lineUserId = req.lineUserId;

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

      if (invoice.tenant?.lineUserId !== lineUserId) {
        return res.status(403).json({
          success: false,
          message: 'ปฏิเสธการเข้าถึง: คุณไม่มีสิทธิ์แนบสลิปสำหรับบิลของผู้อื่น'
        });
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
        data: updateData
      });

      if (invoice.tenant?.lineUserId || lineUserId) {
        await lineService.pushSlipReceivedNotification(
          invoice.tenant?.lineUserId || lineUserId,
          invoice.invoiceNumber
        );
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

      if (invite.room.status !== 'available') {
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

      const result = await billingService.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
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

        const updatedRoom = await tx.room.update({
          where: { id: invite.roomId },
          data: {
            tenantId: tenant.id,
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

        // 📝 สร้างสัญญาเช่าเริ่มต้น (Active Lease Contract) เพื่อให้บันทึกประวัติการเข้าอยู่และแสดงในหน้าประวัติ
        const startDate = new Date();
        const expectedEndDate = new Date(startDate);
        expectedEndDate.setFullYear(expectedEndDate.getFullYear() + 1);

        const lease = await tx.leaseContract.create({
          data: {
            roomId: invite.roomId,
            tenantId: tenant.id,
            buildingId: invite.room.buildingId || null,
            startDate,
            expectedEndDate,
            depositAmount,
            status: 'ACTIVE',
            adminNote: 'ลงทะเบียนเข้าพักผ่านระบบ LINE LIFF (Invite Code)'
          }
        });

        return { tenant, room: updatedRoom, lease };
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
