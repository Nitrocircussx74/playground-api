const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const prisma = require('../../src/config/prisma');

describe('E-Contract PDF & Rental Agreement Integration Tests', () => {
  let adminToken;
  let adminUser;
  let testLease;
  let testTenant;
  let tenantToken;

  beforeAll(async () => {
    adminUser = await prisma.user.findFirst({
      where: { role: { in: ['admin', 'superadmin'] } }
    });
    testLease = await prisma.leaseContract.findFirst({
      include: { tenant: true, room: true, building: true }
    });

    adminToken = authService.generateAccessToken(adminUser);

    if (testLease?.tenant) {
      testTenant = testLease.tenant;
      tenantToken = authService.generateAccessToken({
        id: testTenant.id,
        tenantId: testTenant.id,
        role: 'tenant',
        name: `${testTenant.firstName} ${testTenant.lastName}`,
        phone: testTenant.phone
      });
    }
  });

  describe('GET /api/admin/leases/:leaseId/contract', () => {
    test('กรณีเป็น Admin ต้องดึงรายละเอียดสัญญาเช่าฉบับสมบูรณ์สำเร็จ (200 OK)', async () => {
      if (!testLease) return;

      const res = await request(app)
        .get(`/api/admin/leases/${testLease.id}/contract`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testLease.id);
      expect(res.body.data.room).toBeDefined();
      expect(res.body.data.tenant).toBeDefined();
      expect(res.body.data.building).toBeDefined();
    });

    test('กรณีระบุ leaseId ที่ไม่มีอยู่จริง ต้องตอบ 404 Not Found', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/api/admin/leases/${nonExistentId}/contract`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/liff/contract', () => {
    test('กรณีเป็น Tenant ที่มี Active Lease ต้องดึงสัญญาของตนเองสำเร็จ (200 OK)', async () => {
      if (!testTenant || !tenantToken) return;

      const res = await request(app)
        .get('/api/v1/liff/contract')
        .set('Authorization', `Bearer ${tenantToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      if (res.body.data) {
        expect(res.body.data.room).toBeDefined();
        expect(res.body.data.building).toBeDefined();
        expect(res.body.data.tenant.firstName).toBe(testTenant.firstName);
      }
    });
  });
});
