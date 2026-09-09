const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');
const lateFeeService = require('../../src/services/lateFeeService');

describe('Automated Late Fee System Integration Tests', () => {
  let adminToken;
  let testBuilding;
  let testRoom;
  let testTenant;
  let testInvoice;

  beforeAll(async () => {
    // 1. Fetch admin user
    const adminUser = await billingService.prisma.user.findFirst({
      where: { role: { in: ['super_admin', 'admin', 'OWNER'] } }
    });
    adminToken = authService.generateAccessToken(adminUser);

    // 2. Fetch or create test building
    testBuilding = await billingService.prisma.building.findFirst({
      include: { setting: true }
    });

    // 3. Fetch test room & tenant
    testRoom = await billingService.prisma.room.findFirst({
      where: { buildingId: testBuilding.id, tenantId: { not: null } },
      include: { tenant: true }
    });

    if (!testRoom) {
      testTenant = await billingService.prisma.tenant.findFirst();
      testRoom = await billingService.prisma.room.findFirst();
      if (testRoom && testTenant) {
        testRoom = await billingService.prisma.room.update({
          where: { id: testRoom.id },
          data: { tenantId: testTenant.id, buildingId: testBuilding.id },
          include: { tenant: true }
        });
      }
    } else {
      testTenant = testRoom.tenant;
    }
  });

  describe('1. Unit & Pure Date Math Calculation Tests (lateFeeService.calculateLateFee)', () => {
    const mockInvoice = {
      roomPrice: 4000,
      waterTotal: 200,
      electricTotal: 500,
      commonFee: 100,
      otherFee: 0,
      status: 'pending',
      dueDate: new Date('2026-09-01T00:00:00.000Z')
    };

    test('1.1 ก่อนวันครบกำหนด (Not Overdue) -> ค่าปรับเป็น 0', () => {
      const setting = { lateFeeType: 'DAILY', lateFeeAmount: 50, gracePeriodDays: 3 };
      const targetDate = new Date('2026-08-30T12:00:00.000Z');

      const result = lateFeeService.calculateLateFee(mockInvoice, setting, targetDate);
      expect(result.isOverdue).toBe(false);
      expect(result.lateFeeCharge).toBe(0);
      expect(result.newGrandTotal).toBe(4800);
    });

    test('1.2 เกินกำหนดแต่อยู่ในระยะเวลาผ่อนผัน (Within Grace Period) -> ค่าปรับเป็น 0', () => {
      const setting = { lateFeeType: 'DAILY', lateFeeAmount: 50, gracePeriodDays: 3 };
      // Due: 2026-09-01, Target: 2026-09-03 (เกินมา 2 วัน แต่ grace period = 3 วัน)
      const targetDate = new Date('2026-09-03T12:00:00.000Z');

      const result = lateFeeService.calculateLateFee(mockInvoice, setting, targetDate);
      expect(result.isOverdue).toBe(true);
      expect(result.daysOverdue).toBe(2);
      expect(result.effectiveOverdueDays).toBe(0);
      expect(result.lateFeeCharge).toBe(0);
      expect(result.newGrandTotal).toBe(4800);
    });

    test('1.3 เกินกำหนดและพ้น Grace Period แบบ DAILY (รายวัน) -> ค่าปรับ = วันที่เกิน x lateFeeAmount', () => {
      const setting = { lateFeeType: 'DAILY', lateFeeAmount: 50, gracePeriodDays: 2 };
      // Due: 2026-09-01, Target: 2026-09-06 (เกินมา 5 วัน, หัก grace 2 วัน = 3 วัน x 50 = 150 บาท)
      const targetDate = new Date('2026-09-06T12:00:00.000Z');

      const result = lateFeeService.calculateLateFee(mockInvoice, setting, targetDate);
      expect(result.isOverdue).toBe(true);
      expect(result.daysOverdue).toBe(5);
      expect(result.effectiveOverdueDays).toBe(3);
      expect(result.lateFeeCharge).toBe(150);
      expect(result.newGrandTotal).toBe(4800 + 150);
    });

    test('1.4 เกินกำหนดและพ้น Grace Period แบบ FLAT (เหมาจ่ายครั้งเดียว) -> ค่าปรับ = lateFeeAmount', () => {
      const setting = { lateFeeType: 'FLAT', lateFeeAmount: 200, gracePeriodDays: 2 };
      // Due: 2026-09-01, Target: 2026-09-06
      const targetDate = new Date('2026-09-06T12:00:00.000Z');

      const result = lateFeeService.calculateLateFee(mockInvoice, setting, targetDate);
      expect(result.isOverdue).toBe(true);
      expect(result.lateFeeCharge).toBe(200);
      expect(result.newGrandTotal).toBe(4800 + 200);
    });

    test('1.5 ตั้งค่าเป็น NONE (ไม่มีค่าปรับ) -> ค่าปรับเป็น 0 เสมอ', () => {
      const setting = { lateFeeType: 'NONE', lateFeeAmount: 100, gracePeriodDays: 0 };
      const targetDate = new Date('2026-09-10T12:00:00.000Z');

      const result = lateFeeService.calculateLateFee(mockInvoice, setting, targetDate);
      expect(result.isOverdue).toBe(true);
      expect(result.lateFeeCharge).toBe(0);
      expect(result.newGrandTotal).toBe(4800);
    });

    test('1.6 บิลที่ชำระเงินแล้ว (status: paid) -> ไม่คิดค่าปรับ', () => {
      const paidInvoice = { ...mockInvoice, status: 'paid' };
      const setting = { lateFeeType: 'DAILY', lateFeeAmount: 50, gracePeriodDays: 0 };
      const targetDate = new Date('2026-09-10T12:00:00.000Z');

      const result = lateFeeService.calculateLateFee(paidInvoice, setting, targetDate);
      expect(result.lateFeeCharge).toBe(0);
    });
  });

  describe('2. Building Settings API Integration (Late Fee Policy Persistence)', () => {
    test('PUT /api/v1/buildings/:id/settings - บันทึกตั้งค่านโยบายค่าปรับ (DAILY / FLAT)', async () => {
      const response = await request(app)
        .put(`/api/v1/buildings/${testBuilding.id}/settings`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          lateFeeType: 'DAILY',
          lateFeeAmount: 100.00,
          gracePeriodDays: 3
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify in DB
      const setting = await billingService.prisma.buildingSetting.findUnique({
        where: { buildingId: testBuilding.id }
      });
      expect(setting.lateFeeType).toBe('DAILY');
      expect(Number(setting.lateFeeAmount)).toBe(100.00);
      expect(setting.gracePeriodDays).toBe(3);
    });
  });

  describe('3. Batch Processing API & DB Update (POST /api/v1/invoices/process-late-fees)', () => {
    let overdueInvoiceId;

    beforeAll(async () => {
      // สร้างบิลทดสอบที่ Due Date ย้อนหลัง 10 วัน
      const pastDueDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const invoice = await billingService.prisma.invoice.create({
        data: {
          invoiceNumber: `TEST-INV-OVERDUE-${Date.now()}`,
          roomId: testRoom.id,
          tenantId: testRoom.tenantId || testTenant.id,
          billingCycle: '08-2026',
          roomPrice: 5000,
          waterTotal: 200,
          electricTotal: 300,
          commonFee: 100,
          otherFee: 0,
          lateFeeCharge: 0,
          grandTotal: 5600,
          status: 'pending',
          dueDate: pastDueDate
        }
      });
      overdueInvoiceId = invoice.id;
    });

    afterAll(async () => {
      if (overdueInvoiceId) {
        await billingService.prisma.invoice.delete({ where: { id: overdueInvoiceId } }).catch(() => {});
      }
    });

    test('POST /api/v1/invoices/process-late-fees - ประมวลผลและอัปเดตค่าปรับบิลค้างชำระ', async () => {
      const response = await request(app)
        .post('/api/v1/invoices/process-late-fees')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          buildingId: testBuilding.id
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalProcessed).toBeGreaterThan(0);

      // ตรวจสอบข้อมูลในฐานข้อมูล
      const updatedInvoice = await billingService.prisma.invoice.findUnique({
        where: { id: overdueInvoiceId }
      });

      expect(Number(updatedInvoice.lateFeeCharge)).toBeGreaterThan(0);
      expect(Number(updatedInvoice.grandTotal)).toBe(5600 + Number(updatedInvoice.lateFeeCharge));
      expect(updatedInvoice.status).toBe('overdue');
    });
  });
});
