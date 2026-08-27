const billingService = require('../services/billingService');
const auditService = require('../services/auditService');

class LeaseController {
  /**
   * ดึงประวัติการเข้าอยู่และสัญญาเช่าทั้งหมดของห้องพักนี้ (GET /api/admin/rooms/:roomId/history)
   */
  async getRoomTenancyHistory(req, res, next) {
    try {
      const { roomId } = req.params;

      const leases = await billingService.prisma.leaseContract.findMany({
        where: { roomId },
        orderBy: { startDate: 'desc' },
        include: {
          tenant: true,
          room: true,
          building: true
        }
      });

      return res.status(200).json({
        success: true,
        data: leases
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ดึงประวัติสัญญาเช่าทั้งหมดของผู้เช่าคนนี้ (GET /api/admin/tenants/:tenantId/history)
   */
  async getTenantLeaseHistory(req, res, next) {
    try {
      const { tenantId } = req.params;

      const leases = await billingService.prisma.leaseContract.findMany({
        where: { tenantId },
        orderBy: { startDate: 'desc' },
        include: {
          room: true,
          building: true
        }
      });

      return res.status(200).json({
        success: true,
        data: leases
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * สร้างสัญญาเช่าใหม่เมื่อเปิดห้องพักหรือผู้เช่าใหม่ย้ายเข้า (POST /api/admin/rooms/:roomId/leases)
   */
  async createLeaseContract(req, res, next) {
    try {
      const { roomId } = req.params;
      const { tenantId, startDate, expectedEndDate, depositAmount, adminNote } = req.body;

      if (!tenantId || !startDate || !expectedEndDate) {
        return res.status(400).json({
          success: false,
          message: 'กรุณาระบุ tenantId, startDate, และ expectedEndDate ให้ครบถ้วน'
        });
      }

      const room = await billingService.prisma.room.findUnique({ where: { id: roomId } });
      if (!room) {
        return res.status(404).json({ success: false, message: 'ไม่พบห้องพักที่ระบุ' });
      }

      // Prisma Transaction: Create LeaseContract and update Room status to occupied
      const [lease] = await billingService.prisma.$transaction([
        billingService.prisma.leaseContract.create({
          data: {
            roomId,
            tenantId,
            buildingId: room.buildingId,
            startDate: new Date(startDate),
            expectedEndDate: new Date(expectedEndDate),
            depositAmount: depositAmount ? Number(depositAmount) : 0,
            status: 'ACTIVE',
            adminNote: adminNote || null
          },
          include: {
            room: true,
            tenant: true,
            building: true
          }
        }),
        billingService.prisma.room.update({
          where: { id: roomId },
          data: {
            status: 'occupied',
            tenantId
          }
        })
      ]);

      // Audit Log
      await auditService.logAction({
        adminId: req.user?.id,
        action: 'CREATE',
        entity: 'LEASE_CONTRACT',
        entityId: lease.id,
        newValues: lease
      });

      return res.status(201).json({
        success: true,
        message: `สร้างสัญญาเช่าห้อง ${room.roomNumber} เรียบร้อยแล้ว`,
        data: lease
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * แจ้งย้ายออกและสิ้นสุดสัญญาเช่า (POST /api/admin/leases/:leaseId/terminate)
   */
  async terminateLease(req, res, next) {
    try {
      const { leaseId } = req.params;
      const { actualEndDate, moveOutReason, adminNote } = req.body;

      const existingLease = await billingService.prisma.leaseContract.findUnique({
        where: { id: leaseId },
        include: { room: true, tenant: true }
      });

      if (!existingLease) {
        return res.status(404).json({ success: false, message: 'ไม่พบสัญญาเช่าที่ระบุ' });
      }

      if (existingLease.status === 'ENDED') {
        return res.status(400).json({ success: false, message: 'สัญญาเช่านี้สิ้นสุดลงแล้ว' });
      }

      const endDate = actualEndDate ? new Date(actualEndDate) : new Date();

      // Transaction: Update LeaseContract to ENDED & update Room to vacant & tenantId = null
      const [updatedLease] = await billingService.prisma.$transaction([
        billingService.prisma.leaseContract.update({
          where: { id: leaseId },
          data: {
            status: 'ENDED',
            actualEndDate: endDate,
            moveOutReason: moveOutReason ? moveOutReason.trim() : null,
            adminNote: adminNote ? adminNote.trim() : existingLease.adminNote
          },
          include: {
            room: true,
            tenant: true,
            building: true
          }
        }),
        billingService.prisma.room.update({
          where: { id: existingLease.roomId },
          data: {
            status: 'vacant',
            tenantId: null
          }
        })
      ]);

      // Audit Log
      await auditService.logAction({
        adminId: req.user?.id,
        action: 'UPDATE',
        entity: 'LEASE_CONTRACT',
        entityId: leaseId,
        oldValues: { status: existingLease.status, actualEndDate: existingLease.actualEndDate },
        newValues: { status: updatedLease.status, actualEndDate: updatedLease.actualEndDate, moveOutReason: updatedLease.moveOutReason }
      });

      return res.status(200).json({
        success: true,
        message: `แจ้งย้ายออกผู้เช่าห้อง ${existingLease.room?.roomNumber || ''} เรียบร้อยแล้ว (คืนห้องว่างแล้ว)`,
        data: updatedLease
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new LeaseController();
