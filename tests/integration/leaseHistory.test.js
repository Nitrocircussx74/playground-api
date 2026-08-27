const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Contract-Based Tenancy & Lease History Integration Tests', () => {
  let adminToken;
  let testBuilding;
  let testTenant;
  let testRoom;
  let testLeaseId;

  beforeAll(async () => {
    const adminUser = await billingService.prisma.user.findFirst({
      where: { role: { in: ['SUPERADMIN', 'OWNER', 'ADMIN', 'super_admin', 'owner', 'admin'] } }
    });
    adminToken = authService.generateAccessToken(adminUser);

    testBuilding = await billingService.prisma.building.findFirst();

    testTenant = await billingService.prisma.tenant.create({
      data: {
        firstName: 'ทดสอบ',
        lastName: 'สัญญาเช่า',
        phone: '0812349999'
      }
    });

    testRoom = await billingService.prisma.room.create({
      data: {
        roomNumber: 'LEASE_707',
        floor: 7,
        price: 5200,
        status: 'vacant',
        buildingId: testBuilding.id
      }
    });
  });

  afterAll(async () => {
    if (testLeaseId) {
      await billingService.prisma.leaseContract.delete({ where: { id: testLeaseId } }).catch(() => {});
    }
    if (testRoom) {
      await billingService.prisma.room.delete({ where: { id: testRoom.id } }).catch(() => {});
    }
    if (testTenant) {
      await billingService.prisma.tenant.delete({ where: { id: testTenant.id } }).catch(() => {});
    }
  });

  describe('POST /api/admin/rooms/:roomId/leases', () => {
    test('ควรสร้างสัญญาเช่าใหม่ และอัปเดตสถานะห้องเป็น occupied (201 Created)', async () => {
      const response = await request(app)
        .post(`/api/admin/rooms/${testRoom.id}/leases`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          tenantId: testTenant.id,
          startDate: '2026-01-01',
          expectedEndDate: '2026-12-31',
          depositAmount: 5000,
          adminNote: 'สัญญาเช่า 1 ปี เงินมัดจำ 5,000 บาท'
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('ACTIVE');
      expect(response.body.data.depositAmount).toBe('5000');

      testLeaseId = response.body.data.id;

      // Verify room status updated
      const updatedRoom = await billingService.prisma.room.findUnique({ where: { id: testRoom.id } });
      expect(updatedRoom.status).toBe('occupied');
      expect(updatedRoom.tenantId).toBe(testTenant.id);
    });
  });

  describe('GET /api/admin/rooms/:roomId/history', () => {
    test('ควรดึงประวัติสัญญาเช่าของห้องพักสำเร็จ (200 OK)', async () => {
      const response = await request(app)
        .get(`/api/admin/rooms/${testRoom.id}/history`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/admin/tenants/:tenantId/history', () => {
    test('ควรดึงประวัติสัญญาเช่าของผู้เช่าคนนี้สำเร็จ (200 OK)', async () => {
      const response = await request(app)
        .get(`/api/admin/tenants/${testTenant.id}/history`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('POST /api/admin/leases/:leaseId/terminate', () => {
    test('ควรดำเนินการแจ้งย้ายออก อัปเดตสถานะสัญญาเป็น ENDED และคืนห้องว่าง (200 OK)', async () => {
      const response = await request(app)
        .post(`/api/admin/leases/${testLeaseId}/terminate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          actualEndDate: '2026-08-31',
          moveOutReason: 'สิ้นสุดสัญญาตามกำหนด',
          adminNote: 'คืนมัดจำเรียบร้อย หักค่าน้ำไฟคงค้าง 500 บาท'
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('ENDED');
      expect(response.body.data.moveOutReason).toBe('สิ้นสุดสัญญาตามกำหนด');

      // Verify room status reset to vacant
      const updatedRoom = await billingService.prisma.room.findUnique({ where: { id: testRoom.id } });
      expect(updatedRoom.status).toBe('vacant');
      expect(updatedRoom.tenantId).toBeNull();
    });
  });
});
