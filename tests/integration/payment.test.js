const request = require('supertest');
const app = require('../../src/app');
const billingService = require('../../src/services/billingService');
const path = require('path');
const fs = require('fs');

describe('PromptPay Payment & Auto Slip Verification Integration Tests', () => {
  let testRoom;
  let testTenant;
  let testInvoice;

  beforeAll(async () => {
    // 1. Create Tenant
    testTenant = await billingService.prisma.tenant.create({
      data: {
        firstName: 'ทดสอบ',
        lastName: 'การชำระเงิน',
        phone: '0891112233',
        idCard: '1100200300999'
      }
    });

    // 2. Create Room
    testRoom = await billingService.prisma.room.create({
      data: {
        roomNumber: 'PAY999',
        floor: 9,
        price: 4000,
        status: 'occupied',
        tenantId: testTenant.id
      }
    });

    // 3. Create Invoice
    testInvoice = await billingService.prisma.invoice.create({
      data: {
        invoiceNumber: `INV-PAY-${Date.now()}`,
        roomId: testRoom.id,
        tenantId: testTenant.id,
        billingCycle: '08-2026',
        roomPrice: 4000,
        waterTotal: 150,
        electricTotal: 800,
        commonFee: 100,
        grandTotal: 5050,
        status: 'pending',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
  });

  afterAll(async () => {
    if (testInvoice) {
      await billingService.prisma.invoice.delete({ where: { id: testInvoice.id } }).catch(() => {});
    }
    if (testRoom) {
      await billingService.prisma.room.delete({ where: { id: testRoom.id } }).catch(() => {});
    }
    if (testTenant) {
      await billingService.prisma.tenant.delete({ where: { id: testTenant.id } }).catch(() => {});
    }
  });

  describe('PromptPay QR Code Generation', () => {
    test('GET /api/v1/liff/invoices/:id - คืนค่าข้อมูลบิลพร้อม PromptPay QR Data URL (200 OK)', async () => {
      const response = await request(app).get(`/api/v1/liff/invoices/${testInvoice.id}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.qrData).toBeDefined();
      expect(response.body.data.qrData.qrDataUrl).toContain('data:image/png;base64');
    });
  });

  describe('Auto Slip Verification Engine Tests', () => {
    test('POST /api/v1/liff/invoices/:id/slip - แนบสลิปยอดเงินตรงกัน (5050 THB) -> สถานะเปลี่ยนเป็น PAID ทันที (Auto Approved)', async () => {
      const dummyFilePath = path.join(__dirname, 'dummy_slip.png');
      fs.writeFileSync(dummyFilePath, 'dummy slip binary content');

      const response = await request(app)
        .post(`/api/v1/liff/invoices/${testInvoice.id}/slip`)
        .field('declaredAmount', '5050')
        .attach('file', dummyFilePath);

      if (fs.existsSync(dummyFilePath)) fs.unlinkSync(dummyFilePath);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('paid');
      expect(response.body.data.autoApproved).toBe(true);
      expect(response.body.message).toContain('ตรวจสอบสลิปอัตโนมัติสำเร็จ');
    });

    test('POST /api/v1/liff/invoices/:id/slip - แนบสลิปยอดเงินไม่ตรง (1000 THB) -> สถานะเปลี่ยนเป็น reviewing (Pending Admin Review)', async () => {
      const dummyFilePath = path.join(__dirname, 'dummy_slip_bad.png');
      fs.writeFileSync(dummyFilePath, 'dummy bad slip content');

      const response = await request(app)
        .post(`/api/v1/liff/invoices/${testInvoice.id}/slip`)
        .field('declaredAmount', '1000')
        .attach('file', dummyFilePath);

      if (fs.existsSync(dummyFilePath)) fs.unlinkSync(dummyFilePath);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('reviewing');
      expect(response.body.data.autoApproved).toBe(false);
    });
  });
});
