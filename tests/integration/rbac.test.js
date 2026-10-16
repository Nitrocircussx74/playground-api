const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const prisma = require('../../src/config/prisma');

describe('Role-Based Access Control (RBAC) Integration Tests', () => {
  let adminToken;
  let tenantToken;

  const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
  const TENANT_ID = '00000000-0000-0000-0000-000000000002';

  beforeAll(async () => {
    // Token ถูกยืนยันกับ DB ทุก Request (role ล่าสุด/บัญชีต้องมีอยู่จริง) จึงต้องมีแถวใน users
    await prisma.user.upsert({
      where: { id: ADMIN_ID },
      update: { role: 'admin' },
      create: { id: ADMIN_ID, email: 'rbac_admin@test.com', name: 'Admin User', role: 'admin', passwordHash: 'x' }
    });
    await prisma.user.upsert({
      where: { id: TENANT_ID },
      update: { role: 'tenant' },
      create: { id: TENANT_ID, email: 'rbac_tenant@test.com', name: 'Tenant User', role: 'tenant', passwordHash: 'x' }
    });

    adminToken = authService.generateAccessToken({ id: ADMIN_ID, email: 'admin@test.com', name: 'Admin User', role: 'admin' });
    tenantToken = authService.generateAccessToken({ id: TENANT_ID, email: 'tenant@test.com', name: 'Tenant User', role: 'tenant' });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: [ADMIN_ID, TENANT_ID] } } });
  });

  describe('Admin-only Protected Endpoints Authorization Checks', () => {
    test('GET /api/v1/dashboard/summary - กรณีเป็น Tenant ต้องถูกปฏิเสธด้วย HTTP 403 Forbidden', async () => {
      const response = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Authorization', `Bearer ${tenantToken}`);

      expect(response.statusCode).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('ปฏิเสธการเข้าถึง');
    });

    test('GET /api/v1/dashboard/summary - กรณีเป็น Admin ต้องผ่านด้วย HTTP 200 OK', async () => {
      const response = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('PUT /api/v1/features/:key - กรณีเป็น Tenant สับสวิตช์ฟีเจอร์ ต้องถูกปฏิเสธด้วย HTTP 403 Forbidden', async () => {
      const response = await request(app)
        .put('/api/v1/features/ENABLE_LINE_PAYMENT')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ isActive: true });

      expect(response.statusCode).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('POST /api/v1/meter-records - กรณีเป็น Tenant บันทึกเลขมิเตอร์ ต้องถูกปฏิเสธด้วย HTTP 403 Forbidden', async () => {
      const response = await request(app)
        .post('/api/v1/meter-records')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({ roomId: 'test', meterType: 'water', currentReading: 100 });

      expect(response.statusCode).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });
});
