const billingService = require('../services/billingService');
const auditService = require('../services/auditService');

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
              invoices: { where: { status: { in: ['pending', 'overdue'] } } }
            }
          },
          tenant: true
        }
      });

      if (!lease) {
        return res.status(404).json({ success: false, message: 'ไม่พบสัญญาเช่าที่ระบุ' });
      }

      // Previous readings
      const waterMeter = lease.room?.meterRecords.find((m) => m.meterType === 'water');
      const electricMeter = lease.room?.meterRecords.find((m) => m.meterType === 'electric');

      const oldWater = waterMeter ? Number(waterMeter.currentReading) : 0;
      const oldElectric = electricMeter ? Number(electricMeter.currentReading) : 0;

      const waterRate = Number(lease.room?.building?.setting?.waterRate || 18);
      const electricRate = Number(lease.room?.building?.setting?.electricRate || 7);

      const newWater = finalWater !== undefined && finalWater !== '' ? Number(finalWater) : oldWater;
      const newElectric = finalElectric !== undefined && finalElectric !== '' ? Number(finalElectric) : oldElectric;

      const waterUsage = Math.max(0, newWater - oldWater);
      const electricUsage = Math.max(0, newElectric - oldElectric);

      const finalWaterTotal = waterUsage * waterRate;
      const finalElectricTotal = electricUsage * electricRate;

      // Unpaid invoices
      const unpaidInvoices = lease.room?.invoices || [];
      const unpaidInvoicesTotal = unpaidInvoices.reduce((acc, inv) => acc + Number(inv.grandTotal || 0), 0);

      const depositAmount = Number(lease.depositAmount || 0);

      return res.status(200).json({
        success: true,
        data: {
          lease,
          depositAmount,
          oldWater,
          newWater,
          waterUsage,
          waterRate,
          finalWaterTotal,
          oldElectric,
          newElectric,
          electricUsage,
          electricRate,
          finalElectricTotal,
          unpaidInvoices,
          unpaidInvoicesTotal
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

      // Execute Prisma Transaction
      const [updatedLease, moveOutRecord, updatedRoom] = await billingService.prisma.$transaction(async (tx) => {
        // 1. Update LeaseContract status = ENDED
        const lease = await tx.leaseContract.update({
          where: { id: leaseId },
          data: {
            status: 'ENDED',
            actualEndDate: new Date(moveOutDate || Date.now()),
            moveOutReason: moveOutReason ? moveOutReason.trim() : null,
            adminNote: adminNote ? adminNote.trim() : existingLease.adminNote
          },
          include: {
            room: {
              include: {
                building: { include: { setting: true } },
                meterRecords: { orderBy: { recordedAt: 'desc' }, take: 10 },
                invoices: { where: { status: { in: ['pending', 'overdue'] } } }
              }
            },
            tenant: true
          }
        });

        // Calculate breakdown inside transaction
        const waterMeter = lease.room?.meterRecords.find((m) => m.meterType === 'water');
        const electricMeter = lease.room?.meterRecords.find((m) => m.meterType === 'electric');

        const oldWater = waterMeter ? Number(waterMeter.currentReading) : 0;
        const oldElectric = electricMeter ? Number(electricMeter.currentReading) : 0;

        const waterRate = Number(lease.room?.building?.setting?.waterRate || 18);
        const electricRate = Number(lease.room?.building?.setting?.electricRate || 7);

        const newW = Number(finalWaterMeter || oldWater);
        const newE = Number(finalElectricMeter || oldElectric);

        const finalWaterTotal = Math.max(0, newW - oldWater) * waterRate;
        const finalElectricTotal = Math.max(0, newE - oldElectric) * electricRate;

        const unpaidInvoicesTotal = (lease.room?.invoices || []).reduce((acc, inv) => acc + Number(inv.grandTotal || 0), 0);

        const damageChargesArr = Array.isArray(damageCharges) ? damageCharges : [];
        const damageTotal = damageChargesArr.reduce((acc, item) => acc + Number(item.amount || 0), 0);

        const depositAmount = Number(lease.depositAmount || 0);
        const totalDeductions = finalWaterTotal + finalElectricTotal + unpaidInvoicesTotal + damageTotal;
        const netRefund = depositAmount - totalDeductions;

        // 2. Create MoveOutRecord
        const record = await tx.moveOutRecord.create({
          data: {
            leaseId,
            moveOutDate: new Date(moveOutDate || Date.now()),
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

        // 3. Update Room status = maintenance & clear tenantId
        const room = await tx.room.update({
          where: { id: lease.roomId },
          data: {
            status: 'maintenance',
            tenantId: null
          }
        });

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
