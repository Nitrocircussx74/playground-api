const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Multi-Building Architecture Integration Tests', () => {
  let adminToken;
  let tenantToken;
  let testBuilding;
  let testRoom;
  let testTenant;

  beforeAll(async () => {
    adminToken = authService.generateAccessToken({
      id: '00000000-0000-0000-0000-000000000001',
      email: 'admin@test.com',
      name: 'Admin User',
      role: 'super_admin'
    });

    tenantToken = authService.generateAccessToken({
      id: '00000000-0000-0000-0000-000000000002',
      email: 'tenant@test.com',
      name: 'Tenant User',
      role: 'tenant'
    });

    testTenant = await billingService.prisma.tenant.create({
      data: {
        firstName: 'สมชาย',
        lastName: 'ตึกใหม่',
        phone: '0898887766',
        lineUserId: 'U_BUILDING_TEST_001'
      }
    });
  });

  afterAll(async () => {
    if (testRoom) {
      await billingService.prisma.room.delete({ where: { id: testRoom.id } }).catch(() => {});
    }
    if (testBuilding) {
      await billingService.prisma.building.delete({ where: { id: testBuilding.id } }).catch(() => {});
    }
    if (testTenant) {
      await billingService.prisma.tenant.delete({ where: { id: testTenant.id } }).catch(() => {});
    }
  });

  describe('Building Endpoints (/api/v1/buildings)', () => {
    test('POST /api/v1/buildings - แอดมินสร้างตึกใหม่พร้อมบัญชีพร้อมเพย์ (201 Created)', async () => {
      const response = await request(app)
        .post('/api/v1/buildings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'อาคาร C (East Wing)',
          address: '456 ถนนพหลโยธิน กรุงเทพฯ',
          promptpayNum: '0891112222',
          paymentQrUrl: 'https://example.com/qr-building-c.png'
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);

      testBuilding = response.body.data;
      expect(testBuilding.name).toBe('อาคาร C (East Wing)');
      expect(testBuilding.setting.promptpayNum).toBe('0891112222');
      expect(testBuilding.setting.paymentQrUrl).toBe('https://example.com/qr-building-c.png');
    });

    test('GET /api/v1/buildings - ดึงรายการตึกทั้งหมด (200 OK)', async () => {
      const response = await request(app)
        .get('/api/v1/buildings')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    test('PUT /api/v1/buildings/:id/setting - อัปเดต PromptPay QR Code ประจำตึก (200 OK)', async () => {
      const response = await request(app)
        .put(`/api/v1/buildings/${testBuilding.id}/setting`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          promptpayNum: '0893334444',
          paymentQrUrl: 'https://example.com/updated-qr-c.png'
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.promptpayNum).toBe('0893334444');
      expect(response.body.data.paymentQrUrl).toBe('https://example.com/updated-qr-c.png');
    });

    test('GET /api/v1/rooms?buildingId=... - ฟิลเตอร์ห้องพักเฉพาะตึกที่เลือก', async () => {
      // Create room in test building
      testRoom = await billingService.prisma.room.create({
        data: {
          buildingId: testBuilding.id,
          roomNumber: 'C301',
          floor: 3,
          price: 5000,
          status: 'occupied',
          tenantId: testTenant.id
        }
      });

      const response = await request(app)
        .get(`/api/v1/rooms?buildingId=${testBuilding.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
      expect(response.body.data[0].roomNumber).toBe('C301');
      expect(response.body.data[0].building.name).toBe('อาคาร C (East Wing)');
    });
  });

  describe('LIFF Contextual Settings Endpoint (/api/settings & /api/v1/liff/settings)', () => {
    test('GET /api/settings - ค้นหาตึกของลูกบ้านตาม lineUserId แล้วส่ง BuildingSetting ของตึกนั้น', async () => {
      const response = await request(app)
        .get(`/api/settings?lineUserId=U_BUILDING_TEST_001`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.buildingId).toBe(testBuilding.id);
      expect(response.body.data.buildingName).toBe('อาคาร C (East Wing)');
      expect(response.body.data.promptpayNum).toBe('0893334444');
      expect(response.body.data.paymentQrUrl).toBe('https://example.com/updated-qr-c.png');
    });
  });
});
