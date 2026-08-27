const billingService = require('../services/billingService');
const lineService = require('../services/lineService');

class LiffController {
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
      const { lineUserId } = req.body;

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
        return res.status(403).json({
          success: false,
          message: 'ปฏิเสธการเข้าถึง: คุณไม่มีสิทธิ์แนบสลิปสำหรับบิลของผู้อื่น'
        });
      }

      const protocol = req.protocol;
      const host = req.get('host');
      const slipUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

      const updatedInvoice = await billingService.prisma.invoice.update({
        where: { id },
        data: {
          slipUrl,
          status: 'reviewing'
        }
      });

      if (invoice.tenant?.lineUserId || lineUserId) {
        await lineService.pushSlipReceivedNotification(
          invoice.tenant?.lineUserId || lineUserId,
          invoice.invoiceNumber
        );
      }

      return res.status(200).json({
        success: true,
        message: 'แนบสลิปโอนเงินเรียบร้อยแล้ว สถานะเปลี่ยนเป็นรอแอดมินตรวจสอบ (reviewing)',
        data: updatedInvoice
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
      const { inviteCode, firstName, lastName, phone, idCard, lineUserId } = req.body;

      if (!inviteCode || !firstName || !lastName || !phone) {
        return res.status(400).json({
          success: false,
          message: 'กรุณากรอกข้อมูล inviteCode, firstName, lastName และ phone ให้ครบถ้วน'
        });
      }

      const normalizedCode = String(inviteCode).trim().toUpperCase();

      const invite = await billingService.prisma.roomInvite.findUnique({
        where: { code: normalizedCode },
        include: { room: true }
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

      const result = await billingService.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            firstName,
            lastName,
            phone,
            idCard: idCard || null,
            lineUserId: lineUserId || null
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

        return { tenant, room: updatedRoom };
      });

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
