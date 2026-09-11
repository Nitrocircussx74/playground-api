const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Vehicle/Visitor Integration Tests', () => {
  let adminToken;
  let testBuilding;
  let testTenant;
  let testRoom;
  let otherTenant;
  let otherRoom;
  let createdVehicleId;
  let rejectedVehicleId;
  let createdVisitorId;

  beforeAll(async () => {
    const adminUser = await billingService.prisma.user.findFirst({
      where: { role: { in: ['SUPERADMIN', 'OWNER', 'ADMIN', 'super_admin', 'owner', 'admin'] } }
    });
    adminToken = authService.generateAccessToken(adminUser);

    testBuilding = await billingService.prisma.building.findFirst();

    testTenant = await billingService.prisma.tenant.create({
      data: { firstName: 'ทดสอบ', lastName: 'รถ', phone: '0899988201', lineUserId: 'U_TEST_VEHICLE_TENANT_999' }
    });
    testRoom = await billingService.prisma.room.create({
      data: { roomNumber: 'VEH_909', floor: 9, price: 5000, status: 'occupied', buildingId: testBuilding.id, tenantId: testTenant.id }
    });

    otherTenant = await billingService.prisma.tenant.create({
      data: { firstName: 'คนอื่น', lastName: 'รถ', phone: '0899988202', lineUserId: 'U_TEST_VEHICLE_TENANT_OTHER' }
    });
    otherRoom = await billingService.prisma.room.create({
      data: { roomNumber: 'VEH_910', floor: 9, price: 5000, status: 'occupied', buildingId: testBuilding.id, tenantId: otherTenant.id }
    });
  });

  afterAll(async () => {
    await billingService.prisma.vehicle.deleteMany({ where: { tenantId: { in: [testTenant.id, otherTenant.id] } } }).catch(() => {});
    await billingService.prisma.visitor.deleteMany({ where: { tenantId: { in: [testTenant.id, otherTenant.id] } } }).catch(() => {});
    for (const room of [testRoom, otherRoom]) {
      if (room) await billingService.prisma.room.delete({ where: { id: room.id } }).catch(() => {});
    }
    for (const tenant of [testTenant, otherTenant]) {
      if (tenant) await billingService.prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
    }
  });

  describe('POST /api/v1/liff/vehicles', () => {
    test('ลูกบ้านลงทะเบียนรถควรได้สถานะ PENDING (201 Created)', async () => {
      const response = await request(app)
        .post('/api/v1/liff/vehicles')
        .set('X-Line-Id-Token', 'U_TEST_VEHICLE_TENANT_999')
        .send({ licensePlate: 'กข-1234', vehicleType: 'car', brand: 'Toyota' });

      expect(response.statusCode).toBe(201);
      expect(response.body.data.status).toBe('PENDING');
      createdVehicleId = response.body.data.id;
    });
  });

  describe('GET /api/v1/liff/vehicles/mine', () => {
    test('ลูกบ้านควรเห็นรถของตัวเอง (200 OK)', async () => {
      const response = await request(app)
        .get('/api/v1/liff/vehicles/mine')
        .set('X-Line-Id-Token', 'U_TEST_VEHICLE_TENANT_999');

      expect(response.statusCode).toBe(200);
      expect(response.body.data.some((v) => v.id === createdVehicleId)).toBe(true);
    });
  });

  describe('GET /api/admin/buildings/:buildingId/vehicles', () => {
    test('แอดมินควรเห็นรายการรถทั้งหมดของตึก (200 OK)', async () => {
      const response = await request(app)
        .get(`/api/admin/buildings/${testBuilding.id}/vehicles`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.data.some((v) => v.id === createdVehicleId)).toBe(true);
    });
  });

  describe('PATCH /api/admin/vehicles/:id/approve', () => {
    test('แอดมินอนุมัติรถ ควรได้สถานะ APPROVED และมี NotificationLog (200 OK)', async () => {
      const response = await request(app)
        .patch(`/api/admin/vehicles/${createdVehicleId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.data.status).toBe('APPROVED');

      const log = await billingService.prisma.notificationLog.findFirst({
        where: { notificationType: 'VEHICLE', tenantId: testTenant.id },
        orderBy: { sentAt: 'desc' }
      });
      expect(log).not.toBeNull();
    });
  });

  describe('PATCH /api/admin/vehicles/:id/reject', () => {
    test('แอดมินปฏิเสธรถอีกคันหนึ่ง ควรได้สถานะ REJECTED (200 OK)', async () => {
      const vehicle = await billingService.prisma.vehicle.create({
        data: { buildingId: testBuilding.id, tenantId: otherTenant.id, licensePlate: 'งจ-5678', vehicleType: 'motorcycle' }
      });
      rejectedVehicleId = vehicle.id;

      const response = await request(app)
        .patch(`/api/admin/vehicles/${rejectedVehicleId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.data.status).toBe('REJECTED');
    });
  });

  describe('POST /api/v1/liff/visitors', () => {
    test('ลูกบ้านแจ้งแขกล่วงหน้าควรสำเร็จ (201 Created)', async () => {
      const response = await request(app)
        .post('/api/v1/liff/visitors')
        .set('X-Line-Id-Token', 'U_TEST_VEHICLE_TENANT_999')
        .send({ visitorName: 'เพื่อนมาเยี่ยม', expectedDate: new Date(Date.now() + 86400000).toISOString() });

      expect(response.statusCode).toBe(201);
      createdVisitorId = response.body.data.id;
    });

    test('ลูกบ้านควรเห็นแขกของตัวเอง (200 OK)', async () => {
      const response = await request(app)
        .get('/api/v1/liff/visitors/mine')
        .set('X-Line-Id-Token', 'U_TEST_VEHICLE_TENANT_999');

      expect(response.statusCode).toBe(200);
      expect(response.body.data.some((v) => v.id === createdVisitorId)).toBe(true);
    });
  });

  describe('GET /api/admin/buildings/:buildingId/visitors', () => {
    test('แอดมินควรเห็นรายชื่อแขกทั้งตึก ไม่จำกัด role (200 OK)', async () => {
      const response = await request(app)
        .get(`/api/admin/buildings/${testBuilding.id}/visitors`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.data.some((v) => v.id === createdVisitorId)).toBe(true);
    });
  });

  describe('IDOR: เข้าถึงข้อมูลของคนอื่นไม่ได้', () => {
    test('ลบรถของคนอื่นไม่ได้ (404)', async () => {
      const response = await request(app)
        .delete(`/api/v1/liff/vehicles/${rejectedVehicleId}`)
        .set('X-Line-Id-Token', 'U_TEST_VEHICLE_TENANT_999');

      expect(response.statusCode).toBe(404);
    });

    test('ลบแขกของคนอื่นไม่ได้ (404)', async () => {
      const response = await request(app)
        .delete(`/api/v1/liff/visitors/${createdVisitorId}`)
        .set('X-Line-Id-Token', 'U_TEST_VEHICLE_TENANT_OTHER');

      expect(response.statusCode).toBe(404);
    });
  });
});
