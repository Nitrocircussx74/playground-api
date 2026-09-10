const prisma = require('../config/prisma');
const lineService = require('./lineService');
// หมายเหตุ: require('./slipService') แบบ Lazy (ในเมธอดที่ใช้) แทนการ require ที่ Top-level ของไฟล์
// เพราะ slipService.js เองก็ require('./billingService') อยู่แล้ว — ถ้า require กันตรงๆ ที่ Top-level
// ทั้งคู่จะเกิด Circular Dependency กันเข้ารอบ ทำให้ module.exports ฝั่งใดฝั่งหนึ่งได้ Object ที่โหลดไม่ครบ
// (ขึ้นกับลำดับการโหลด) require แบบ Lazy ข้างในฟังก์ชันจะปลอดภัยเพราะถูกเรียกตอน Runtime ที่ทุกโมดูลโหลดเสร็จแล้ว

// Rate Constants (No Magic Numbers)
const WATER_MINIMUM_UNITS = 5;
const WATER_MINIMUM_FEE = 150.0;
const WATER_RATE_PER_UNIT = 18.0;
const ELECTRIC_RATE_PER_UNIT = 8.0;
const DEFAULT_COMMON_FEE = 100.0;

class BillingService {
  constructor() {
    this.prisma = prisma;
  }

  /**
   * คำนวณจำนวนหน่วยที่ใช้ โดยตรวจสอบความถูกต้องของเลขมิเตอร์
   */
  calculateUnitsUsed(previousReading, currentReading, isReset = false) {
    const prev = Number(previousReading) || 0;
    const curr = Number(currentReading) || 0;

    if (isReset) {
      return curr;
    }

    if (curr < prev) {
      throw new Error(`Current reading (${curr}) cannot be lower than previous reading (${prev}) without reset flag`);
    }

    return curr - prev;
  }

  /**
   * คำนวณค่าน้ำประปาตามขั้นต่ำและอัตราต่อหน่วย
   */
  calculateWaterFee(units) {
    const u = Math.max(0, Number(units) || 0);
    if (u <= WATER_MINIMUM_UNITS) {
      return WATER_MINIMUM_FEE;
    }
    return WATER_MINIMUM_FEE + (u - WATER_MINIMUM_UNITS) * WATER_RATE_PER_UNIT;
  }

  /**
   * คำนวณค่าไฟฟ้าตามอัตราต่อหน่วย
   */
  calculateElectricFee(units) {
    const u = Math.max(0, Number(units) || 0);
    return u * ELECTRIC_RATE_PER_UNIT;
  }

  /**
   * บันทึกเลขมิเตอร์น้ำหรือไฟประจำรอบบิล
   */
  async recordMeterReading({ roomId, meterType, currentReading, billingCycle, isReset = false }) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      throw new Error(`Room with ID ${roomId} not found`);
    }

    // ดึงข้อมูลมิเตอร์ล่าสุดของห้องนี้
    const lastRecord = await prisma.meterRecord.findFirst({
      where: { roomId, meterType },
      orderBy: { createdAt: 'desc' }
    });

    const previousReading = lastRecord ? Number(lastRecord.currentReading) : 0;
    const unitsUsed = this.calculateUnitsUsed(previousReading, currentReading, isReset);

    const record = await prisma.meterRecord.create({
      data: {
        roomId,
        meterType,
        previousReading,
        currentReading: Number(currentReading),
        unitsUsed,
        billingCycle,
        recordedAt: new Date()
      }
    });

    return record;
  }

  /**
   * คำนวณและสร้างใบแจ้งหนี้ประจำเดือนสำหรับห้องพัก (รองรับ Custom Fees, Waive Common Fee, Other Fees)
   */
  async generateInvoice({
    roomId,
    billingCycle,
    dueDate,
    customWaterTotal,
    customElectricTotal,
    waiveCommonFee = false,
    commonFee,
    otherFee = 0,
    otherFeeNote = ''
  }) {
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: { tenant: true }
    });

    if (!room) {
      throw new Error(`Room with ID ${roomId} not found`);
    }

    if (!room.tenantId || !room.tenant) {
      throw new Error(`Room ${room.roomNumber} has no active tenant assigned`);
    }

    let waterTotal = 0;
    let electricTotal = 0;

    if (customWaterTotal != null) {
      waterTotal = Number(customWaterTotal);
    } else {
      const waterRecord = await prisma.meterRecord.findFirst({
        where: { roomId, meterType: 'water', billingCycle },
        orderBy: { createdAt: 'desc' }
      });
      if (waterRecord) {
        waterTotal = this.calculateWaterFee(waterRecord.unitsUsed);
      }
    }

    if (customElectricTotal != null) {
      electricTotal = Number(customElectricTotal);
    } else {
      const electricRecord = await prisma.meterRecord.findFirst({
        where: { roomId, meterType: 'electric', billingCycle },
        orderBy: { createdAt: 'desc' }
      });
      if (electricRecord) {
        electricTotal = this.calculateElectricFee(electricRecord.unitsUsed);
      }
    }

    const roomPrice = Number(room.price);
    const finalCommonFee = waiveCommonFee ? 0 : (commonFee != null ? Number(commonFee) : DEFAULT_COMMON_FEE);

    // ดึงค่าซ่อมที่ลูกบ้านต้องจ่ายเอง (payer=TENANT) ของห้องนี้ ที่ซ่อมเสร็จแล้วแต่ยังไม่เคยถูกรวมเข้าบิลไหนมาก่อน
    // เพื่อรวมเข้าค่าบริการอื่นๆ ของบิลรอบนี้อัตโนมัติ (กันเรียกเก็บซ้ำด้วยเงื่อนไข billedInvoiceId: null)
    const pendingTenantRepairs = await prisma.maintenanceRequest.findMany({
      where: {
        roomId,
        payer: 'TENANT',
        status: { in: ['resolved', 'completed'] },
        billedInvoiceId: null,
        repairCost: { gt: 0 }
      }
    });
    const pendingRepairTotal = pendingTenantRepairs.reduce((sum, r) => sum + Number(r.repairCost), 0);
    const pendingRepairNote = pendingTenantRepairs
      .map((r) => `ค่าซ่อม: ${r.title} (฿${Number(r.repairCost).toLocaleString()})`)
      .join(', ');

    const finalOtherFee = (Number(otherFee) || 0) + pendingRepairTotal;
    const finalOtherFeeNote = [otherFeeNote, pendingRepairNote].filter(Boolean).join(' | ') || null;

    const formattedCycle = billingCycle.replace('-', '');
    const invoiceNumber = `INV-${formattedCycle}-${room.roomNumber}`;

    // บันทึกใบแจ้งหนี้ในระบบ (Prisma Transaction)
    const invoice = await prisma.$transaction(async (tx) => {
      const existingInvoice = await tx.invoice.findFirst({
        where: { roomId, billingCycle }
      });

      let savedInvoice;

      if (existingInvoice && existingInvoice.status === 'paid') {
        throw new Error(`Invoice for room ${room.roomNumber} in cycle ${billingCycle} has already been paid and locked`);
      }

      if (existingInvoice) {
        const existingLateFee = Number(existingInvoice.lateFeeCharge) || 0;
        const grandTotal = roomPrice + waterTotal + electricTotal + finalCommonFee + finalOtherFee + existingLateFee;

        savedInvoice = await tx.invoice.update({
          where: { id: existingInvoice.id },
          data: {
            roomPrice,
            waterTotal,
            electricTotal,
            commonFee: finalCommonFee,
            otherFee: finalOtherFee,
            otherFeeNote: finalOtherFeeNote,
            grandTotal,
            dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          },
          include: { room: true, tenant: true }
        });
      } else {
        const grandTotal = roomPrice + waterTotal + electricTotal + finalCommonFee + finalOtherFee;

        savedInvoice = await tx.invoice.create({
          data: {
            invoiceNumber,
            roomId,
            tenantId: room.tenantId,
            billingCycle,
            roomPrice,
            waterTotal,
            electricTotal,
            commonFee: finalCommonFee,
            otherFee: finalOtherFee,
            otherFeeNote: finalOtherFeeNote,
            lateFeeCharge: 0.00,
            grandTotal,
            status: 'pending',
            dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          },
          include: { room: true, tenant: true }
        });
      }

      // ปิดสถานะรายการแจ้งซ่อมที่เพิ่งถูกรวมเข้าบิลนี้ กันไม่ให้ไปถูกดึงมารวมซ้ำในบิลรอบถัดไป
      if (pendingTenantRepairs.length > 0) {
        await tx.maintenanceRequest.updateMany({
          where: { id: { in: pendingTenantRepairs.map((r) => r.id) } },
          data: { billedInvoiceId: savedInvoice.id }
        });
      }

      return savedInvoice;
    });

    return invoice;
  }

  /**
   * แก้ไขข้อมูลใบแจ้งหนี้เดิมที่ยังไม่ได้ชำระเงิน
   */
  async updateInvoice(invoiceId, { roomPrice, waterTotal, electricTotal, waiveCommonFee, commonFee, otherFee, otherFeeNote, lateFeeCharge, dueDate, status }) {
    const existingInvoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { room: true, tenant: true }
    });

    if (!existingInvoice) {
      throw new Error('Invoice not found');
    }

    if (existingInvoice.status === 'paid') {
      throw new Error('บิลนี้ได้รับการชำระเงินเรียบร้อยแล้ว ไม่สามารถแก้ไขได้');
    }

    const finalRoomPrice = roomPrice != null ? Number(roomPrice) : Number(existingInvoice.roomPrice);
    const finalWaterTotal = waterTotal != null ? Number(waterTotal) : Number(existingInvoice.waterTotal);
    const finalElectricTotal = electricTotal != null ? Number(electricTotal) : Number(existingInvoice.electricTotal);
    const finalCommonFee = waiveCommonFee ? 0 : (commonFee != null ? Number(commonFee) : Number(existingInvoice.commonFee));
    const finalOtherFee = otherFee != null ? Number(otherFee) : Number(existingInvoice.otherFee);
    const finalOtherFeeNote = otherFeeNote !== undefined ? otherFeeNote : existingInvoice.otherFeeNote;
    const finalLateFee = lateFeeCharge != null ? Number(lateFeeCharge) : Number(existingInvoice.lateFeeCharge || 0);

    const grandTotal = finalRoomPrice + finalWaterTotal + finalElectricTotal + finalCommonFee + finalOtherFee + finalLateFee;

    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        roomPrice: finalRoomPrice,
        waterTotal: finalWaterTotal,
        electricTotal: finalElectricTotal,
        commonFee: finalCommonFee,
        otherFee: finalOtherFee,
        otherFeeNote: finalOtherFeeNote || null,
        lateFeeCharge: finalLateFee,
        grandTotal,
        status: status || existingInvoice.status,
        dueDate: dueDate ? new Date(dueDate) : existingInvoice.dueDate
      },
      include: { room: true, tenant: true }
    });

    return updatedInvoice;
  }

  /**
   * ดึงข้อมูลบิลพร้อม PromptPay QR สำหรับแสดงผลใน LIFF App (ตรวจสิทธิ์เจ้าของบิลถ้ามี lineUserId)
   */
  async getInvoiceForLiff({ id, lineUserId }) {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { room: { include: { building: { include: { setting: true } } } }, tenant: true }
    });

    if (!invoice) {
      const error = new Error('ไม่พบข้อมูลใบแจ้งหนี้');
      error.statusCode = 404;
      throw error;
    }

    // ตรวจสอบสิทธิ์การเข้าถึง: หากมี lineUserId ให้ตรวจสอบว่าเป็นเจ้าของบิลหรือห้องพักนี้จริง
    if (lineUserId) {
      const callerTenant = await prisma.tenant.findUnique({
        where: { lineUserId },
        include: { rooms: true, leaseContracts: { where: { status: 'ACTIVE' }, include: { room: true } } }
      });

      const callerRoomIds = [];
      if (callerTenant?.rooms) callerTenant.rooms.forEach((r) => callerRoomIds.push(r.id));
      if (callerTenant?.leaseContracts) callerTenant.leaseContracts.forEach((c) => callerRoomIds.push(c.roomId));

      const isOwner =
        invoice.tenant?.lineUserId === lineUserId ||
        (callerTenant && invoice.tenantId === callerTenant.id) ||
        callerRoomIds.includes(invoice.roomId);

      if (!isOwner && invoice.tenant?.lineUserId && invoice.tenant.lineUserId !== lineUserId) {
        const error = new Error('ปฏิเสธการเข้าถึง: คุณไม่มีสิทธิ์ดูใบแจ้งหนี้ของผู้อื่น');
        error.statusCode = 403;
        throw error;
      }
    }

    const buildingPromptPay = invoice.room?.building?.setting?.promptpayNum || null;
    const qrData = await lineService.generatePromptPayQr(invoice.grandTotal, buildingPromptPay);

    return { invoice, qrData };
  }

  /**
   * สร้างไฟล์รูปภาพ PromptPay QR Code (PNG Buffer) ของใบแจ้งหนี้โดยตรง
   */
  async getInvoiceQrImage(id) {
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { room: { include: { building: { include: { setting: true } } } } }
    });

    if (!invoice) {
      const error = new Error('ไม่พบข้อมูลใบแจ้งหนี้');
      error.statusCode = 404;
      throw error;
    }

    const buildingPromptPay = invoice.room?.building?.setting?.promptpayNum || null;
    const targetPromptPay = buildingPromptPay || process.env.PROMPTPAY_NUMBER || '0812345678';
    const numAmount = Number(invoice.grandTotal) || 0;

    const generatePayload = require('promptpay-qr');
    const QRCode = require('qrcode');
    const payload = generatePayload(targetPromptPay, { amount: numAmount });
    const buffer = await QRCode.toBuffer(payload, { type: 'png', margin: 2, width: 600 });

    return { buffer, filename: `promptpay-qr-${invoice.invoiceNumber || id}.png` };
  }

  /**
   * รับไฟล์สลิปการโอนเงินจาก LIFF App: ตรวจสิทธิ์เจ้าของบิล -> ตรวจสลิปอัตโนมัติ -> อัปเดตสถานะบิล -> แจ้งเตือน LINE
   */
  async uploadSlipFromLiff({ id, lineUserId, file, declaredAmount, slipUrl }) {
    // Lazy require กัน Circular Dependency กับ slipService (ดูหมายเหตุด้านบนไฟล์)
    const slipService = require('./slipService');

    const invoice = await prisma.invoice.findUnique({ where: { id }, include: { tenant: true, room: true } });

    if (!invoice) {
      const error = new Error('ไม่พบข้อมูลใบแจ้งหนี้');
      error.statusCode = 404;
      throw error;
    }

    if (lineUserId && invoice.tenant?.lineUserId && invoice.tenant.lineUserId !== lineUserId) {
      const callerTenant = await prisma.tenant.findUnique({
        where: { lineUserId },
        include: { rooms: true, leaseContracts: { where: { status: 'ACTIVE' } } }
      });
      const callerRoomIds = (callerTenant?.rooms || []).map((r) => r.id);
      (callerTenant?.leaseContracts || []).forEach((c) => callerRoomIds.push(c.roomId));

      const isOwner = (callerTenant && invoice.tenantId === callerTenant.id) || callerRoomIds.includes(invoice.roomId);

      if (!isOwner) {
        const error = new Error('ปฏิเสธการเข้าถึง: คุณไม่มีสิทธิ์แนบสลิปสำหรับบิลของผู้อื่น');
        error.statusCode = 403;
        throw error;
      }
    }

    // Trigger Auto Slip Verification Engine
    const verification = await slipService.verifyAndProcessSlip(invoice, file, declaredAmount);

    const updateData = { slipUrl, slipHash: verification.fileHash, status: verification.status };
    if (verification.autoApproved) {
      updateData.paidAt = new Date();
    }

    const updatedInvoice = await prisma.invoice.update({ where: { id }, data: updateData, include: { tenant: true, room: true } });

    const recipientLineId = invoice.tenant?.lineUserId || lineUserId;
    if (recipientLineId) {
      if (verification.autoApproved) {
        lineService.sendPaymentSuccessNotification(updatedInvoice).catch((err) => {
          console.warn('⚠️ ไม่สามารถส่ง LINE Payment Success Push Message ได้:', err.message);
        });
      } else {
        await lineService.pushSlipReceivedNotification(recipientLineId, invoice.invoiceNumber);
      }
    }

    return { updatedInvoice, verification };
  }
}

module.exports = new BillingService();
