const { getAllowedBuildingIds } = require('../middlewares/buildingAccessMiddleware');
const billingService = require('../services/billingService');
const lineService = require('../services/lineService');
const { formatBillingCycle } = require('../utils/formatBillingCycle');

class MeterController {
  /**
   * ดึงรายการบันทึกมิเตอร์ตามห้องพักหรือรอบบิล
   */
  async getMeterRecords(req, res, next) {
    try {
      const { roomId, billingCycle, buildingId } = req.query;

      const where = {};
      if (roomId) where.roomId = roomId;
      if (billingCycle) where.billingCycle = billingCycle;
      // buildingId ที่ระบุมาผ่านการตรวจสิทธิ์ที่ route แล้ว ถ้าไม่ระบุ จำกัดเฉพาะตึกที่มีสิทธิ์
      const allowedBuildingIds = await getAllowedBuildingIds(req.user);
      if (buildingId) where.room = { buildingId };
      else if (allowedBuildingIds) where.room = { buildingId: { in: allowedBuildingIds } };

      const records = await billingService.prisma.meterRecord.findMany({
        where,
        orderBy: [{ recordedAt: 'desc' }],
        include: { room: true }
      });

      return res.status(200).json({
        success: true,
        data: records
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * บันทึกข้อมูลมิเตอร์ประจำรอบบิล
   */
  async createMeterRecord(req, res, next) {
    try {
      const { roomId, meterType, currentReading, billingCycle, isReset } = req.body;

      if (!roomId || !meterType || currentReading == null || !billingCycle) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: roomId, meterType, currentReading, and billingCycle'
        });
      }

      const record = await billingService.recordMeterReading({
        roomId,
        meterType,
        currentReading,
        billingCycle,
        isReset
      });

      return res.status(200).json({
        success: true,
        message: 'Meter reading recorded successfully',
        data: record
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  /**
   * ดึงรายชื่อห้องทั้งหมดที่ status = 'occupied' ประจำตึก พร้อมเลขมิเตอร์น้ำและไฟล่าสุด
   */
  async getMetersDraft(req, res, next) {
    try {
      const { buildingId } = req.params;
      const { billingCycle } = req.query;

      if (!buildingId) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาระบุ buildingId'
        });
      }

      const cycle = billingCycle || formatBillingCycle(new Date());
      const { waterRate, electricRate, dueDateDay } = await billingService.getBillingRates(buildingId);
      const commonFee = billingService.DEFAULT_COMMON_FEE;

      const rooms = await billingService.prisma.room.findMany({
        where: { buildingId, status: 'occupied' },
        orderBy: { roomNumber: 'asc' },
        include: { tenant: true }
      });

      const draftRooms = await Promise.all(
        rooms.map(async (room) => {
          const prisma = billingService.prisma;
          const [water, electric] = await Promise.all([
            billingService.getPreviousReading(prisma, room.id, 'water', cycle),
            billingService.getPreviousReading(prisma, room.id, 'electric', cycle)
          ]);

          return {
            roomId: room.id,
            roomNumber: room.roomNumber,
            floor: room.floor,
            roomPrice: Number(room.price),
            tenant: room.tenant
              ? {
                  id: room.tenant.id,
                  firstName: room.tenant.firstName,
                  lastName: room.tenant.lastName,
                  phone: room.tenant.phone
                }
              : null,
            previousWaterReading: water.previousReading,
            previousElectricReading: electric.previousReading
          };
        })
      );

      return res.status(200).json({
        success: true,
        data: {
          buildingId,
          billingCycle: cycle,
          rates: { waterRate, electricRate, commonFee, dueDateDay },
          rooms: draftRooms
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * สร้าง MeterRecord และออก Invoice ร่างสำหรับทุกห้องในตึก
   * - เรียกซ้ำรอบเดิมได้อย่างปลอดภัย: เลขมิเตอร์ของรอบนี้ถูก "แก้ค่าเดิม" ไม่ใช่เพิ่มแถวใหม่ และเลขก่อนหน้าอ้างอิงรอบก่อนเสมอ
   * - บิลที่ไม่ใช่ draft (เผยแพร่/ชำระ/รอตรวจสลิปแล้ว) จะไม่ถูกเขียนทับ ข้ามและรายงานใน skipped
   * - ห้องที่ไม่ได้อยู่ในตึกนี้ / ไม่มีผู้เช่า ถูกข้ามและรายงานเช่นกัน ข้อมูลผิดพลาด (เลขมิเตอร์ต่ำลง ฯลฯ) ปฏิเสธทั้งชุด ไม่บันทึกบางส่วน
   */
  async generateInvoices(req, res, next) {
    try {
      const { buildingId } = req.params;
      const { billingCycle, roomReadings } = req.body;

      if (!buildingId || !billingCycle || !Array.isArray(roomReadings) || roomReadings.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาระบุ buildingId, billingCycle และ roomReadings (Array)'
        });
      }

      const commonFee = req.body.commonFee !== undefined ? Number(req.body.commonFee) : billingService.DEFAULT_COMMON_FEE;
      const isAmount = (v) => v !== '' && v != null && Number.isFinite(Number(v)) && Number(v) >= 0;
      const problems = [];
      if (!isAmount(commonFee)) problems.push('commonFee ต้องเป็นตัวเลขไม่ติดลบ');
      roomReadings.forEach((item, i) => {
        const label = `รายการที่ ${i + 1}`;
        if (!item?.roomId) problems.push(`${label}: ไม่ระบุ roomId`);
        if (!isAmount(item?.currentWaterReading)) problems.push(`${label}: เลขมิเตอร์น้ำไม่ถูกต้อง`);
        if (!isAmount(item?.currentElectricReading)) problems.push(`${label}: เลขมิเตอร์ไฟไม่ถูกต้อง`);
        if (item?.otherFee != null && item.otherFee !== '' && !isAmount(item.otherFee)) problems.push(`${label}: otherFee ไม่ถูกต้อง`);
      });
      if (problems.length > 0) {
        return res.status(400).json({ success: false, message: problems[0], errors: problems });
      }

      const { waterRate, electricRate, dueDateDay } = await billingService.getBillingRates(buildingId);
      const now = new Date();
      const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, dueDateDay);
      const round2 = billingService.round2;

      const { invoices: resultInvoices, skipped } = await billingService.prisma.$transaction(async (tx) => {
        const createdInvoices = [];
        const skippedRooms = [];
        const readingErrors = [];

        for (const item of roomReadings) {
          const { roomId, currentWaterReading, currentElectricReading, otherFee = 0, otherFeeNote = null, reportedRevenue = null } = item;

          // ห้องต้องอยู่ในตึกของ route นี้ (กันส่ง roomId ของตึกอื่นมาปนเพื่อออกบิลข้ามตึก)
          const room = await tx.room.findFirst({ where: { id: roomId, buildingId } });
          if (!room) {
            skippedRooms.push({ roomId, reason: 'ไม่พบห้องนี้ในตึกที่ระบุ' });
            continue;
          }
          if (!room.tenantId) {
            skippedRooms.push({ roomId, roomNumber: room.roomNumber, reason: 'ห้องนี้ไม่มีผู้เช่า' });
            continue;
          }

          const existingInvoice = await tx.invoice.findFirst({ where: { roomId, billingCycle } });
          if (existingInvoice && existingInvoice.status !== 'draft') {
            skippedRooms.push({ roomId, roomNumber: room.roomNumber, reason: `บิลรอบนี้อยู่สถานะ ${existingInvoice.status} แล้ว ไม่เขียนทับ` });
            continue;
          }

          const water = await billingService.getPreviousReading(tx, roomId, 'water', billingCycle);
          const electric = await billingService.getPreviousReading(tx, roomId, 'electric', billingCycle);
          const currentWater = Number(currentWaterReading);
          const currentElectric = Number(currentElectricReading);

          if (currentWater < water.previousReading || currentElectric < electric.previousReading) {
            readingErrors.push(
              `ห้อง ${room.roomNumber}: เลขมิเตอร์ปัจจุบันต่ำกว่าเลขก่อนหน้า (น้ำ ${water.previousReading}, ไฟ ${electric.previousReading})`
            );
            continue;
          }

          const waterUnits = currentWater - water.previousReading;
          const electricUnits = currentElectric - electric.previousReading;
          const waterTotal = billingService.calculateWaterFee(waterUnits, waterRate);
          const electricTotal = billingService.calculateElectricFee(electricUnits, electricRate);

          let roomPrice = Number(room.price);
          let extraFee = Number(otherFee || 0);
          let extraFeeNote = otherFeeNote;

          if (room.billingModel === 'revenue_share' && room.revSharePercent && reportedRevenue != null) {
            extraFee = round2((Number(reportedRevenue) * Number(room.revSharePercent)) / 100);
            extraFeeNote = `ส่วนแบ่งยอดขาย ${Number(room.revSharePercent)}% (ยอดขาย ฿${Number(reportedRevenue).toLocaleString()})`;
            roomPrice = 0;
          }

          // ค่าซ่อมที่ผู้เช่าต้องจ่ายเอง (รวมที่เคยรวมเข้าบิลนี้แล้ว) — flow เดียวกับ billingService.generateInvoice
          const repairs = await billingService.collectRepairCharges(tx, roomId, existingInvoice?.id);
          extraFee = round2(extraFee + repairs.total);
          extraFeeNote = [extraFeeNote, repairs.note].filter(Boolean).join(' | ') || null;

          const lateFee = Number(existingInvoice?.lateFeeCharge) || 0;
          const grandTotal = round2(roomPrice + waterTotal + electricTotal + commonFee + extraFee + lateFee);

          // หนึ่งรอบ = หนึ่ง record ต่อห้อง/ชนิดมิเตอร์ (มีอยู่แล้วให้แก้ค่า ไม่เพิ่มแถวใหม่)
          for (const [meterType, reading, current, units] of [
            ['water', water, currentWater, waterUnits],
            ['electric', electric, currentElectric, electricUnits]
          ]) {
            const readingData = { previousReading: reading.previousReading, currentReading: current, unitsUsed: units };
            if (reading.thisCycle) {
              await tx.meterRecord.update({ where: { id: reading.thisCycle.id }, data: readingData });
            } else {
              await tx.meterRecord.create({ data: { roomId, meterType, billingCycle, recordedAt: new Date(), ...readingData } });
            }
          }

          const invoiceData = {
            roomPrice,
            waterTotal,
            electricTotal,
            commonFee,
            otherFee: extraFee,
            otherFeeNote: extraFeeNote,
            grandTotal,
            status: 'draft',
            dueDate
          };
          const invoice = existingInvoice
            ? await tx.invoice.update({ where: { id: existingInvoice.id }, data: invoiceData, include: { room: true, tenant: true } })
            : await tx.invoice.create({
                data: { invoiceNumber: billingService.makeInvoiceNumber(room, billingCycle), roomId, tenantId: room.tenantId, billingCycle, ...invoiceData },
                include: { room: true, tenant: true }
              });

          if (repairs.unbilledIds.length > 0) {
            await tx.maintenanceRequest.updateMany({ where: { id: { in: repairs.unbilledIds } }, data: { billedInvoiceId: invoice.id } });
          }

          createdInvoices.push(invoice);
        }

        if (readingErrors.length > 0) {
          const error = new Error(readingErrors[0]);
          error.statusCode = 400;
          error.data = readingErrors;
          throw error; // rollback ทั้งชุด ไม่บันทึกบางส่วน
        }

        return { invoices: createdInvoices, skipped: skippedRooms };
      });

      return res.status(201).json({
        success: true,
        message: `ออกบิลแบบ Draft สำเร็จจำนวน ${resultInvoices.length} ห้องพัก${skipped.length ? ` (ข้าม ${skipped.length} ห้อง)` : ''}`,
        data: resultInvoices,
        skipped
      });
    } catch (error) {
      // ออกบิลรอบ/ห้องเดียวกันพร้อมกัน: ตัวที่แพ้ชน Unique ของเลขบิล ให้ลองใหม่ (ตัวที่ชนะเก็บบิลไว้แล้ว)
      if (error.code === 'P2002') {
        return res.status(409).json({ success: false, message: 'มีการออกบิลรอบนี้พร้อมกัน กรุณาลองใหม่อีกครั้ง' });
      }
      next(error);
    }
  }

  /**
   * ยืนยันการส่งออกบิล (เปลี่ยนสถานะ draft เป็น pending และส่ง LINE แจ้งเตือน)
   */
  async publishInvoices(req, res, next) {
    try {
      const { buildingId } = req.params;
      const { billingCycle, invoiceIds } = req.body;

      const whereClause = {
        status: 'draft',
        room: { buildingId }
      };

      if (billingCycle) whereClause.billingCycle = billingCycle;
      if (Array.isArray(invoiceIds) && invoiceIds.length > 0) {
        whereClause.id = { in: invoiceIds };
      }

      const draftInvoices = await billingService.prisma.invoice.findMany({
        where: whereClause,
        include: { room: true, tenant: true }
      });

      if (draftInvoices.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'ไม่พบบิลสถานะ Draft ที่ต้องการยืนยันและส่งแจ้งเตือน'
        });
      }

      let publishedCount = 0;
      let lineNotifiedCount = 0;

      for (const invoice of draftInvoices) {
        const updated = await billingService.prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: 'pending' },
          include: { room: true, tenant: true }
        });
        publishedCount++;

        if (updated.tenant?.lineUserId) {
          const sent = await lineService.sendInvoiceNotification(updated);
          if (sent) lineNotifiedCount++;
        }
      }

      return res.status(200).json({
        success: true,
        message: `ยืนยันบิลค่าเช่าสำเร็จจำนวน ${publishedCount} ใบ (ส่งแจ้งเตือนผ่าน LINE ${lineNotifiedCount} ราย)`,
        data: { publishedCount, lineNotifiedCount }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new MeterController();
