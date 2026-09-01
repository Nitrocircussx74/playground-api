const request = require('supertest');
const app = require('../../src/app');
const billingService = require('../../src/services/billingService');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

describe('PromptPay Payment & Slip Upload Integration Tests', () => {
  let testRoom;
  let testTenant;
  let testInvoice;
  const testLineUserId = 'U_test_payment_tenant';
  // PNG File Signature (89 50 4E 47 0D 0A 1A 0A) เพื่อให้ผ่าน Magic Bytes Validation ของ uploadMiddleware
  const fakePngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);

  beforeAll(async () => {
    // 1. Create Tenant
    testTenant = await billingService.prisma.tenant.create({
      data: {
        firstName: 'ทดสอบ',
        lastName: 'การชำระเงิน',
        phone: '0891112233',
        idCard: '1100200300999',
        lineUserId: testLineUserId
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
      const response = await request(app)
        .get(`/api/v1/liff/invoices/${testInvoice.id}`)
        .set('X-Line-Id-Token', testLineUserId);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.qrData).toBeDefined();
      expect(response.body.data.qrData.qrDataUrl).toContain('data:image/png;base64');
    });

    test('GET /api/v1/liff/invoices/:id - ใช้ LINE ID Token ของคนอื่นที่ไม่ใช่เจ้าของบิล -> ต้องปฏิเสธ 403 (ป้องกัน IDOR)', async () => {
      const response = await request(app)
        .get(`/api/v1/liff/invoices/${testInvoice.id}`)
        .set('X-Line-Id-Token', 'U_someone_else_not_the_owner');

      expect(response.statusCode).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('GET /api/v1/liff/invoices/:id/receipt-pdf - ใช้ LINE ID Token ของคนอื่นที่ไม่ใช่เจ้าของบิล -> ต้องปฏิเสธ 403 (ป้องกัน IDOR)', async () => {
      const response = await request(app)
        .get(`/api/v1/liff/invoices/${testInvoice.id}/receipt-pdf`)
        .set('X-Line-Id-Token', 'U_someone_else_not_the_owner');

      expect(response.statusCode).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Slip Upload (Auto-Approve ปิดถาวรจนกว่าจะมีการตรวจสลิปจริง)', () => {
    test('POST /api/v1/liff/invoices/:id/slip - แนบสลิปยอดเงินตรงกัน (5050 THB) -> ต้องเป็น reviewing เสมอ ไม่ auto-approve เป็น paid', async () => {
      const dummyFilePath = path.join(__dirname, 'dummy_slip.png');
      fs.writeFileSync(dummyFilePath, fakePngBuffer);

      const response = await request(app)
        .post(`/api/v1/liff/invoices/${testInvoice.id}/slip`)
        .set('X-Line-Id-Token', testLineUserId)
        .field('declaredAmount', '5050')
        .attach('file', dummyFilePath);

      if (fs.existsSync(dummyFilePath)) fs.unlinkSync(dummyFilePath);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('reviewing');
      expect(response.body.data.autoApproved).toBe(false);
    });

    test('POST /api/v1/liff/invoices/:id/slip - แนบสลิปโดยไม่ระบุ declaredAmount -> ต้องเป็น reviewing เสมอ (ห้าม default เป็นยอดบิลแล้ว auto-approve)', async () => {
      const dummyFilePath = path.join(__dirname, 'dummy_slip_no_amount.png');
      fs.writeFileSync(dummyFilePath, fakePngBuffer);

      const response = await request(app)
        .post(`/api/v1/liff/invoices/${testInvoice.id}/slip`)
        .set('X-Line-Id-Token', testLineUserId)
        .attach('file', dummyFilePath);

      if (fs.existsSync(dummyFilePath)) fs.unlinkSync(dummyFilePath);

      expect(response.statusCode).toBe(200);
      expect(response.body.data.status).toBe('reviewing');
      expect(response.body.data.autoApproved).toBe(false);
    });

    test('POST /api/v1/liff/invoices/:id/slip - แนบสลิปยอดเงินไม่ตรง (1000 THB) -> สถานะเปลี่ยนเป็น reviewing (Pending Admin Review)', async () => {
      const dummyFilePath = path.join(__dirname, 'dummy_slip_bad.png');
      fs.writeFileSync(dummyFilePath, fakePngBuffer);

      const response = await request(app)
        .post(`/api/v1/liff/invoices/${testInvoice.id}/slip`)
        .set('X-Line-Id-Token', testLineUserId)
        .field('declaredAmount', '1000')
        .attach('file', dummyFilePath);

      if (fs.existsSync(dummyFilePath)) fs.unlinkSync(dummyFilePath);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('reviewing');
      expect(response.body.data.autoApproved).toBe(false);
    });

    test('POST /api/v1/liff/invoices/:id/slip - แนบสลิปไฟล์เดิมที่เคยใช้จ่ายบิลอื่นไปแล้ว (Replay Protection ด้วย slipHash จริง) -> ต้องแจ้ง reviewing พร้อมเหตุผลตรวจพบการใช้ซ้ำ', async () => {
      const reusedSlipHash = crypto.createHash('sha256').update(fakePngBuffer).digest('hex');

      const alreadyPaidInvoice = await billingService.prisma.invoice.create({
        data: {
          invoiceNumber: `INV-PAY-REPLAY-${Date.now()}`,
          roomId: testRoom.id,
          tenantId: testTenant.id,
          billingCycle: '07-2026',
          roomPrice: 4000,
          waterTotal: 100,
          electricTotal: 500,
          commonFee: 100,
          grandTotal: 4700,
          status: 'paid',
          slipHash: reusedSlipHash,
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      });

      const dummyFilePath = path.join(__dirname, 'dummy_slip_reused.png');
      fs.writeFileSync(dummyFilePath, fakePngBuffer);

      const response = await request(app)
        .post(`/api/v1/liff/invoices/${testInvoice.id}/slip`)
        .set('X-Line-Id-Token', testLineUserId)
        .field('declaredAmount', '5050')
        .attach('file', dummyFilePath);

      if (fs.existsSync(dummyFilePath)) fs.unlinkSync(dummyFilePath);
      await billingService.prisma.invoice.delete({ where: { id: alreadyPaidInvoice.id } }).catch(() => {});

      expect(response.statusCode).toBe(200);
      expect(response.body.data.status).toBe('reviewing');
      expect(response.body.data.autoApproved).toBe(false);
      expect(response.body.data.verificationReason).toContain('Replay Protection');
    });

    test('POST /api/v1/liff/invoices/:id/slip - แนบไฟล์ที่ปลอม Content-Type เป็นรูปแต่เนื้อไฟล์จริงไม่ใช่รูปภาพ -> ต้องปฏิเสธ 400 (Magic Bytes Validation)', async () => {
      const fakeFilePath = path.join(__dirname, 'fake_not_an_image.png');
      fs.writeFileSync(fakeFilePath, 'this is just plain text, not a real image file');

      const response = await request(app)
        .post(`/api/v1/liff/invoices/${testInvoice.id}/slip`)
        .set('X-Line-Id-Token', testLineUserId)
        .field('declaredAmount', '5050')
        .attach('file', fakeFilePath);

      if (fs.existsSync(fakeFilePath)) fs.unlinkSync(fakeFilePath);

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('POST /api/v1/liff/invoices/:id/slip - แนบสลิปด้วย LINE ID Token ของคนอื่นที่ไม่ใช่เจ้าของบิล -> ต้องปฏิเสธ 403', async () => {
      const dummyFilePath = path.join(__dirname, 'dummy_slip_other.png');
      fs.writeFileSync(dummyFilePath, fakePngBuffer);

      const response = await request(app)
        .post(`/api/v1/liff/invoices/${testInvoice.id}/slip`)
        .set('X-Line-Id-Token', 'U_someone_else_not_the_owner')
        .field('declaredAmount', '5050')
        .attach('file', dummyFilePath);

      if (fs.existsSync(dummyFilePath)) fs.unlinkSync(dummyFilePath);

      expect(response.statusCode).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });
});
