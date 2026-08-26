const billingService = require('../services/billingService');
const lineService = require('../services/lineService');

class DashboardController {
  /**
   * ดึงข้อมูลภาพรวมธุรกิจ (Business Analytics & Aggregation)
   */
  async getSummary(req, res, next) {
    try {
      // 1. Occupancy Rate (คำนวณอัตราการครองห้องด้วย Prisma groupBy)
      const roomStats = await billingService.prisma.room.groupBy({
        by: ['status'],
        _count: { id: true }
      });

      let totalRooms = 0;
      let availableRooms = 0;
      let occupiedRooms = 0;
      let maintenanceRooms = 0;

      roomStats.forEach((stat) => {
        const count = stat._count.id;
        totalRooms += count;
        if (stat.status === 'available') availableRooms = count;
        if (stat.status === 'occupied') occupiedRooms = count;
        if (stat.status === 'maintenance') maintenanceRooms = count;
      });

      const occupancyRate = totalRooms > 0 ? Number(((occupiedRooms / totalRooms) * 100).toFixed(1)) : 0;

      // 2. Financial Flow (คำนวณรายได้เดือนปัจจุบัน เปรียบเทียบกับเดือนที่แล้วด้วย Prisma aggregate)
      const now = new Date();
      const currentCycle = `${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;

      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevCycle = `${String(prevDate.getMonth() + 1).padStart(2, '0')}-${prevDate.getFullYear()}`;

      const currentRevenue = await billingService.prisma.invoice.aggregate({
        where: { status: 'paid', billingCycle: currentCycle },
        _sum: {
          grandTotal: true,
          roomPrice: true,
          waterTotal: true,
          electricTotal: true,
          commonFee: true
        }
      });

      const prevRevenue = await billingService.prisma.invoice.aggregate({
        where: { status: 'paid', billingCycle: prevCycle },
        _sum: { grandTotal: true }
      });

      const currentTotal = Number(currentRevenue._sum.grandTotal || 0);
      const prevTotal = Number(prevRevenue._sum.grandTotal || 0);

      let momGrowth = 0;
      if (prevTotal > 0) {
        momGrowth = Number((((currentTotal - prevTotal) / prevTotal) * 100).toFixed(1));
      }

      // 3. Debt Tracking (ยอดหนี้ค้างชำระและรายการลูกหนี้ด้วย Prisma aggregate)
      const debtStats = await billingService.prisma.invoice.aggregate({
        where: {
          status: { in: ['pending', 'overdue', 'reviewing'] }
        },
        _sum: { grandTotal: true },
        _count: { id: true }
      });

      const debtors = await billingService.prisma.invoice.findMany({
        where: {
          status: { in: ['pending', 'overdue', 'reviewing'] }
        },
        orderBy: { dueDate: 'asc' },
        include: { room: true, tenant: true }
      });

      return res.status(200).json({
        success: true,
        data: {
          occupancy: {
            totalRooms,
            availableRooms,
            occupiedRooms,
            maintenanceRooms,
            occupancyRate
          },
          financial: {
            currentCycle,
            currentTotal,
            prevCycle,
            prevTotal,
            momGrowth,
            breakdown: {
              roomPrice: Number(currentRevenue._sum.roomPrice || 0),
              waterTotal: Number(currentRevenue._sum.waterTotal || 0),
              electricTotal: Number(currentRevenue._sum.electricTotal || 0),
              commonFee: Number(currentRevenue._sum.commonFee || 0)
            }
          },
          debt: {
            totalDebt: Number(debtStats._sum.grandTotal || 0),
            debtorCount: debtStats._count.id || 0,
            debtors
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ส่ง LINE Push Flex Message แจ้งเตือนทวงหนี้ลูกบ้านแบบอัตโนมัติ
   */
  async remindDebtors(req, res, next) {
    try {
      const debtors = await billingService.prisma.invoice.findMany({
        where: {
          status: { in: ['pending', 'overdue'] }
        },
        include: { room: true, tenant: true }
      });

      let remindedCount = 0;
      let totalAmount = 0;

      for (const invoice of debtors) {
        totalAmount += Number(invoice.grandTotal);
        if (invoice.tenant?.lineUserId) {
          const sent = await lineService.sendDebtReminderNotification(invoice);
          if (sent) remindedCount++;
        }
      }

      return res.status(200).json({
        success: true,
        message: `ส่งข้อความแจ้งเตือนทวงหนี้ผ่าน LINE สำเร็จไปยัง ${debtors.length} ห้องพัก (รวมยอด ฿${totalAmount.toLocaleString()})`,
        data: {
          totalDebtors: debtors.length,
          remindedCount,
          totalAmount
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new DashboardController();
