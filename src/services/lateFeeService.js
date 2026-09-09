const prisma = require('../config/prisma');

class LateFeeService {
  constructor() {
    this.prisma = prisma;
  }

  /**
   * ปรับเวลา Date ให้เป็นเวลาเที่ยงคืน (00:00:00) ตาม Timezone Asia/Bangkok (+07:00)
   * เพื่อความถูกต้องของการคำนวณจำนวนวัน ไม่คลาดเคลื่อนจากเศษชั่วโมง/นาที
   * @param {Date|string} dateInput 
   * @returns {Date}
   */
  getBangkokMidnight(dateInput) {
    if (!dateInput) return new Date();
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return new Date();

    // คำนวณเวลาท้องถิ่น Bangkok (UTC+7)
    const utcTime = d.getTime() + (d.getTimezoneOffset() * 60000);
    const bkkTime = new Date(utcTime + (7 * 3600000));
    
    // ตั้งเป็น 00:00:00.000
    bkkTime.setHours(0, 0, 0, 0);
    return bkkTime;
  }

  /**
   * คำนวณค่าปรับสำหรับบิลเดี่ยว (Pure Calculation)
   * @param {Object} invoice - ออบเจ็กต์ใบแจ้งหนี้
   * @param {Object} buildingSetting - การตั้งค่าของตึก (lateFeeType, lateFeeAmount, gracePeriodDays)
   * @param {Date|string} [targetDate=new Date()] - วันที่ที่ใช้คำนวณ (Default: วันปัจจุบัน)
   * @returns {Object} { isOverdue, daysOverdue, effectiveOverdueDays, lateFeeCharge, newGrandTotal }
   */
  calculateLateFee(invoice, buildingSetting, targetDate = new Date()) {
    if (!invoice) {
      throw new Error('Invoice object is required');
    }

    const roomPrice = Number(invoice.roomPrice) || 0;
    const waterTotal = Number(invoice.waterTotal) || 0;
    const electricTotal = Number(invoice.electricTotal) || 0;
    const commonFee = Number(invoice.commonFee) || 0;
    const otherFee = Number(invoice.otherFee) || 0;
    const baseSubtotal = roomPrice + waterTotal + electricTotal + commonFee + otherFee;

    // ถ้าไม่มี dueDate หรือสถานะเป็น paid -> ไม่คิดค่าปรับ
    if (!invoice.dueDate || invoice.status === 'paid') {
      return {
        isOverdue: false,
        daysOverdue: 0,
        effectiveOverdueDays: 0,
        lateFeeCharge: 0,
        newGrandTotal: baseSubtotal
      };
    }

    const lateFeeType = (buildingSetting?.lateFeeType || 'NONE').toUpperCase();
    const lateFeeAmount = Number(buildingSetting?.lateFeeAmount || 0);
    const gracePeriodDays = Math.max(0, parseInt(buildingSetting?.gracePeriodDays || 0, 10));

    // คำนวณความต่างของวัน (Date Math with Timezone normalization)
    const bkkDue = this.getBangkokMidnight(invoice.dueDate);
    const bkkCurrent = this.getBangkokMidnight(targetDate);

    const diffMs = bkkCurrent.getTime() - bkkDue.getTime();
    const daysOverdue = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // หากยังไม่ถึงวันครบกำหนด (daysOverdue <= 0)
    if (daysOverdue <= 0) {
      return {
        isOverdue: false,
        daysOverdue: 0,
        effectiveOverdueDays: 0,
        lateFeeCharge: 0,
        newGrandTotal: baseSubtotal
      };
    }

    // วันที่เกินกำหนดหลังหักระยะเวลาผ่อนผัน (Grace Period)
    const effectiveOverdueDays = Math.max(0, daysOverdue - gracePeriodDays);

    let lateFeeCharge = 0;

    if (effectiveOverdueDays > 0) {
      if (lateFeeType === 'FLAT') {
        // เหมาจ่ายครั้งเดียว
        lateFeeCharge = Math.max(0, lateFeeAmount);
      } else if (lateFeeType === 'DAILY') {
        // คิดรายวันตามจำนวนวันที่เกินกำหนดหลังหัก Grace Period
        lateFeeCharge = Math.max(0, effectiveOverdueDays * lateFeeAmount);
      }
    }

    const newGrandTotal = baseSubtotal + lateFeeCharge;

    return {
      isOverdue: daysOverdue > 0,
      daysOverdue,
      effectiveOverdueDays,
      lateFeeCharge,
      newGrandTotal
    };
  }

  /**
   * ค้นหาและอัปเดตบิลค้างชำระทั้งหมดในระบบ (Automated Batch Processing)
   * @param {Object} [options]
   * @param {string} [options.buildingId] - ระบุตึก (ถ้าต้องการ)
   * @param {Date|string} [options.targetDate=new Date()] - วันที่ประมวลผล
   * @returns {Promise<Object>} สรุปผลการประมวลผล
   */
  async processLateFees(options = {}) {
    const targetDate = options.targetDate ? new Date(options.targetDate) : new Date();
    const buildingId = options.buildingId;

    const whereClause = {
      status: { in: ['pending', 'overdue'] }
    };

    if (buildingId) {
      whereClause.room = { buildingId };
    }

    // 1. ดึงบิลค้างชำระพร้อมข้อมูลตึกและการตั้งค่า
    const invoices = await this.prisma.invoice.findMany({
      where: whereClause,
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

    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalLateFeeAmount = 0;
    const details = [];

    for (const invoice of invoices) {
      totalProcessed++;
      const buildingSetting = invoice.room?.building?.setting || {};

      const result = this.calculateLateFee(invoice, buildingSetting, targetDate);

      const currentLateFee = Number(invoice.lateFeeCharge) || 0;
      const currentGrandTotal = Number(invoice.grandTotal) || 0;
      const targetStatus = result.isOverdue ? 'overdue' : invoice.status;

      // ตรวจสอบว่ามีการเปลี่ยนแปลงยอดค่าปรับ ยอดรวม หรือสถานะหรือไม่
      const isFeeChanged = Math.abs(currentLateFee - result.lateFeeCharge) > 0.001;
      const isGrandTotalChanged = Math.abs(currentGrandTotal - result.newGrandTotal) > 0.001;
      const isStatusChanged = invoice.status !== targetStatus;

      if (isFeeChanged || isGrandTotalChanged || isStatusChanged) {
        await this.prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            lateFeeCharge: result.lateFeeCharge,
            grandTotal: result.newGrandTotal,
            status: targetStatus
          }
        });

        totalUpdated++;
        totalLateFeeAmount += result.lateFeeCharge;

        details.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          roomNumber: invoice.room?.roomNumber,
          buildingName: invoice.room?.building?.name,
          dueDate: invoice.dueDate,
          daysOverdue: result.daysOverdue,
          effectiveOverdueDays: result.effectiveOverdueDays,
          oldLateFee: currentLateFee,
          newLateFee: result.lateFeeCharge,
          grandTotal: result.newGrandTotal,
          status: targetStatus
        });
      }
    }

    return {
      success: true,
      timestamp: new Date().toISOString(),
      targetDate: this.getBangkokMidnight(targetDate).toISOString(),
      totalProcessed,
      totalUpdated,
      totalLateFeeAmount,
      details
    };
  }
}

module.exports = new LateFeeService();
