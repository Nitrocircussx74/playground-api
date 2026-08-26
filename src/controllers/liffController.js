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

      // สร้าง PromptPay QR Code
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

      // ตรวจสอบ Security & Authorization: หากมี lineUserId และมี tenant.lineUserId ต้องตรงกัน
      if (lineUserId && invoice.tenant?.lineUserId && invoice.tenant.lineUserId !== lineUserId) {
        return res.status(403).json({
          success: false,
          message: 'ปฏิเสธการเข้าถึง: คุณไม่มีสิทธิ์แนบสลิปสำหรับบิลของผู้อื่น'
        });
      }

      const protocol = req.protocol;
      const host = req.get('host');
      const slipUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

      // อัปเดตสถานะบิลเป็น 'reviewing'
      const updatedInvoice = await billingService.prisma.invoice.update({
        where: { id },
        data: {
          slipUrl,
          status: 'reviewing'
        }
      });

      // ส่ง LINE Push Message ตอบกลับไปหาลูกบ้าน
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
}

module.exports = new LiffController();
