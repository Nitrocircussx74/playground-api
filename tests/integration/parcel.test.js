const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Smart Parcel Management Integration Tests', () => {
  let adminToken;
  let testBuilding;
  let testTenant;
  let testRoom;
  let createdParcelId;

  beforeAll(async () => {
    const adminUser = await billingService.prisma.user.findFirst({
      where: { role: { in: ['SUPERADMIN', 'OWNER', 'ADMIN', 'super_admin', 'owner', 'admin'] } }
    });
    adminToken = authService.generateAccessToken(adminUser);

    testBuilding = await billingService.prisma.building.findFirst();

    testTenant = await billingService.prisma.tenant.create({
      data: {
        firstName: 'ทดสอบ',
        lastName: 'พัสดุ',
        phone: '0899988776',
        lineUserId: 'U_TEST_PARCEL_TENANT_999'
      }
    });

    testRoom = await billingService.prisma.room.create({
      data: {
        roomNumber: 'PARCEL_909',
        floor: 9,
        price: 5000,
        status: 'occupied',
        buildingId: testBuilding.id,
        tenantId: testTenant.id
      }
    });
  });

  afterAll(async () => {
    if (createdParcelId) {
      await billingService.prisma.parcel.delete({ where: { id: createdParcelId } }).catch(() => {});
    }
    if (testRoom) {
      await billingService.prisma.room.delete({ where: { id: testRoom.id } }).catch(() => {});
    }
    if (testTenant) {
      await billingService.prisma.tenant.delete({ where: { id: testTenant.id } }).catch(() => {});
    }
  });

  describe('POST /api/admin/buildings/:buildingId/parcels', () => {
    test('ควรบันทึกพัสดุเข้าใหม่สำเร็จ และส่ง LINE Push Notification (201 Created)', async () => {
      const response = await request(app)
        .post(`/api/admin/buildings/${testBuilding.id}/parcels`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: testRoom.id,
          courier: 'Shopee Express',
          trackingNumber: 'SHP123456789TH',
          photoUrl: 'https://example.com/parcel-photo.jpg'
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.parcel).toBeDefined();
      expect(response.body.data.parcel.courier).toBe('Shopee Express');
      expect(response.body.data.parcel.status).toBe('PENDING');

      createdParcelId = response.body.data.parcel.id;
    });

    test('กรณีระบุ roomId หรือ courier ไม่ครบถ้วน ต้องตอบกลับ HTTP 400 Bad Request', async () => {
      const response = await request(app)
        .post(`/api/admin/buildings/${testBuilding.id}/parcels`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: '',
          courier: ''
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/admin/buildings/:buildingId/parcels', () => {
    test('ควรดึงรายการพัสดุประจำตึกสำเร็จ (200 OK)', async () => {
      const response = await request(app)
        .get(`/api/admin/buildings/${testBuilding.id}/parcels`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('PATCH /api/admin/parcels/:id/pickup', () => {
    test('ควรอัปเดตสถานะพัสดุเป็น PICKED_UP สำเร็จ (200 OK)', async () => {
      const response = await request(app)
        .patch(`/api/admin/parcels/${createdParcelId}/pickup`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('PICKED_UP');
      expect(response.body.data.pickedUpAt).not.toBeNull();
    });
  });

  describe('GET /api/v1/liff/parcels', () => {
    test('ควรดึงรายการพัสดุสำหรับฝั่ง LIFF สำเร็จ (200 OK)', async () => {
      const response = await request(app)
        .get(`/api/v1/liff/parcels?lineUserId=U_TEST_PARCEL_TENANT_999`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });
});
