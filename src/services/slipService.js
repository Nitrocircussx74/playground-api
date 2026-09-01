const crypto = require('crypto');
const fs = require('fs');
const billingService = require('./billingService');

class SlipService {
  /**
   * ตรวจสอบสลิปโอนเงินเบื้องต้น & กันการนำสลิปเดิมมาใช้ซ้ำ (Replay Protection Engine)
   *
   * หมายเหตุ: ระบบยังไม่มีการตรวจเนื้อสลิปจริง (ไม่มี OCR/เรียก Bank API) จึง**ปิดการ Auto-Approve
   * ชั่วคราว** ทุกกรณีจะได้สถานะ 'reviewing' เสมอ ต้องให้แอดมินตรวจสอบและกดยืนยันจ่ายเงินเองเท่านั้น
   * เพื่อป้องกันการแนบรูปใด ๆ ก็ตามแล้วได้บิล PAID ฟรีโดยไม่มีการโอนเงินจริง
   *
   * @param {Object} invoice เรคคอร์ดใบแจ้งหนี้จาก Prisma
   * @param {Object} file ไฟล์สลิปจาก Multer
   * @param {string} [declaredAmount] ยอดเงินที่ผู้ใช้ระบุว่าโอนไป (ทางเลือก ใช้แค่ช่วยแอดมินตรวจสอบ)
   * @returns {Promise<{ autoApproved: false, status: 'reviewing', reason: string, fileHash: string }>}
   */
  async verifyAndProcessSlip(invoice, file, declaredAmount = null) {
    if (!invoice) {
      throw new Error('Invoice record is required');
    }

    // 1. คำนวณ SHA-256 Checksum จาก "เนื้อไฟล์จริง" ของสลิป เพื่อป้องกัน Replay Attack (นำสลิปเดิมมาใช้ซ้ำข้ามบิล)
    // multer เก็บไฟล์แบบ diskStorage จึงไม่มี file.buffer ต้องอ่านเนื้อไฟล์จาก file.path มา hash เอง
    let fileHash = '';
    if (file && file.buffer) {
      fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');
    } else if (file && file.path) {
      const fileContent = fs.readFileSync(file.path);
      fileHash = crypto.createHash('sha256').update(fileContent).digest('hex');
    } else {
      fileHash = crypto.randomBytes(16).toString('hex');
    }

    // 2. ตรวจสอบการใช้สลิปซ้ำกับบิลอื่นที่ชำระเงินสำเร็จแล้ว (เทียบด้วย Checksum เนื้อไฟล์จริง ไม่ใช่ชื่อไฟล์ที่สุ่มใหม่ทุกครั้ง)
    const duplicateInvoice = await billingService.prisma.invoice.findFirst({
      where: {
        slipHash: fileHash,
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

    // 3. ตรวจสอบยอดเงินที่ผู้ใช้ระบุ (ใช้เป็นข้อมูลประกอบให้แอดมินตรวจสอบเท่านั้น ไม่ใช้ Auto-Approve)
    const expectedAmount = Number(invoice.grandTotal);

    if (declaredAmount == null) {
      return {
        autoApproved: false,
        status: 'reviewing',
        reason: `แนบสลิปแล้ว แต่ไม่ได้ระบุยอดโอน กรุณารอแอดมินตรวจสอบยอด ฿${expectedAmount.toLocaleString()} กับสลิปที่แนบมา`,
        fileHash
      };
    }

    const paidAmount = Number(declaredAmount);
    const amountMatches = Math.abs(expectedAmount - paidAmount) <= 0.01;

    return {
      autoApproved: false,
      status: 'reviewing',
      reason: amountMatches
        ? `ยอดเงินในสลิป (฿${paidAmount.toLocaleString()}) ตรงกับยอดบิลสุทธิ รอแอดมินตรวจสอบและยืนยันการชำระเงิน`
        : `ยอดเงินในสลิป (฿${paidAmount.toLocaleString()}) ไม่ตรงกับยอดบิลสุทธิ (฿${expectedAmount.toLocaleString()}) กรุณาตรวจสอบ`,
      fileHash
    };
  }
}

module.exports = new SlipService();
