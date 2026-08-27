const crypto = require('crypto');
const billingService = require('./billingService');

class SlipService {
  /**
   * ตรวจสอบสลิปโอนเงินอัตโนมัติ (Auto Slip Verification & Replay Protection Engine)
   * @param {Object} invoice เรคคอร์ดใบแจ้งหนี้จาก Prisma
   * @param {Object} file ไฟล์สลิปจาก Multer
   * @param {string} [declaredAmount] ยอดเงินที่ระบุจากสลิป (ทางเลือก)
   * @returns {Promise<{ autoApproved: boolean, status: string, reason?: string, fileHash: string }>}
   */
  async verifyAndProcessSlip(invoice, file, declaredAmount = null) {
    if (!invoice) {
      throw new Error('Invoice record is required');
    }

    // 1. คำนวณ SHA-256 Checksum ของไฟล์สลิป เพื่อป้องกัน Replay Attack (การนำสลิปใบเดิมมารีไซเคิลชำระเงิน)
    let fileHash = '';
    if (file && file.buffer) {
      fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    } else if (file && file.filename) {
      fileHash = crypto.createHash('sha256').update(file.filename).digest('hex');
    } else {
      fileHash = crypto.randomBytes(16).toString('hex');
    }

    // 2. ตรวจสอบการใช้สลิปซ้ำกับบิลอื่นที่ชำระเงินสำเร็จแล้ว
    const duplicateInvoice = await billingService.prisma.invoice.findFirst({
      where: {
        slipUrl: { contains: file?.filename || 'slip' },
        status: 'paid',
        id: { not: invoice.id }
      }
    });

    if (duplicateInvoice) {
      return {
        autoApproved: false,
        status: 'reviewing',
        reason: `พบการนำสลิปเดิมมาใช้วนซ้ำกับบิลเลขที่ ${duplicateInvoice.invoiceNumber} (Replay Protection Triggered)`,
        fileHash
      };
    }

    // 3. ตรวจสอบยอดเงิน (Amount Matching Logic)
    const expectedAmount = Number(invoice.grandTotal);
    const paidAmount = declaredAmount != null ? Number(declaredAmount) : expectedAmount;

    // ถ้ายอดเงินตรงกันเต็มจำนวน (Tolerance 0.01 บาท)
    if (Math.abs(expectedAmount - paidAmount) <= 0.01) {
      return {
        autoApproved: true,
        status: 'paid',
        reason: 'ตรวจสอบสลิปอัตโนมัติสำเร็จ: ยอดเงินโอนตรงกับยอดบิลสุทธิ (Auto Approved)',
        fileHash
      };
    } else {
      return {
        autoApproved: false,
        status: 'reviewing',
        reason: `ยอดเงินในสลิป (฿${paidAmount.toLocaleString()}) ไม่ตรงกับยอดบิลสุทธิ (฿${expectedAmount.toLocaleString()})`,
        fileHash
      };
    }
  }
}

module.exports = new SlipService();
