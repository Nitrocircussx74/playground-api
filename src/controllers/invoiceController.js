const billingService = require('../services/billingService');
const lineService = require('../services/lineService');
const PDFDocument = require('pdfkit');
const { setupThaiFonts } = require('../utils/pdfHelper');

class InvoiceController {
  async getInvoices(req, res, next) {
    try {
      const { billingCycle, status, roomId, buildingId } = req.query;

      const where = {};
      if (billingCycle) where.billingCycle = billingCycle;
      if (status) where.status = status;
      if (roomId) where.roomId = roomId;
      if (buildingId) where.room = { buildingId };

      const invoices = await billingService.prisma.invoice.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        include: {
          room: {
            include: { building: true }
          },
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

  /**
   * ดึงรายการบิลทั้งหมด (ทั้งค้างชำระและชำระแล้ว) สำหรับแสดงใน LIFF App
   */
  async getPaidInvoicesForLiff(req, res, next) {
    try {
      const lineUserId = req.lineUserId || req.query?.lineUserId;
      const { tenantId, room: queryRoomNumber, roomNumber: queryRoomNumberAlt } = req.query || {};
      const targetRoomNumber = queryRoomNumber || queryRoomNumberAlt;

      let tenant = null;

      // 1. ค้นหาจาก lineUserId ที่ยืนยันตัวตนผ่าน LIFF Token
      if (lineUserId) {
        tenant = await billingService.prisma.tenant.findUnique({
          where: { lineUserId },
          include: {
            rooms: true,
            leaseContracts: {
              where: { status: 'ACTIVE' },
              include: { room: true }
            }
          }
        });
      }

      // 2. ค้นหาจาก tenantId (หากส่งมา)
      if (!tenant && tenantId) {
        tenant = await billingService.prisma.tenant.findUnique({
          where: { id: tenantId },
          include: {
            rooms: true,
            leaseContracts: {
              where: { status: 'ACTIVE' },
              include: { room: true }
            }
          }
        });
      }

      // 3. ค้นหาจากหมายเลขห้อง (กรณี dev / test mode)
      if (!tenant && targetRoomNumber) {
        const room = await billingService.prisma.room.findFirst({
          where: { roomNumber: targetRoomNumber },
          include: {
            tenant: {
              include: {
                rooms: true,
                leaseContracts: {
                  where: { status: 'ACTIVE' },
                  include: { room: true }
                }
              }
            }
          }
        });
        if (room?.tenant) {
          tenant = room.tenant;
        }
      }

      if (!tenant) {
        return res.status(200).json({ success: true, data: [] });
      }

      // รวบรวม ID ห้องพักทั้งหมดที่ผู้เช่าผูกอยู่ (ทั้งจาก Room.tenantId และ Active Lease Contract)
      const roomIds = [];
      if (tenant.rooms && tenant.rooms.length > 0) {
        tenant.rooms.forEach((r) => roomIds.push(r.id));
      }
      if (tenant.leaseContracts && tenant.leaseContracts.length > 0) {
        tenant.leaseContracts.forEach((c) => {
          if (c.roomId && !roomIds.includes(c.roomId)) {
            roomIds.push(c.roomId);
          }
        });
      }

      const orConditions = [{ tenantId: tenant.id }];
      if (roomIds.length > 0) {
        orConditions.push({ roomId: { in: roomIds } });
      }

      const invoices = await billingService.prisma.invoice.findMany({
        where: {
          OR: orConditions
        },
        orderBy: { createdAt: 'desc' },
        include: {
          room: {
            include: { building: true }
          },
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
      const {
        roomId,
        billingCycle,
        dueDate,
        customWaterTotal,
        customElectricTotal,
        waiveCommonFee,
        commonFee,
        otherFee,
        otherFeeNote
      } = req.body;

      if (!roomId || !billingCycle) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters: roomId and billingCycle'
        });
      }

      const invoice = await billingService.generateInvoice({
        roomId,
        billingCycle,
        dueDate,
        customWaterTotal,
        customElectricTotal,
        waiveCommonFee,
        commonFee,
        otherFee,
        otherFeeNote
      });

      if (invoice.tenant?.lineUserId) {
        await lineService.pushInvoiceNotification(invoice.tenant.lineUserId, invoice);
      }

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

  /**
   * แก้ไขข้อมูลบิลค่าเช่า (ปรับแต่งค่าน้ำ, ค่าไฟ, ค่าส่วนกลาง, ค่าอื่นๆ)
   */
  async updateInvoice(req, res, next) {
    try {
      const { id } = req.params;
      const {
        roomPrice,
        waterTotal,
        electricTotal,
        waiveCommonFee,
        commonFee,
        otherFee,
        otherFeeNote,
        dueDate,
        status
      } = req.body;

      const invoice = await billingService.updateInvoice(id, {
        roomPrice,
        waterTotal,
        electricTotal,
        waiveCommonFee,
        commonFee,
        otherFee,
        otherFeeNote,
        dueDate,
        status
      });

      return res.status(200).json({
        success: true,
        message: `แก้ไขใบแจ้งหนี้ ${invoice.invoiceNumber} เรียบร้อยแล้ว`,
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
          status: 'reviewing'
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

      const invoice = await billingService.prisma.invoice.findUnique({
        where: { id },
        include: { room: true, tenant: true }
      });
      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }

      const updatedInvoice = await billingService.prisma.invoice.update({
        where: { id },
        data: {
          status,
          paidAt: status === 'paid' ? new Date() : null
        },
        include: { room: true, tenant: true }
      });

      // ส่ง LINE Push Notification แจ้งเตือนลูกบ้านเมื่อบิลเปลี่ยนเป็นชำระแล้ว (paid)
      if (status === 'paid' && invoice.status !== 'paid' && updatedInvoice.tenant?.lineUserId) {
        lineService.sendPaymentSuccessNotification(updatedInvoice).catch((err) => {
          console.warn('⚠️ ไม่สามารถส่ง LINE Payment Success Push Message ได้:', err.message);
        });
      }

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
      const lineUserId = req.lineUserId || req.query?.lineUserId;
      const tenantId = req.tenantId || req.user?.tenantId || req.user?.id;

      const invoice = await billingService.prisma.invoice.findUnique({
        where: { id },
        include: {
          room: {
            include: { building: true }
          },
          tenant: {
            include: { lineAccounts: true }
          }
        }
      });

      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }

      // Check tenant access permission (IDOR protection)
      if (req.user?.role === 'tenant' || req.user?.role === 'TENANT' || (lineUserId && !req.user)) {
        let isAuthorized = false;

        if (tenantId && invoice.tenantId === tenantId) {
          isAuthorized = true;
        } else if (lineUserId && invoice.tenant?.lineUserId === lineUserId) {
          isAuthorized = true;
        } else if (lineUserId && invoice.tenant?.lineAccounts?.some(acc => acc.lineUserId === lineUserId)) {
          isAuthorized = true;
        }

        if (!isAuthorized && (invoice.tenantId || invoice.tenant?.lineUserId)) {
          return res.status(403).json({
            success: false,
            message: 'ปฏิเสธการเข้าถึง: คุณไม่มีสิทธิ์ดาวน์โหลดใบแจ้งหนี้ของผู้อื่น'
          });
        }
      }

      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const fonts = setupThaiFonts(doc);

      res.setHeader('Content-Type', 'application/pdf');
      // ใช้ attachment แทน inline เสมอ เพราะไฟล์นี้ถูกเปิดตรงผ่าน External Browser บน Android ในกรณี LINE In-App Browser
      // (fallbackDirectUrl ใน downloadHelper.js) ถ้าเป็น inline บาง WebView/Custom Tab บน Android จะพยายามแสดงผลในหน้าเว็บ
      // แทนที่จะเปิด Native Download ทำให้ผู้ใช้ดาวน์โหลดไฟล์ไม่ได้ (ต่างจาก iOS Safari ที่ยังกดปุ่มแชร์เพื่อเซฟได้)
      res.setHeader('Content-Disposition', `attachment; filename="Invoice-${invoice.invoiceNumber}.pdf"`);

      doc.pipe(res);

      const buildingName = invoice.room?.building?.name || 'หอพักสมาร์ทโดรม (Dormitory Residence)';

      doc.fontSize(20).font(fonts.bold).fillColor('#4338ca').text(`ใบแจ้งหนี้ค่าเช่าพัก / INVOICE`, { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(11).font(fonts.regular).fillColor('#475569').text(`${buildingName} | โทร: 02-123-4567 | TAX ID: 0105558000123`, { align: 'center' });
      doc.moveDown(0.8);

      doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#4338ca').lineWidth(1.5).stroke();
      doc.moveDown(1);

      const startY = doc.y;
      const dueDateStr = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('th-TH') : '-';
      const createdDateStr = invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString('th-TH') : '-';

      doc.fontSize(11).font(fonts.bold).fillColor('#0f172a').text(`เลขที่ใบแจ้งหนี้ / Invoice No: ${invoice.invoiceNumber}`);
      doc.fontSize(10).font(fonts.regular).fillColor('#334155').text(`รอบบิลประจำเดือน / Billing Cycle: ${invoice.billingCycle}`);
      doc.text(`วันที่ออกบิล / Issue Date: ${createdDateStr}`);
      doc.text(`กำหนดชำระภายใน / Due Date: ${dueDateStr}`);

      doc.x = 320;
      doc.y = startY;
      doc.fontSize(11).font(fonts.bold).fillColor('#0f172a').text(`ห้องพัก / Room Number: ห้อง ${invoice.room?.roomNumber || '-'}`);
      doc.fontSize(10).font(fonts.regular).fillColor('#334155').text(`ผู้เช่า / Tenant: ${invoice.tenant ? `${invoice.tenant.firstName} ${invoice.tenant.lastName}` : 'ผู้เช่าห้องพัก'}`);
      doc.fontSize(10).font(fonts.bold).fillColor(invoice.status === 'paid' ? '#16a34a' : '#ea580c').text(`สถานะ / Status: ${invoice.status.toUpperCase()}`);

      doc.x = 40;
      doc.moveDown(2);

      const tableTop = doc.y;
      doc.rect(40, tableTop, 515, 24).fill('#e0e7ff');
      doc.fillColor('#312e81').fontSize(10).font(fonts.bold);
      doc.text('รายการค่าใช้จ่าย (Description)', 50, tableTop + 6);
      doc.text('จำนวนเงิน (Amount / THB)', 400, tableTop + 6, { width: 140, align: 'right' });

      let y = tableTop + 30;
      doc.font(fonts.regular).fillColor('#334155');

      const items = [
        { desc: `ค่าเช่าห้องพักประจำเดือน (Monthly Rent - Room ${invoice.room?.roomNumber})`, amount: Number(invoice.roomPrice) },
        { desc: `ค่าน้ำประปา (Water Consumption Fee)`, amount: Number(invoice.waterTotal) },
        { desc: `ค่าไฟฟ้า (Electricity Consumption Fee)`, amount: Number(invoice.electricTotal) },
        {
          desc: Number(invoice.commonFee) === 0 ? 'ค่าบริการส่วนกลาง (Common Fee - ฟรี/ยกเว้น)' : 'ค่าบริการส่วนกลาง (Common Maintenance Fee)',
          amount: Number(invoice.commonFee)
        }
      ];

      if (Number(invoice.otherFee) > 0) {
        if (invoice.otherFeeNote && invoice.otherFeeNote.startsWith('[')) {
          try {
            const parsedItems = JSON.parse(invoice.otherFeeNote);
            parsedItems.forEach((item) => {
              items.push({
                desc: item.note ? `ค่าบริการอื่นๆ (${item.note})` : 'ค่าบริการอื่นๆ (Other Service Fee)',
                amount: Number(item.amount) || 0
              });
            });
          } catch {
            items.push({
              desc: invoice.otherFeeNote ? `ค่าบริการอื่นๆ (${invoice.otherFeeNote})` : 'ค่าบริการอื่นๆ (Other Service Fee)',
              amount: Number(invoice.otherFee)
            });
          }
        } else {
          items.push({
            desc: invoice.otherFeeNote ? `ค่าบริการอื่นๆ (${invoice.otherFeeNote})` : 'ค่าบริการอื่นๆ (Other Service Fee)',
            amount: Number(invoice.otherFee)
          });
        }
      }

      if (Number(invoice.lateFeeCharge) > 0) {
        items.push({
          desc: 'ค่าปรับชำระล่าช้า (Late Payment Penalty Fee)',
          amount: Number(invoice.lateFeeCharge)
        });
      }

      items.forEach((item) => {
        doc.text(item.desc, 50, y);
        doc.text(item.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 }), 400, y, { width: 140, align: 'right' });
        y += 24;
      });

      doc.moveTo(40, y).lineTo(555, y).strokeColor('#cbd5e1').stroke();
      y += 12;

      doc.font(fonts.bold).fontSize(12).fillColor('#1e1b4b');
      doc.text('ยอดชำระสุทธิทั้งสิ้น (TOTAL AMOUNT DUE):', 180, y);
      doc.text(`฿${Number(invoice.grandTotal).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`, 400, y, { width: 140, align: 'right' });

      doc.end();
    } catch (error) {
      next(error);
    }
  }

  /**
   * สร้างและส่งสตรีมไฟล์ PDF ใบเสร็จรับเงิน (Official E-Receipt)
   */
  async exportReceiptPdf(req, res, next) {
    try {
      const { id } = req.params;
      const lineUserId = req.lineUserId || req.query?.lineUserId;
      const tenantId = req.tenantId || req.user?.tenantId || req.user?.id;

      const invoice = await billingService.prisma.invoice.findUnique({
        where: { id },
        include: {
          room: {
            include: { building: true }
          },
          tenant: {
            include: { lineAccounts: true }
          }
        }
      });

      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }

      // Check tenant access permission (IDOR protection)
      if (req.user?.role === 'tenant' || req.user?.role === 'TENANT' || (lineUserId && !req.user)) {
        let isAuthorized = false;

        if (tenantId && invoice.tenantId === tenantId) {
          isAuthorized = true;
        } else if (lineUserId && invoice.tenant?.lineUserId === lineUserId) {
          isAuthorized = true;
        } else if (lineUserId && invoice.tenant?.lineAccounts?.some(acc => acc.lineUserId === lineUserId)) {
          isAuthorized = true;
        }

        if (!isAuthorized && (invoice.tenantId || invoice.tenant?.lineUserId)) {
          return res.status(403).json({
            success: false,
            message: 'ปฏิเสธการเข้าถึง: คุณไม่มีสิทธิ์ดาวน์โหลดใบเสร็จของผู้อื่น'
          });
        }
      }

      const receiptNo = `REC-${invoice.invoiceNumber}`;
      const paidDateStr = invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString('th-TH') : new Date().toLocaleDateString('th-TH');

      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const fonts = setupThaiFonts(doc);

      res.setHeader('Content-Type', 'application/pdf');
      // เหตุผลเดียวกับ exportInvoicePdf: ใช้ attachment กันไฟล์ถูกแสดงผล inline บน Android WebView/Custom Tab
      // แทนที่จะดาวน์โหลดจริง ตอนเปิดผ่าน External Browser จาก LINE In-App Browser
      res.setHeader('Content-Disposition', `attachment; filename="Official-Receipt-${receiptNo}.pdf"`);

      doc.pipe(res);

      const buildingName = invoice.room?.building?.name || 'หอพักสมาร์ทโดรม (Dormitory Residence)';

      // Official E-Receipt Header
      doc.fontSize(22).font(fonts.bold).fillColor('#16a34a').text('ใบเสร็จรับเงิน / OFFICIAL RECEIPT', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(10).font(fonts.regular).fillColor('#475569').text(`${buildingName} | โทร: 02-123-4567 | เลขประจำตัวผู้เสียภาษี: 0105558000123`, { align: 'center' });
      doc.moveDown(0.8);

      doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#16a34a').lineWidth(2).stroke();
      doc.moveDown(1);

      // Receipt Details
      const startY = doc.y;
      doc.fontSize(11).font(fonts.bold).fillColor('#0f172a').text(`เลขที่ใบเสร็จ / Receipt No: ${receiptNo}`);
      doc.fontSize(10).font(fonts.regular).fillColor('#334155').text(`อ้างอิงบิล / Ref Invoice: ${invoice.invoiceNumber}`);
      doc.text(`วันที่ชำระเงิน / Payment Date: ${paidDateStr}`);
      doc.text(`ช่องทางชำระ / Payment Method: ${invoice.paymentMethod || 'PROMPTPAY / CASH'}`);

      doc.x = 320;
      doc.y = startY;
      doc.fontSize(11).font(fonts.bold).fillColor('#0f172a').text(`ห้องพัก / Room Number: ห้อง ${invoice.room?.roomNumber || '-'}`);
      doc.fontSize(10).font(fonts.regular).fillColor('#334155').text(`ผู้ชำระเงิน / Payer: ${invoice.tenant ? `${invoice.tenant.firstName} ${invoice.tenant.lastName}` : 'ผู้เช่าห้องพัก'}`);
      doc.fontSize(11).font(fonts.bold).fillColor('#16a34a').text('สถานะ / STATUS: PAID (ชำระเงินเรียบร้อยแล้ว)');

      doc.x = 40;
      doc.moveDown(2);

      // Items Table
      const tableTop = doc.y;
      doc.rect(40, tableTop, 515, 24).fill('#f0fdf4');
      doc.fillColor('#14532d').fontSize(10).font(fonts.bold);
      doc.text('รายการรับชำระ (Payment Item Description)', 50, tableTop + 6);
      doc.text('จำนวนเงิน (Amount / THB)', 400, tableTop + 6, { width: 140, align: 'right' });

      let y = tableTop + 30;
      doc.font(fonts.regular).fillColor('#334155');

      const items = [
        { desc: `ค่าเช่าห้องพักประจำเดือน (Monthly Rent - Room ${invoice.room?.roomNumber})`, amount: Number(invoice.roomPrice) },
        { desc: `ค่าน้ำประปา (Water Consumption Fee)`, amount: Number(invoice.waterTotal) },
        { desc: `ค่าไฟฟ้า (Electricity Consumption Fee)`, amount: Number(invoice.electricTotal) },
        {
          desc: Number(invoice.commonFee) === 0 ? 'ค่าบริการส่วนกลาง (Common Fee - ฟรี/ยกเว้น)' : 'ค่าบริการส่วนกลาง (Common Maintenance Fee)',
          amount: Number(invoice.commonFee)
        }
      ];

      if (Number(invoice.otherFee) > 0) {
        if (invoice.otherFeeNote && invoice.otherFeeNote.startsWith('[')) {
          try {
            const parsedItems = JSON.parse(invoice.otherFeeNote);
            parsedItems.forEach((item) => {
              items.push({
                desc: item.note ? `ค่าบริการอื่นๆ (${item.note})` : 'ค่าบริการอื่นๆ (Other Service Fee)',
                amount: Number(item.amount) || 0
              });
            });
          } catch {
            items.push({
              desc: invoice.otherFeeNote ? `ค่าบริการอื่นๆ (${invoice.otherFeeNote})` : 'ค่าบริการอื่นๆ (Other Service Fee)',
              amount: Number(invoice.otherFee)
            });
          }
        } else {
          items.push({
            desc: invoice.otherFeeNote ? `ค่าบริการอื่นๆ (${invoice.otherFeeNote})` : 'ค่าบริการอื่นๆ (Other Service Fee)',
            amount: Number(invoice.otherFee)
          });
        }
      }

      if (Number(invoice.lateFeeCharge) > 0) {
        items.push({
          desc: 'ค่าปรับชำระล่าช้า (Late Payment Penalty Fee)',
          amount: Number(invoice.lateFeeCharge)
        });
      }

      items.forEach((item) => {
        doc.text(item.desc, 50, y);
        doc.text(item.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 }), 400, y, { width: 140, align: 'right' });
        y += 24;
      });

      doc.moveTo(40, y).lineTo(555, y).strokeColor('#bbf7d0').stroke();
      y += 12;

      // Grand Total Box
      doc.font(fonts.bold).fontSize(13).fillColor('#16a34a');
      doc.text('ยอดชำระเงินสุทธิทั้งสิ้น (TOTAL AMOUNT PAID):', 160, y);
      doc.text(`฿${Number(invoice.grandTotal).toLocaleString('th-TH', { minimumFractionDigits: 2 })}`, 400, y, { width: 140, align: 'right' });

      // Thank You Note
      doc.moveDown(3);
      doc.fontSize(10).font(fonts.regular).fillColor('#64748b').text('ขอบคุณสำหรับการชำระเงิน โปรดเก็บใบเสร็จอิเล็กทรอนิกส์นี้ไว้เป็นหลักฐาน', { align: 'center' });

      doc.end();
    } catch (error) {
      next(error);
    }
  }

  /**
   * ลบใบแจ้งหนี้ (Delete Invoice)
   */
  async deleteInvoice(req, res, next) {
    try {
      const { id } = req.params;
      const invoice = await billingService.prisma.invoice.findUnique({ where: { id } });

      if (!invoice) {
        return res.status(404).json({ success: false, message: 'ไม่พบใบแจ้งหนี้ที่ต้องการลบ' });
      }

      await billingService.prisma.invoice.delete({ where: { id } });

      const auditService = require('../services/auditService');
      await auditService.logAction({
        adminId: req.user?.id,
        action: 'DELETE',
        entity: 'INVOICE',
        entityId: id,
        oldValues: invoice
      });

      return res.status(200).json({
        success: true,
        message: `ลบใบแจ้งหนี้ ${invoice.invoiceNumber} เรียบร้อยแล้ว`
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * บันทึกรับชำระเงินสด/โอนเงินผ่านเคาน์เตอร์โดยแอดมิน (Manual Payment)
   * POST /api/admin/invoices/:id/pay-manual
   */
  async recordManualPayment(req, res, next) {
    try {
      const { id } = req.params;
      const { paymentMethod, note } = req.body;

      const invoice = await billingService.prisma.invoice.findUnique({
        where: { id },
        include: { room: true, tenant: true }
      });

      if (!invoice) {
        return res.status(404).json({ success: false, message: 'ไม่พบใบแจ้งหนี้ที่ต้องการชำระ' });
      }

      if (invoice.status === 'paid') {
        return res.status(400).json({ success: false, message: 'ใบแจ้งหนี้นี้ได้รับการชำระเงินเรียบร้อยแล้ว' });
      }

      const method = (paymentMethod || 'CASH').toUpperCase();
      const paidAt = new Date();

      const updatedInvoice = await billingService.prisma.invoice.update({
        where: { id },
        data: {
          status: 'paid',
          paymentMethod: method,
          paymentNote: note ? note.trim() : null,
          paidAt
        },
        include: { room: true, tenant: true }
      });

      // Record Audit Log
      const auditService = require('../services/auditService');
      await auditService.logAction({
        adminId: req.user?.id,
        action: 'UPDATE',
        entity: 'INVOICE',
        entityId: id,
        oldValues: {
          status: invoice.status,
          paidAt: invoice.paidAt,
          paymentMethod: invoice.paymentMethod,
          paymentNote: invoice.paymentNote
        },
        newValues: {
          status: updatedInvoice.status,
          paidAt: updatedInvoice.paidAt,
          paymentMethod: updatedInvoice.paymentMethod,
          paymentNote: updatedInvoice.paymentNote
        }
      });

      // ส่ง LINE Push Notification แจ้งเตือนลูกบ้านเมื่อแอดมินบันทึกรับชำระเงินสำเร็จ
      if (updatedInvoice.tenant?.lineUserId) {
        lineService.sendPaymentSuccessNotification(updatedInvoice).catch((err) => {
          console.warn('⚠️ ไม่สามารถส่ง LINE Payment Success Push Message ได้:', err.message);
        });
      }

      return res.status(200).json({
        success: true,
        message: `บันทึกรับชำระเงินบิล ${invoice.invoiceNumber} (ยอด ฿${Number(invoice.grandTotal).toLocaleString()}) เรียบร้อยแล้ว`,
        data: updatedInvoice
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ส่ง LINE Push Flex Message แจ้งเตือนยอดค้างชำระสำหรับบิลเดี่ยว
   * POST /api/v1/invoices/:id/remind
   */
  async remindInvoice(req, res, next) {
    try {
      const { id } = req.params;

      const invoice = await billingService.prisma.invoice.findUnique({
        where: { id },
        include: { room: true, tenant: true }
      });

      if (!invoice) {
        return res.status(404).json({
          success: false,
          message: 'ไม่พบใบแจ้งหนี้ที่ระบุ'
        });
      }

      if (invoice.status === 'paid') {
        return res.status(400).json({
          success: false,
          message: 'ใบแจ้งหนี้นี้ได้รับการชำระเงินเรียบร้อยแล้ว ไม่จำเป็นต้องส่งแจ้งเตือน'
        });
      }

      if (!invoice.tenant?.lineUserId) {
        return res.status(400).json({
          success: false,
          message: `ผู้เช่าห้อง ${invoice.room?.roomNumber || ''} (${invoice.tenant?.firstName || 'ไม่ระบุ'}) ยังไม่ได้เชื่อมต่อบัญชี LINE OA จึงไม่สามารถส่งแจ้งเตือนได้`
        });
      }

      const result = await lineService.sendDebtReminderNotification(invoice);
      if (!result || result.success === false) {
        return res.status(400).json({
          success: false,
          message: result?.message || 'ไม่สามารถส่งข้อความแจ้งเตือนผ่าน LINE ได้ โปรดตรวจสอบว่าผู้ใช้ได้แอดเพื่อนกับ LINE OA แล้วหรือไม่'
        });
      }

      return res.status(200).json({
        success: true,
        message: `ส่งข้อความแจ้งเตือนยอดค้างชำระบิล ${invoice.invoiceNumber} (ห้อง ${invoice.room?.roomNumber}) ผ่าน LINE สำเร็จแล้ว`
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * ส่ง LINE Push Flex Message แจ้งเตือนยอดค้างชำระบิลทั้งหมดที่ยังไม่ได้จ่าย
   * POST /api/v1/invoices/remind-bulk
   */
  async remindBulkInvoices(req, res, next) {
    try {
      const { billingCycle, buildingId } = req.body || {};

      const where = {
        status: { in: ['pending', 'overdue'] }
      };
      if (billingCycle) where.billingCycle = billingCycle;
      if (buildingId) where.room = { buildingId };

      const unpaidInvoices = await billingService.prisma.invoice.findMany({
        where,
        include: { room: true, tenant: true }
      });

      if (unpaidInvoices.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'ไม่มีรายการบิลค้างชำระที่ต้องส่งแจ้งเตือน',
          data: { total: 0, sentCount: 0, skippedCount: 0 }
        });
      }

      let sentCount = 0;
      let skippedCount = 0;

      for (const invoice of unpaidInvoices) {
        if (invoice.tenant?.lineUserId) {
          const result = await lineService.sendDebtReminderNotification(invoice);
          if (result && result.success !== false) {
            sentCount++;
          } else {
            skippedCount++;
          }
        } else {
          skippedCount++;
        }
      }

      return res.status(200).json({
        success: true,
        message: `ส่ง LINE แจ้งเตือนบิลค้างชำระสำเร็จ ${sentCount} ห้อง (ข้าม ${skippedCount} ห้องที่ไม่ได้ผูก LINE หรือส่งไม่สำเร็จ)`,
        data: {
          total: unpaidInvoices.length,
          sentCount,
          skippedCount
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * สั่งประมวลผลคำนวณค่าปรับจ่ายล่าช้าอัตโนมัติ (On-Demand / Manual Trigger โดยแอดมิน)
   */
  async processLateFees(req, res, next) {
    try {
      const { buildingId, targetDate } = req.body || {};
      const lateFeeService = require('../services/lateFeeService');
      const result = await lateFeeService.processLateFees({ buildingId, targetDate });

      return res.status(200).json({
        success: true,
        message: `ประมวลผลค่าปรับสำเร็จ: อัปเดต ${result.totalUpdated} จากทั้งหมด ${result.totalProcessed} บิล (ยอดค่าปรับรวม ฿${result.totalLateFeeAmount.toLocaleString()})`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new InvoiceController();
