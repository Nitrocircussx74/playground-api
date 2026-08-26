const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
   * คำนวณและสร้างใบแจ้งหนี้ประจำเดือนสำหรับห้องพัก
   */
  async generateInvoice({ roomId, billingCycle, dueDate }) {
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

    // ดึงมิเตอร์น้ำและไฟประจำรอบบิล
    const waterRecord = await prisma.meterRecord.findFirst({
      where: { roomId, meterType: 'water', billingCycle },
      orderBy: { createdAt: 'desc' }
    });

    const electricRecord = await prisma.meterRecord.findFirst({
      where: { roomId, meterType: 'electric', billingCycle },
      orderBy: { createdAt: 'desc' }
    });

    if (!waterRecord || !electricRecord) {
      throw new Error(`Meter readings for water and electric in billing cycle ${billingCycle} are required before generating invoice`);
    }

    const roomPrice = Number(room.price);
    const waterTotal = this.calculateWaterFee(waterRecord.unitsUsed);
    const electricTotal = this.calculateElectricFee(electricRecord.unitsUsed);
    const commonFee = DEFAULT_COMMON_FEE;
    const grandTotal = roomPrice + waterTotal + electricTotal + commonFee;

    const formattedCycle = billingCycle.replace('-', '');
    const invoiceNumber = `INV-${formattedCycle}-${room.roomNumber}`;

    // บันทึกใบแจ้งหนี้ในระบบ (Prisma Transaction)
    const invoice = await prisma.$transaction(async (tx) => {
      const existingInvoice = await tx.invoice.findFirst({
        where: { roomId, billingCycle }
      });

      if (existingInvoice && existingInvoice.status === 'paid') {
        throw new Error(`Invoice for room ${room.roomNumber} in cycle ${billingCycle} has already been paid and locked`);
      }

      if (existingInvoice) {
        return await tx.invoice.update({
          where: { id: existingInvoice.id },
          data: {
            roomPrice,
            waterTotal,
            electricTotal,
            commonFee,
            grandTotal,
            dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          }
        });
      }

      return await tx.invoice.create({
        data: {
          invoiceNumber,
          roomId,
          tenantId: room.tenantId,
          billingCycle,
          roomPrice,
          waterTotal,
          electricTotal,
          commonFee,
          grandTotal,
          status: 'pending',
          dueDate: dueDate ? new Date(dueDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      });
    });

    return invoice;
  }
}

module.exports = new BillingService();
