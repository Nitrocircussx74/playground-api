const prisma = require('../config/prisma');
const lineService = require('./lineService');
// หมายเหตุ: require('./slipService') แบบ Lazy (ในเมธอดที่ใช้) แทนการ require ที่ Top-level ของไฟล์
// เพราะ slipService.js เองก็ require('./billingService') อยู่แล้ว — ถ้า require กันตรงๆ ที่ Top-level
// ทั้งคู่จะเกิด Circular Dependency กันเข้ารอบ ทำให้ module.exports ฝั่งใดฝั่งหนึ่งได้ Object ที่โหลดไม่ครบ
// (ขึ้นกับลำดับการโหลด) require แบบ Lazy ข้างในฟังก์ชันจะปลอดภัยเพราะถูกเรียกตอน Runtime ที่ทุกโมดูลโหลดเสร็จแล้ว

// ค่าสำรองเมื่อตึกยังไม่มีแถว BuildingSetting (เท่ากับ @default ใน schema) — อัตราจริงอ่านจาก BuildingSetting เสมอ
const DEFAULT_WATER_RATE = 18.0;
const DEFAULT_ELECTRIC_RATE = 7.0;
const DEFAULT_COMMON_FEE = 100.0;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * วันครบกำหนดของรอบบิล "MM-YYYY" = วันที่ dueDateDay ของเดือนถัดจากรอบบิล (ไม่ผูกกับวันที่กดออกบิล)
 * ถ้าเดือนนั้นสั้นกว่า dueDateDay (เช่น 31 ในเดือนกุมภาพันธ์) ใช้วันสุดท้ายของเดือน
 */
const dueDateForCycle = (billingCycle, dueDateDay) => {
  const [m, y] = String(billingCycle).split('-').map(Number);
  const lastDay = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(dueDateDay, lastDay));
};

class BillingService {
  constructor() {
    this.prisma = prisma;
    this.DEFAULT_COMMON_FEE = DEFAULT_COMMON_FEE;
    this.round2 = round2;
    this.dueDateForCycle = dueDateForCycle;
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
   * อัตราค่าน้ำ/ไฟและวันครบกำหนดของตึก จาก BuildingSetting (แหล่งเดียวของทุก flow การออกบิล)
   * ใช้ ?? ไม่ใช่ || เพราะอัตรา 0 (ฟรี) เป็นค่าที่ถูกต้อง
   */
  async getBillingRates(buildingId, db = prisma) {
    const setting = buildingId ? await db.buildingSetting.findUnique({ where: { buildingId } }) : null;
    return {
      waterRate: Number(setting?.waterRate ?? DEFAULT_WATER_RATE),
      electricRate: Number(setting?.electricRate ?? DEFAULT_ELECTRIC_RATE),
      dueDateDay: setting?.dueDateDay || 5
    };
  }

  /** ค่าน้ำ = หน่วยที่ใช้ x อัตราต่อหน่วยของตึก (ไม่มีขั้นต่ำ ตามการตั้งค่าตึก) */
  calculateWaterFee(units, waterRate = DEFAULT_WATER_RATE) {
    return round2(Math.max(0, Number(units) || 0) * waterRate);
  }

  /** ค่าไฟ = หน่วยที่ใช้ x อัตราต่อหน่วยของตึก */
  calculateElectricFee(units, electricRate = DEFAULT_ELECTRIC_RATE) {
    return round2(Math.max(0, Number(units) || 0) * electricRate);
  }

  /**
   * เลขบิลที่ไม่ซ้ำข้ามตึก: เลขห้องซ้ำกันได้ระหว่างตึก (unique เฉพาะ roomNumber+buildingId)
   * จึงต้องมีรหัสสั้นของตึกอยู่ในเลขบิลด้วย
   */
  makeInvoiceNumber(room, billingCycle) {
    const buildingPart = String(room.buildingId || 'NA').replace(/-/g, '').slice(0, 6).toUpperCase();
    return `INV-${billingCycle.replace('-', '')}-${buildingPart}-${room.roomNumber}`;
  }

  /**
   * เลขมิเตอร์ "ก่อนหน้า" ของรอบบิลนี้ = record ล่าสุดของรอบอื่น (ไม่นับรอบที่กำลังออกบิล)
   * เดิมใช้ record ล่าสุดของห้องโดยไม่แยกรอบ ทำให้ออกบิลรอบเดิมซ้ำแล้วหน่วยที่ใช้กลายเป็น 0
   * ถ้ารอบนี้เคยมี record แล้ว จะอ้างอิงเฉพาะ record ที่บันทึกก่อนหน้ารอบนี้
   */
  async getPreviousReading(db, roomId, meterType, billingCycle) {
    const thisCycle = await db.meterRecord.findFirst({ where: { roomId, meterType, billingCycle } });
    const previous = await db.meterRecord.findFirst({
      where: {
        roomId,
        meterType,
        billingCycle: { not: billingCycle },
        ...(thisCycle && { recordedAt: { lt: thisCycle.recordedAt } })
      },
      orderBy: { recordedAt: 'desc' }
    });

    // มิเตอร์จริงไม่รีเซ็ตเมื่อเปลี่ยนผู้เช่า: ถ้า record ล่าสุดเป็นของช่วงก่อนสัญญาปัจจุบันเริ่ม (ผู้เช่าเก่า/ช่วงห้องว่าง)
    // ให้เริ่มนับจากเลขที่จดไว้ ณ วันที่ผู้เช่าใหม่เข้าพัก (ถ้าจดไว้) ไม่งั้นผู้เช่าใหม่ถูกคิดหน่วยของคนก่อน
    const lease = await db.leaseContract.findFirst({ where: { roomId, status: 'ACTIVE' }, orderBy: { startDate: 'desc' } });
    const initial = meterType === 'water' ? lease?.initialWaterReading : lease?.initialElectricReading;
    if (initial != null && (!previous || previous.recordedAt <= lease.startDate)) {
      return { previousReading: Number(initial), thisCycle };
    }
    return { previousReading: previous ? Number(previous.currentReading) : 0, thisCycle };
  }

  /**
   * ค่าซ่อมที่ผู้เช่าต้องจ่ายเอง (payer=TENANT) ที่ซ่อมเสร็จแล้ว: ที่ยังไม่เคยเรียกเก็บ + ที่เรียกเก็บกับบิลนี้อยู่แล้ว
   * (ต้องนับกลุ่มหลังด้วย ไม่งั้นออกบิลซ้ำแล้วค่าซ่อมหายจากยอดทั้งที่ยังถูกมาร์กว่าเรียกเก็บแล้ว)
   * unbilledIds = รายการที่ต้องมาร์ก billedInvoiceId หลังบันทึกบิล
   */
  async collectRepairCharges(db, roomId, invoiceId = null) {
    const repairs = await db.maintenanceRequest.findMany({
      where: {
        roomId,
        payer: 'TENANT',
        status: { in: ['resolved', 'completed'] },
        repairCost: { gt: 0 },
        OR: [{ billedInvoiceId: null }, ...(invoiceId ? [{ billedInvoiceId: invoiceId }] : [])]
      }
    });
    return {
      total: repairs.reduce((sum, r) => sum + Number(r.repairCost), 0),
      note: repairs.map((r) => `ค่าซ่อม: ${r.title} (฿${Number(r.repairCost).toLocaleString()})`).join(', '),
      unbilledIds: repairs.filter((r) => !r.billedInvoiceId).map((r) => r.id)
    };
  }

  /**
   * บันทึกเลขมิเตอร์น้ำหรือไฟประจำรอบบิล
   */
  async recordMeterReading({ roomId, meterType, currentReading, billingCycle, isReset = false }) {
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      throw new Error(`Room with ID ${roomId} not found`);
    }

    const { previousReading, thisCycle } = await this.getPreviousReading(prisma, roomId, meterType, billingCycle);
    const unitsUsed = this.calculateUnitsUsed(previousReading, currentReading, isReset);
    const readingData = { previousReading, currentReading: Number(currentReading), unitsUsed };

    const record = thisCycle
      ? await prisma.meterRecord.update({ where: { id: thisCycle.id }, data: readingData })
      : await prisma.meterRecord.create({ data: { roomId, meterType, billingCycle, recordedAt: new Date(), ...readingData } });

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

    const { waterRate, electricRate, dueDateDay } = await this.getBillingRates(room.buildingId);

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
        waterTotal = this.calculateWaterFee(waterRecord.unitsUsed, waterRate);
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
        electricTotal = this.calculateElectricFee(electricRecord.unitsUsed, electricRate);
      }
    }

    const roomPrice = Number(room.price);
    const finalCommonFee = waiveCommonFee ? 0 : (commonFee != null ? Number(commonFee) : DEFAULT_COMMON_FEE);
    const invoiceNumber = this.makeInvoiceNumber(room, billingCycle);

    // บันทึกใบแจ้งหนี้ในระบบ (Prisma Transaction)
    let invoice;
    try {
      invoice = await prisma.$transaction(async (tx) => {
        const existingInvoice = await tx.invoice.findFirst({
          where: { roomId, billingCycle }
        });

        if (existingInvoice && existingInvoice.status === 'paid') {
          throw new Error(`Invoice for room ${room.roomNumber} in cycle ${billingCycle} has already been paid and locked`);
        }

        // ค่าซ่อมที่ต้องเรียกเก็บ (รวมที่เคยรวมเข้าบิลนี้ไว้แล้ว กันหายเมื่อออกบิลซ้ำ) คิดใน Transaction เดียวกับบิล
        const repairs = await this.collectRepairCharges(tx, roomId, existingInvoice?.id);
        const finalOtherFee = (Number(otherFee) || 0) + repairs.total;
        const finalOtherFeeNote = [otherFeeNote, repairs.note].filter(Boolean).join(' | ') || null;
        const finalDueDate = dueDate ? new Date(dueDate) : dueDateForCycle(billingCycle, dueDateDay);

        let savedInvoice;

        if (existingInvoice) {
          const existingLateFee = Number(existingInvoice.lateFeeCharge) || 0;
          const grandTotal = round2(roomPrice + waterTotal + electricTotal + finalCommonFee + finalOtherFee + existingLateFee);

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
              dueDate: finalDueDate
            },
            include: { room: true, tenant: true }
          });
        } else {
          const grandTotal = round2(roomPrice + waterTotal + electricTotal + finalCommonFee + finalOtherFee);

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
              dueDate: finalDueDate
            },
            include: { room: true, tenant: true }
          });
        }

        // มาร์กค่าซ่อมที่เพิ่งรวมเข้าบิลนี้ กันไม่ให้ถูกดึงไปรวมซ้ำในบิลรอบถัดไป
        if (repairs.unbilledIds.length > 0) {
          await tx.maintenanceRequest.updateMany({
            where: { id: { in: repairs.unbilledIds } },
            data: { billedInvoiceId: savedInvoice.id }
          });
        }

        return savedInvoice;
      });
    } catch (error) {
      // Race Condition: 2 Request สร้างบิลรอบ/ห้องเดียวกันพร้อมกัน ตัวที่แพ้ชน Unique Constraint ของ invoiceNumber
      // ถือว่า "สร้างสำเร็จ" เหมือนกัน คืนบิลที่ถูกสร้างไปแล้วแทนที่จะโยน Error ดิบให้ผู้ใช้เจอ 500
      if (error.code === 'P2002') {
        invoice = await prisma.invoice.findFirst({
          where: { roomId, billingCycle },
          include: { room: true, tenant: true }
        });
        if (!invoice) throw error;
      } else {
        throw error;
      }
    }

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

      if (!isOwner && (invoice.tenantId || invoice.tenant?.lineUserId)) {
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

    if (invoice.status === 'paid') {
      const error = new Error('บิลนี้ชำระเงินเรียบร้อยแล้ว ไม่สามารถแนบสลิปเพิ่มได้');
      error.statusCode = 409;
      throw error;
    }

    if (lineUserId) {
      const callerTenant = await prisma.tenant.findUnique({
        where: { lineUserId },
        include: { rooms: true, leaseContracts: { where: { status: 'ACTIVE' } } }
      });
      const callerRoomIds = (callerTenant?.rooms || []).map((r) => r.id);
      (callerTenant?.leaseContracts || []).forEach((c) => callerRoomIds.push(c.roomId));

      const isOwner =
        invoice.tenant?.lineUserId === lineUserId ||
        (callerTenant && invoice.tenantId === callerTenant.id) ||
        callerRoomIds.includes(invoice.roomId);

      if (!isOwner && (invoice.tenantId || invoice.tenant?.lineUserId)) {
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
