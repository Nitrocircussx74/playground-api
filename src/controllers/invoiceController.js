const billingService = require('../services/billingService');
const PDFDocument = require('pdfkit');

class InvoiceController {
  async getInvoices(req, res, next) {
    try {
      const { billingCycle, status, roomId } = req.query;

      const where = {};
      if (billingCycle) where.billingCycle = billingCycle;
      if (status) where.status = status;
      if (roomId) where.roomId = roomId;

      const invoices = await billingService.prisma.invoice.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        include: {
          room: true,
          tenant: true
        }
      });

      return res.status(200).json({
        success: true,
        data: invoices
      });
    } catch (error) {
      next(error);
    }
  }

  async createInvoice(req, res, next) {
    try {
      const { roomId, billingCycle, dueDate } = req.body;

      if (!roomId || !billingCycle) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: roomId and billingCycle'
        });
      }

      const invoice = await billingService.generateInvoice({
        roomId,
        billingCycle,
        dueDate
      });

      return res.status(201).json({
        success: true,
        message: `Invoice ${invoice.invoiceNumber} created successfully`,
        data: invoice
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async uploadPaymentSlip(req, res, next) {
    try {
      const { id } = req.params;
      const { slipUrl } = req.body;

      const invoice = await billingService.prisma.invoice.findUnique({ where: { id } });
      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }

      if (invoice.status === 'paid') {
        return res.status(400).json({ success: false, message: 'Invoice is already paid' });
      }

      const updatedInvoice = await billingService.prisma.invoice.update({
        where: { id },
        data: {
          slipUrl: slipUrl || 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=600&q=80',
          status: 'pending'
        }
      });

      return res.status(200).json({
        success: true,
        message: 'Payment slip uploaded successfully, awaiting admin verification',
        data: updatedInvoice
      });
    } catch (error) {
      next(error);
    }
  }

  async updateInvoiceStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const invoice = await billingService.prisma.invoice.findUnique({ where: { id } });
      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }

      const updatedInvoice = await billingService.prisma.invoice.update({
        where: { id },
        data: {
          status,
          paidAt: status === 'paid' ? new Date() : null
        }
      });

      return res.status(200).json({
        success: true,
        message: `Invoice status updated to ${status}`,
        data: updatedInvoice
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * สร้างและส่งสตรีมไฟล์ PDF ใบแจ้งหนี้สำหรับดาวน์โหลด
   */
  async exportInvoicePdf(req, res, next) {
    try {
      const { id } = req.params;

      const invoice = await billingService.prisma.invoice.findUnique({
        where: { id },
        include: { room: true, tenant: true }
      });

      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }

      const doc = new PDFDocument({ margin: 40, size: 'A4' });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=Invoice-${invoice.invoiceNumber}.pdf`);

      doc.pipe(res);

      // Header
      doc.fontSize(20).font('Helvetica-Bold').text('DORMITORY MONTHLY INVOICE', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).font('Helvetica').text('123 Playground Resident Road, Bangkok | Tel: 02-123-4567', { align: 'center' });
      doc.moveDown(1);

      doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#cbd5e1').stroke();
      doc.moveDown(1);

      // Details Block
      const startY = doc.y;
      doc.fontSize(11).font('Helvetica-Bold').text(`Invoice No: ${invoice.invoiceNumber}`);
      doc.fontSize(10).font('Helvetica').text(`Billing Cycle: ${invoice.billingCycle}`);
      doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`);

      doc.x = 320;
      doc.y = startY;
      doc.fontSize(11).font('Helvetica-Bold').text(`Room Number: ${invoice.room?.roomNumber}`);
      doc.fontSize(10).font('Helvetica').text(`Tenant: ${invoice.tenant ? `${invoice.tenant.firstName} ${invoice.tenant.lastName}` : 'N/A'}`);
      doc.text(`Status: ${invoice.status.toUpperCase()}`);

      doc.x = 40;
      doc.moveDown(2);

      // Items Table
      const tableTop = doc.y;
      doc.rect(40, tableTop, 515, 24).fill('#f1f5f9');
      doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold');
      doc.text('Description', 50, tableTop + 7);
      doc.text('Amount (THB)', 430, tableTop + 7, { width: 110, align: 'right' });

      let y = tableTop + 32;
      doc.font('Helvetica').fillColor('#334155');

      const items = [
        { desc: `Room Rent (Room ${invoice.room?.roomNumber})`, amount: Number(invoice.roomPrice) },
        { desc: 'Water Consumption Fee', amount: Number(invoice.waterTotal) },
        { desc: 'Electricity Consumption Fee', amount: Number(invoice.electricTotal) },
        { desc: 'Common Service Fee', amount: Number(invoice.commonFee) }
      ];

      items.forEach((item) => {
        doc.text(item.desc, 50, y);
        doc.text(item.amount.toLocaleString('en-US', { minimumFractionDigits: 2 }), 430, y, { width: 110, align: 'right' });
        y += 24;
      });

      doc.moveTo(40, y).lineTo(555, y).strokeColor('#cbd5e1').stroke();
      y += 12;

      // Grand Total
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a');
      doc.text('TOTAL AMOUNT DUE:', 250, y);
      doc.text(`THB ${Number(invoice.grandTotal).toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 430, y, { width: 110, align: 'right' });

      doc.end();
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new InvoiceController();
