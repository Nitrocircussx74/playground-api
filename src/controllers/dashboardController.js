const billingService = require('../services/billingService');
const lineService = require('../services/lineService');

class DashboardController {
  /**
   * ดึงข้อมูลภาพรวมธุรกิจ (Business Analytics & Aggregation)
   */
  async getSummary(req, res, next) {
    try {
      const { buildingId } = req.query;

      // 1. Occupancy Rate (คำนวณอัตราการครองห้องด้วย Prisma groupBy)
      const roomWhere = buildingId ? { buildingId } : {};
      const roomStats = await billingService.prisma.room.groupBy({
        by: ['status'],
        where: roomWhere,
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

      const currentInvoiceWhere = {
        status: 'paid',
        billingCycle: currentCycle,
        ...(buildingId && { room: { buildingId } })
      };

      const prevInvoiceWhere = {
        status: 'paid',
        billingCycle: prevCycle,
        ...(buildingId && { room: { buildingId } })
      };

      const currentRevenue = await billingService.prisma.invoice.aggregate({
        where: currentInvoiceWhere,
        _sum: {
          grandTotal: true,
          roomPrice: true,
          waterTotal: true,
          electricTotal: true,
          commonFee: true
        }
      });

      const prevRevenue = await billingService.prisma.invoice.aggregate({
        where: prevInvoiceWhere,
        _sum: { grandTotal: true }
      });

      const currentTotal = Number(currentRevenue._sum.grandTotal || 0);
      const prevTotal = Number(prevRevenue._sum.grandTotal || 0);

      let momGrowth = 0;
      if (prevTotal > 0) {
        momGrowth = Number((((currentTotal - prevTotal) / prevTotal) * 100).toFixed(1));
      }

      // 3. Debt Tracking (ยอดหนี้ค้างชำระและรายการลูกหนี้ด้วย Prisma aggregate)
      const debtInvoiceWhere = {
        status: { in: ['pending', 'overdue', 'reviewing'] },
        ...(buildingId && { room: { buildingId } })
      };

      const debtStats = await billingService.prisma.invoice.aggregate({
        where: debtInvoiceWhere,
        _sum: { grandTotal: true },
        _count: { id: true }
      });

      const debtors = await billingService.prisma.invoice.findMany({
        where: debtInvoiceWhere,
        orderBy: { dueDate: 'asc' },
        include: { room: true, tenant: true }
      });

      // 4. Building Breakdown (สำหรับ Consolidated All Buildings Mode)
      let buildingBreakdown = [];
      if (!buildingId) {
        const buildings = await billingService.prisma.building.findMany({
          include: {
            rooms: true
          }
        });

        buildingBreakdown = await Promise.all(
          buildings.map(async (b) => {
            const bTotalRooms = b.rooms.length;
            const bOccupied = b.rooms.filter((r) => r.status === 'occupied').length;
            const bRate = bTotalRooms > 0 ? Number(((bOccupied / bTotalRooms) * 100).toFixed(1)) : 0;

            const bRev = await billingService.prisma.invoice.aggregate({
              where: {
                status: 'paid',
                billingCycle: currentCycle,
                room: { buildingId: b.id }
              },
              _sum: { grandTotal: true }
            });

            return {
              id: b.id,
              name: b.name,
              totalRooms: bTotalRooms,
              occupiedRooms: bOccupied,
              occupancyRate: bRate,
              currentRevenue: Number(bRev._sum.grandTotal || 0)
            };
          })
        );
      }

      return res.status(200).json({
        success: true,
        data: {
          isConsolidated: !buildingId,
          buildingBreakdown,
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

  /**
   * ดึงข้อมูลแนวโน้มรายได้ย้อนหลัง 6 เดือน (Historical Revenue Trend)
   */
  async getRevenueTrend(req, res, next) {
    try {
      const { buildingId } = req.query;
      const now = new Date();
      const trends = [];

      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const cycle = `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

        const aggregate = await billingService.prisma.invoice.aggregate({
          where: {
            status: 'paid',
            billingCycle: cycle,
            ...(buildingId && { room: { buildingId } })
          },
          _sum: {
            grandTotal: true,
            roomPrice: true,
            waterTotal: true,
            electricTotal: true,
            commonFee: true
          }
        });

        trends.push({
          cycle,
          totalRevenue: Number(aggregate._sum.grandTotal || 0),
          roomPrice: Number(aggregate._sum.roomPrice || 0),
          waterTotal: Number(aggregate._sum.waterTotal || 0),
          electricTotal: Number(aggregate._sum.electricTotal || 0),
          commonFee: Number(aggregate._sum.commonFee || 0)
        });
      }

      return res.status(200).json({
        success: true,
        data: trends
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ส่งออกรายงานใบแจ้งหนี้เป็นไฟล์ CSV (UTF-8 BOM สำหรับ Excel ภาษาไทย)
   */
  async exportCsv(req, res, next) {
    try {
      const { billingCycle, status } = req.query;
      const whereClause = {};

      if (billingCycle) whereClause.billingCycle = billingCycle;
      if (status) whereClause.status = status;

      const invoices = await billingService.prisma.invoice.findMany({
        where: whereClause,
        orderBy: { billingCycle: 'desc' },
        include: { room: true, tenant: true }
      });

      // Header row with UTF-8 BOM for Excel alignment
      const headers = [
        'Invoice Number',
        'Room Number',
        'Tenant Name',
        'Billing Cycle',
        'Room Price (THB)',
        'Water Fee (THB)',
        'Electricity Fee (THB)',
        'Common Fee (THB)',
        'Grand Total (THB)',
        'Status',
        'Due Date'
      ];

      let csv = '\uFEFF' + headers.join(',') + '\n';

      invoices.forEach((inv) => {
        const roomNum = inv.room ? inv.room.roomNumber : 'N/A';
        const nameStr = inv.tenant ? `${inv.tenant.firstName} ${inv.tenant.lastName}`.replace(/"/g, '""') : '';
        const tenantName = inv.tenant ? `"${nameStr}"` : 'N/A';
        const dueDate = inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : '';
        
        const row = [
          `"${inv.invoiceNumber}"`,
          `"${roomNum}"`,
          tenantName,
          `"${inv.billingCycle}"`,
          Number(inv.roomPrice).toFixed(2),
          Number(inv.waterTotal).toFixed(2),
          Number(inv.electricTotal).toFixed(2),
          Number(inv.commonFee).toFixed(2),
          Number(inv.grandTotal).toFixed(2),
          `"${inv.status}"`,
          `"${dueDate}"`
        ];
        csv += row.join(',') + '\n';
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="invoices_report_${billingCycle || 'all'}.csv"`);
      return res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  }

  /**
   * ส่งออกรายงานสรุปงบการเงินประจำเดือนเป็นไฟล์ PDF
   */
  async exportPdf(req, res, next) {
    try {
      const PDFDocument = require('pdfkit');
      const { billingCycle } = req.query;

      const now = new Date();
      const targetCycle = billingCycle || `${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;

      const invoices = await billingService.prisma.invoice.findMany({
        where: { billingCycle: targetCycle },
        include: { room: true, tenant: true }
      });

      const summary = invoices.reduce(
        (acc, inv) => {
          acc.totalRoom += Number(inv.roomPrice);
          acc.totalWater += Number(inv.waterTotal);
          acc.totalElectric += Number(inv.electricTotal);
          acc.totalCommon += Number(inv.commonFee);
          acc.grandTotal += Number(inv.grandTotal);
          if (inv.status === 'paid') acc.paidTotal += Number(inv.grandTotal);
          else acc.pendingTotal += Number(inv.grandTotal);
          return acc;
        },
        { totalRoom: 0, totalWater: 0, totalElectric: 0, totalCommon: 0, grandTotal: 0, paidTotal: 0, pendingTotal: 0 }
      );

      const doc = new PDFDocument({ margin: 40, size: 'A4' });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="financial_report_${targetCycle}.pdf"`);

      doc.pipe(res);

      // Title & Header
      doc.fontSize(20).text('DORMITORY FINANCIAL SUMMARY REPORT', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(12).text(`Billing Cycle: ${targetCycle}`, { align: 'center' });
      doc.text(`Generated Date: ${new Date().toLocaleDateString('en-GB')}`, { align: 'center' });
      doc.moveDown(1.5);

      // Summary Box
      doc.fontSize(14).text('Executive Summary', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).text(`Total Invoices: ${invoices.length}`);
      doc.text(`Grand Total Billed: ${summary.grandTotal.toLocaleString()} THB`);
      doc.text(`Collected (Paid): ${summary.paidTotal.toLocaleString()} THB`);
      doc.text(`Outstanding (Unpaid): ${summary.pendingTotal.toLocaleString()} THB`);
      doc.moveDown(1);

      // Revenue Breakdown
      doc.fontSize(14).text('Revenue Breakdown', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).text(`Room Rent Revenue: ${summary.totalRoom.toLocaleString()} THB`);
      doc.text(`Water Utility Revenue: ${summary.totalWater.toLocaleString()} THB`);
      doc.text(`Electricity Utility Revenue: ${summary.totalElectric.toLocaleString()} THB`);
      doc.text(`Common Area Fees: ${summary.totalCommon.toLocaleString()} THB`);
      doc.moveDown(1.5);

      // Invoices Table Header
      doc.fontSize(12).text('Invoice Breakdown List', { underline: true });
      doc.moveDown(0.5);

      const tableTop = doc.y;
      doc.fontSize(10);
      doc.text('Invoice #', 40, tableTop, { width: 100 });
      doc.text('Room', 150, tableTop, { width: 60 });
      doc.text('Cycle', 220, tableTop, { width: 70 });
      doc.text('Amount (THB)', 300, tableTop, { width: 100, align: 'right' });
      doc.text('Status', 420, tableTop, { width: 80, align: 'right' });

      doc.moveTo(40, tableTop + 15).lineTo(540, tableTop + 15).stroke();

      let y = tableTop + 25;
      invoices.forEach((inv) => {
        if (y > 750) {
          doc.addPage();
          y = 40;
        }
        const roomNum = inv.room ? inv.room.roomNumber : 'N/A';
        doc.text(inv.invoiceNumber, 40, y, { width: 100 });
        doc.text(roomNum, 150, y, { width: 60 });
        doc.text(inv.billingCycle, 220, y, { width: 70 });
        doc.text(Number(inv.grandTotal).toLocaleString('en-US', { minimumFractionDigits: 2 }), 300, y, { width: 100, align: 'right' });
        doc.text(inv.status.toUpperCase(), 420, y, { width: 80, align: 'right' });
        y += 20;
      });

      doc.moveTo(40, y + 5).lineTo(540, y + 5).stroke();
      doc.moveDown(2);
      doc.fontSize(10).text('--- End of Financial Report ---', { align: 'center' });

      doc.end();
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new DashboardController();
