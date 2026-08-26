const billingService = require('../services/billingService');

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
      const { status } = req.body; // 'paid' or 'pending' or 'overdue'

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
}

module.exports = new InvoiceController();
