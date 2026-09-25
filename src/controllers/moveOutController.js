const billingService = require('../services/billingService');
const auditService = require('../services/auditService');
const { releaseRoomTenancy } = require('../services/tenancyService');

const UNPAID_STATUSES = ['pending', 'overdue', 'reviewing'];
const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

/** เลขมิเตอร์ที่ส่งมา: ว่าง = ใช้เลขเดิม, ต้องเป็นตัวเลข >= 0 และไม่ต่ำกว่าเลขเดิม (ห้าม NaN/ติดลบเงียบ ๆ แล้วคิดเป็น 0 หน่วย) */
const parseFinalReading = (raw, oldReading, label) => {
  if (raw === undefined || raw === null || raw === '') return oldReading;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw badRequest(`เลขมิเตอร์${label}ไม่ถูกต้อง`);
  if (value < oldReading) throw badRequest(`เลขมิเตอร์${label}ล่าสุด (${value}) ต่ำกว่าเลขเดิม (${oldReading})`);
  return value;
};

/**
 * ค่าน้ำไฟรอบสุดท้าย + บิลค้างของห้อง ใช้ร่วมกันทั้งพรีวิวและตอนบันทึกจริง (เดิมคำนวณซ้ำสองที่และ hardcode อัตรา 18/7)
 * อัตราจาก BuildingSetting ผ่าน getBillingRates เหมือนการออกบิล (อัตรา 0 = ฟรี ต้องไม่กลายเป็นค่าเริ่มต้น)
 */
async function calcFinalSettlement(db, lease, { finalWater, finalElectric }) {
  const room = lease.room;
  const { waterRate, electricRate } = await billingService.getBillingRates(room?.buildingId, db);
  const latest = (type) => room?.meterRecords.find((m) => m.meterType === type);
  const oldWater = latest('water') ? Number(latest('water').currentReading) : 0;
  const oldElectric = latest('electric') ? Number(latest('electric').currentReading) : 0;
  const newWater = parseFinalReading(finalWater, oldWater, 'น้ำ');
  const newElectric = parseFinalReading(finalElectric, oldElectric, 'ไฟ');

  const round2 = billingService.round2;
  const unpaidInvoices = room?.invoices || [];
  return {
    oldWater,
    newWater,
    waterUsage: newWater - oldWater,
    waterRate,
    finalWaterTotal: round2((newWater - oldWater) * waterRate),
    oldElectric,
    newElectric,
    electricUsage: newElectric - oldElectric,
    electricRate,
    finalElectricTotal: round2((newElectric - oldElectric) * electricRate),
    unpaidInvoices,
    unpaidInvoicesTotal: round2(unpaidInvoices.reduce((acc, inv) => acc + Number(inv.grandTotal || 0), 0))
  };
}

class MoveOutController {
  /**
   * จำลองคำนวณเงินมัดจำ ค่าน้ำไฟรอบสุดท้าย บิลค้างชำระ และรายการหักเงิน
   * GET /api/admin/leases/:id/move-out-calculation
   */
  async getMoveOutCalculation(req, res, next) {
    try {
      const { id: leaseId } = req.params;
      const { finalWater, finalElectric } = req.query;

      const lease = await billingService.prisma.leaseContract.findUnique({
        where: { id: leaseId },
        include: {
          room: {
            include: {
              building: { include: { setting: true } },
              meterRecords: { orderBy: { recordedAt: 'desc' }, take: 10 },
              invoices: { where: { status: { in: UNPAID_STATUSES } } }
            }
          },
          tenant: true
        }
      });

      if (!lease) {
        return res.status(404).json({ success: false, message: 'ไม่พบสัญญาเช่าที่ระบุ' });
      }

      const settlement = await calcFinalSettlement(billingService.prisma, lease, { finalWater, finalElectric });
      const depositAmount = Number(lease.depositAmount || 0);

      return res.status(200).json({
        success: true,
        data: {
          lease,
          depositAmount,
          ...settlement
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ดำเนินการแจ้งย้ายออกและคำนวณคืนเงินมัดจำสุทธิด้วย Prisma Transaction ($transaction)
   * POST /api/admin/leases/:id/process-move-out
   */
  async processMoveOut(req, res, next) {
    try {
      const { id: leaseId } = req.params;
      const {
        moveOutDate,
        finalWaterMeter,
        finalElectricMeter,
        damageCharges,
        adminNote,
        moveOutReason
      } = req.body;

      const existingLease = await billingService.prisma.leaseContract.findUnique({
        where: { id: leaseId },
        include: { room: true }
      });

      if (!existingLease) {
        return res.status(404).json({ success: false, message: 'ไม่พบสัญญาเช่าที่ระบุ' });
      }

      if (existingLease.status === 'ENDED') {
        return res.status(400).json({ success: false, message: 'สัญญาเช่านี้ได้รับการแจ้งย้ายออกไปแล้ว' });
      }

      const moveOutAt = new Date(moveOutDate || Date.now());
      if (Number.isNaN(moveOutAt.getTime())) {
        throw badRequest('วันที่ย้ายออกไม่ถูกต้อง');
      }
      const damageChargesArr = Array.isArray(damageCharges) ? damageCharges : [];
      if (damageChargesArr.some((item) => !Number.isFinite(Number(item?.amount || 0)) || Number(item?.amount || 0) < 0)) {
        throw badRequest('จำนวนเงินค่าเสียหายไม่ถูกต้อง');
      }

      // Execute Prisma Transaction
      const [updatedLease, moveOutRecord, updatedRoom] = await billingService.prisma.$transaction(async (tx) => {
        // 1. Update LeaseContract status = ENDED (เงื่อนไข status != ENDED อยู่ในคำสั่งเดียวกัน กันกดซ้ำพร้อมกันแล้วได้ MoveOutRecord สองใบ)
        const { count } = await tx.leaseContract.updateMany({
          where: { id: leaseId, status: { not: 'ENDED' } },
          data: {
            status: 'ENDED',
            actualEndDate: moveOutAt,
            moveOutReason: moveOutReason ? moveOutReason.trim() : null,
            adminNote: adminNote ? adminNote.trim() : existingLease.adminNote
          }
        });
        if (count === 0) {
          throw Object.assign(new Error('สัญญาเช่านี้ได้รับการแจ้งย้ายออกไปแล้ว'), { statusCode: 409 });
        }
        const lease = await tx.leaseContract.findUnique({
          where: { id: leaseId },
          include: {
            room: {
              include: {
                building: { include: { setting: true } },
                meterRecords: { orderBy: { recordedAt: 'desc' }, take: 10 },
                invoices: { where: { status: { in: UNPAID_STATUSES } } }
              }
            },
            tenant: true
          }
        });

        // Calculate breakdown inside transaction
        const settlement = await calcFinalSettlement(tx, lease, { finalWater: finalWaterMeter, finalElectric: finalElectricMeter });
        const { newWater: newW, newElectric: newE, finalWaterTotal, finalElectricTotal, unpaidInvoices, unpaidInvoicesTotal } = settlement;

        const round2 = billingService.round2;
        const damageTotal = round2(damageChargesArr.reduce((acc, item) => acc + Number(item.amount || 0), 0));

        const depositAmount = Number(lease.depositAmount || 0);
        const totalDeductions = round2(finalWaterTotal + finalElectricTotal + unpaidInvoicesTotal + damageTotal);
        const netRefund = round2(depositAmount - totalDeductions);

        // 2. Create MoveOutRecord
        const record = await tx.moveOutRecord.create({
          data: {
            leaseId,
            moveOutDate: moveOutAt,
            finalWaterMeter: newW,
            finalElectricMeter: newE,
            finalWaterTotal,
            finalElectricTotal,
            unpaidInvoicesTotal,
            damageCharges: damageChargesArr,
            totalDeductions,
            depositAmount,
            netRefund,
            refundStatus: 'PENDING'
          }
        });

        // 2.1 เลขมิเตอร์ตอนย้ายออกเป็นเลขก่อนหน้าของผู้เช่าคนถัดไป ต้องบันทึกเป็น MeterRecord ไม่งั้นเขาถูกคิดหน่วยตั้งแต่เลขเก่า
        // (billingCycle 'MOVEOUT' ไม่ชนรอบ MM-YYYY ของการออกบิล แต่ getPreviousReading ยังหยิบเป็นเลขก่อนหน้า)
        for (const [meterType, previousReading, currentReading] of [
          ['water', settlement.oldWater, newW],
          ['electric', settlement.oldElectric, newE]
        ]) {
          await tx.meterRecord.create({
            data: {
              roomId: lease.roomId,
              meterType,
              billingCycle: 'MOVEOUT',
              recordedAt: moveOutAt,
              previousReading,
              currentReading,
              unitsUsed: currentReading - previousReading
            }
          });
        }

        // 2.2 มัดจำครอบคลุมยอดหักทั้งหมด = บิลค้างถูกชำระด้วยมัดจำแล้ว (ไม่งั้นบิลยังค้างและค่าปรับเดินต่อทั้งที่หักเงินไปแล้ว)
        // ponytail: ถ้ามัดจำไม่พอ (netRefund < 0) ปล่อยบิลค้างไว้ตามเดิม ยังไม่ตัดจ่ายบางส่วนตามสัดส่วน ทำเมื่อมีกรณีจริง
        if (netRefund >= 0 && unpaidInvoices.length > 0) {
          await tx.invoice.updateMany({
            where: { id: { in: unpaidInvoices.map((inv) => inv.id) } },
            data: { status: 'paid', paidAt: moveOutAt, paymentMethod: 'DEPOSIT', paymentNote: 'หักจากเงินมัดจำตอนย้ายออก' }
          });
        }

        // 3. Update Room status = maintenance & clear tenantId
        const room = await tx.room.update({
          where: { id: lease.roomId },
          data: {
            status: 'maintenance',
            tenantId: null
          }
        });

        // 4. ปิดสิทธิ์เข้าพักของทั้งห้อง (ผู้อยู่ร่วม + การผูก LINE) ป้องกันไม่ให้ยังเข้าใช้งาน LIFF Portal ได้ต่อหลังย้ายออกไปแล้ว
        await releaseRoomTenancy(tx, room, [lease.tenantId, existingLease.room?.tenantId]);

        return [lease, record, room];
      });

      // Audit Log
      await auditService.logAction({
        adminId: req.user?.id,
        action: 'CREATE',
        entity: 'MOVE_OUT_RECORD',
        entityId: moveOutRecord.id,
        newValues: moveOutRecord
      });

      return res.status(200).json({
        success: true,
        message: `ประมวลผลแจ้งย้ายออกห้อง ${updatedLease.room?.roomNumber || ''} เรียบร้อยแล้ว (สถานะห้อง: ซ่อมบำรุง)`,
        data: {
          lease: updatedLease,
          moveOutRecord,
          room: updatedRoom
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new MoveOutController();
