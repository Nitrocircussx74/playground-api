const billingService = require('../services/billingService');
const lineService = require('../services/lineService');

class LiffController {
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

      // 1. ค้นหาข้อมูล RoomInvite
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

      // 2. ตรวจสอบเงื่อนไขสถานะรหัสเชิญ
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

      // 3. ทำการบันทึกข้อมูลแบบ Prisma Transaction เพื่อ Atomic Integrity
      const result = await billingService.prisma.$transaction(async (tx) => {
        // a. สร้างข้อมูล Tenant
        const tenant = await tx.tenant.create({
          data: {
            firstName,
            lastName,
            phone,
            idCard: idCard || null,
            lineUserId: lineUserId || null
          }
        });

        // b. อัปเดตตาราง Room ผูกผู้เช่าและเปลี่ยนสถานะเป็น occupied
        const updatedRoom = await tx.room.update({
          where: { id: invite.roomId },
          data: {
            tenantId: tenant.id,
            status: 'occupied'
          }
        });

        // c. อัปเดตสถานะ RoomInvite ให้เป็น isUsed = true
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
}

module.exports = new LiffController();
