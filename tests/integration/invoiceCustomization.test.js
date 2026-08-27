const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Advanced Invoice Customization & Editing Integration Tests', () => {
  let adminToken;
  let testRoom;
  let testTenant;
  let createdInvoice;

  beforeAll(async () => {
    adminToken = authService.generateAccessToken({
      id: '00000000-0000-0000-0000-000000000001',
      email: 'admin@test.com',
      name: 'Admin User',
      role: 'admin'
    });

    testTenant = await billingService.prisma.tenant.create({
      data: {
        firstName: 'กิตติ',
        lastName: 'ผู้เช่า',
        phone: '0819998877'
      }
    });

    testRoom = await billingService.prisma.room.create({
      data: {
        roomNumber: 'CUSTOM101',
        floor: 1,
        price: 4500,
        status: 'occupied',
        tenantId: testTenant.id
      }
    });
  });

  afterAll(async () => {
    if (createdInvoice) {
      await billingService.prisma.invoice.delete({ where: { id: createdInvoice.id } }).catch(() => {});
    }
    if (testRoom) {
      await billingService.prisma.room.delete({ where: { id: testRoom.id } }).catch(() => {});
    }
    if (testTenant) {
      await billingService.prisma.tenant.delete({ where: { id: testTenant.id } }).catch(() => {});
    }
  });

  describe('Custom Invoice Creation Endpoints', () => {
    test('POST /api/v1/invoices - สร้างบิลปรับแต่ง (ละเว้นค่าส่วนกลาง = 0 + เพิ่มค่าจอดรถ 500)', async () => {
      const response = await request(app)
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: testRoom.id,
          billingCycle: '09-2026',
          customWaterTotal: 200,
          customElectricTotal: 600,
          waiveCommonFee: true, // ละเว้นค่าส่วนกลาง -> 0 THB
          otherFee: 500,
          otherFeeNote: 'ค่าที่จอดรถประจำเดือน'
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);

      const inv = response.body.data;
      expect(Number(inv.commonFee)).toBe(0);
      expect(Number(inv.otherFee)).toBe(500);
      expect(inv.otherFeeNote).toBe('ค่าที่จอดรถประจำเดือน');
      // 4500 (roomPrice) + 200 (water) + 600 (electric) + 0 (common) + 500 (other) = 5800 THB
      expect(Number(inv.grandTotal)).toBe(5800);

      createdInvoice = inv;
    });

    test('PUT /api/v1/invoices/:id - แก้ไขค่าน้ำ ค่าไฟ และค่าอื่นๆ ในบิลเดิม', async () => {
      const response = await request(app)
        .put(`/api/v1/invoices/${createdInvoice.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          waterTotal: 250,
          electricTotal: 750,
          waiveCommonFee: false, // ยกเลิกการละเว้นส่วนกลาง -> คิดค่าส่วนกลาง 100 THB
          commonFee: 100,
          otherFee: 300,
          otherFeeNote: 'ค่าคีย์การ์ดสำรอง'
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);

      const updated = response.body.data;
      expect(Number(updated.waterTotal)).toBe(250);
      expect(Number(updated.electricTotal)).toBe(750);
      expect(Number(updated.commonFee)).toBe(100);
      expect(Number(updated.otherFee)).toBe(300);
      expect(updated.otherFeeNote).toBe('ค่าคีย์การ์ดสำรอง');
      // 4500 (roomPrice) + 250 + 750 + 100 + 300 = 5900 THB
      expect(Number(updated.grandTotal)).toBe(5900);
    });
  });
});
