const billingService = require('../services/billingService');
const lineService = require('../services/lineService');

class MeterInvoiceController {
  /**
   * GET /api/admin/buildings/:buildingId/meters/draft
   * ดึงรายชื่อห้องทั้งหมดที่ status = 'occupied' ประจำตึก
   * พร้อมเลขมิเตอร์น้ำและไฟของเดือนล่าสุด (Previous Reading)
   * และเรทค่าน้ำค่าไฟจาก BuildingSetting
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

      // 1. ดึง BuildingSetting ของตึก
      const setting = await billingService.prisma.buildingSetting.findUnique({
        where: { buildingId }
      });

      const waterRate = Number(setting?.waterRate || 18.0);
      const electricRate = Number(setting?.electricRate || 7.0);
      const commonFee = 100.0;
      const dueDateDay = setting?.dueDateDay || 5;

      // 2. ดึงรายการห้องพัก occupied ในตึกนี้
      const rooms = await billingService.prisma.room.findMany({
        where: {
          buildingId,
          status: 'occupied'
        },
        orderBy: { roomNumber: 'asc' },
        include: {
          tenant: true
        }
      });

      // 3. สำหรับแต่ละห้อง ค้นหาเลขมิเตอร์ย้อนหลังล่าสุด (previous reading)
      const draftRooms = await Promise.all(
        rooms.map(async (room) => {
          const lastWater = await billingService.prisma.meterRecord.findFirst({
            where: { roomId: room.id, meterType: 'water' },
            orderBy: { recordedAt: 'desc' }
          });

          const lastElectric = await billingService.prisma.meterRecord.findFirst({
            where: { roomId: room.id, meterType: 'electric' },
            orderBy: { recordedAt: 'desc' }
          });

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
            previousWaterReading: lastWater ? Number(lastWater.currentReading) : 0,
            previousElectricReading: lastElectric ? Number(lastElectric.currentReading) : 0
          };
        })
      );

      return res.status(200).json({
        success: true,
        data: {
          buildingId,
          billingCycle: billingCycle || `${String(new Date().getMonth() + 1).padStart(2, '0')}-${new Date().getFullYear()}`,
          rates: {
            waterRate,
            electricRate,
            commonFee,
            dueDateDay
          },
          rooms: draftRooms
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/buildings/:buildingId/invoices/generate
   * รับ Payload เป็น Array ของข้อมูลมิเตอร์ทุกห้องที่แอดมินคีย์เสร็จ
   * ใช้ Prisma Transaction ทำ 2 อย่าง:
   * 1. สร้าง MeterRecord ของเดือนใหม่ (ทั้งน้ำและไฟ)
   * 2. คำนวณค่าน้ำ ค่าไฟ นำไปบวกราคาห้อง และสร้าง Invoice สถานะ 'draft'
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

      // ดึง BuildingSetting เพื่อนำอัตราค่าน้ำ ค่าไฟ วันครบกำหนดชำระมาคำนวณ
      const setting = await billingService.prisma.buildingSetting.findUnique({
        where: { buildingId }
      });

      const waterRate = Number(setting?.waterRate || 18.0);
      const electricRate = Number(setting?.electricRate || 7.0);
      const commonFee = req.body.commonFee !== undefined ? Number(req.body.commonFee) : 100.0;
      const dueDateDay = setting?.dueDateDay || 5;

      // คำนวณ Due Date (เช่น วันที่ dueDateDay ของเดือนถัดไป)
      const now = new Date();
      const dueDate = new Date(now.getFullYear(), now.getMonth() + 1, dueDateDay);

      // รัน Prisma Transaction เพื่อรับประกัน Atomicity & Consistency
      const resultInvoices = await billingService.prisma.$transaction(async (tx) => {
        const createdInvoices = [];

        for (const item of roomReadings) {
          const {
            roomId,
            currentWaterReading,
            currentElectricReading,
            otherFee = 0,
            otherFeeNote = null
          } = item;

          // 1. ดึงข้อมูลห้องพักและผู้เช่า
          const room = await tx.room.findUnique({
            where: { id: roomId },
            include: { tenant: true }
          });

          if (!room || !room.tenantId) {
            continue; // ข้ามห้องที่ไม่มีผู้เช่า
          }

          // 2. ดึงเลขมิเตอร์เก่าล่าสุด
          const lastWater = await tx.meterRecord.findFirst({
            where: { roomId, meterType: 'water' },
            orderBy: { recordedAt: 'desc' }
          });
          const lastElectric = await tx.meterRecord.findFirst({
            where: { roomId, meterType: 'electric' },
            orderBy: { recordedAt: 'desc' }
          });

          const prevWater = lastWater ? Number(lastWater.currentReading) : 0;
          const prevElectric = lastElectric ? Number(lastElectric.currentReading) : 0;

          const waterUnits = Math.max(0, Number(currentWaterReading) - prevWater);
          const electricUnits = Math.max(0, Number(currentElectricReading) - prevElectric);

          const waterTotal = Number((waterUnits * waterRate).toFixed(2));
          const electricTotal = Number((electricUnits * electricRate).toFixed(2));
          const roomPrice = Number(room.price);
          const extraFee = Number(otherFee || 0);

          const grandTotal = Number((roomPrice + waterTotal + electricTotal + commonFee + extraFee).toFixed(2));

          const recordedAt = new Date();

          // 3. บันทึก MeterRecord (น้ำ)
          await tx.meterRecord.create({
            data: {
              roomId,
              meterType: 'water',
              previousReading: prevWater,
              currentReading: Number(currentWaterReading),
              unitsUsed: waterUnits,
              billingCycle,
              recordedAt
            }
          });

          // 4. บันทึก MeterRecord (ไฟ)
          await tx.meterRecord.create({
            data: {
              roomId,
              meterType: 'electric',
              previousReading: prevElectric,
              currentReading: Number(currentElectricReading),
              unitsUsed: electricUnits,
              billingCycle,
              recordedAt
            }
          });

          // 5. ออก Invoice (สถานะ draft)
          const cycleClean = billingCycle.replace('-', '');
          const invoiceNumber = `INV-${cycleClean}-${room.roomNumber}`;

          // หากมี Invoice ในรอบบิลนี้แล้ว ให้อัปเดต หรือสร้างใหม่
          const existingInvoice = await tx.invoice.findFirst({
            where: { roomId, billingCycle }
          });

          let invoice;
          if (existingInvoice) {
            invoice = await tx.invoice.update({
              where: { id: existingInvoice.id },
              data: {
                roomPrice,
                waterTotal,
                electricTotal,
                commonFee,
                otherFee: extraFee,
                otherFeeNote,
                grandTotal,
                status: 'draft',
                dueDate
              },
              include: { room: true, tenant: true }
            });
          } else {
            invoice = await tx.invoice.create({
              data: {
                invoiceNumber,
                roomId,
                tenantId: room.tenantId,
                billingCycle,
                roomPrice,
                waterTotal,
                electricTotal,
                commonFee,
                otherFee: extraFee,
                otherFeeNote,
                grandTotal,
                status: 'draft',
                dueDate
              },
              include: { room: true, tenant: true }
            });
          }

          createdInvoices.push(invoice);
        }

        return createdInvoices;
      });

      return res.status(201).json({
        success: true,
        message: `ออกบิลแบบ Draft สำเร็จจำนวน ${resultInvoices.length} ห้องพัก`,
        data: resultInvoices
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/admin/buildings/:buildingId/invoices/publish
   * ยืนยันการส่งออกบิล: เปลี่ยนสถานะจาก draft เป็น pending
   * และเรียกใช้ฟังก์ชันส่ง LINE Flex Message แจ้งเตือนลูกบ้าน
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

      // ดึงบิลร่างที่เข้าเงื่อนไข
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
        // อัปเดตสถานะบิลเป็น pending
        const updated = await billingService.prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: 'pending' },
          include: { room: true, tenant: true }
        });
        publishedCount++;

        // ส่ง LINE Flex Message แจ้งเตือนบิล
        if (updated.tenant?.lineUserId) {
          const sent = await lineService.sendInvoiceNotification(updated);
          if (sent) lineNotifiedCount++;
        }
      }

      return res.status(200).json({
        success: true,
        message: `ยืนยันบิลค่าเช่าสำเร็จจำนวน ${publishedCount} ใบ (ส่งแจ้งเตือนผ่าน LINE ${lineNotifiedCount} ราย)`,
        data: {
          publishedCount,
          lineNotifiedCount
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new MeterInvoiceController();
