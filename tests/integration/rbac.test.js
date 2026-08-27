const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');

describe('Role-Based Access Control (RBAC) Integration Tests', () => {
  let adminToken;
  let tenantToken;

  beforeAll(() => {
    adminToken = authService.generateAccessToken({
      id: '00000000-0000-0000-0000-000000000001',
      email: 'admin@test.com',
      name: 'Admin User',
      role: 'admin'
    });

    tenantToken = authService.generateAccessToken({
      id: '00000000-0000-0000-0000-000000000002',
      email: 'tenant@test.com',
      name: 'Tenant User',
      role: 'tenant'
    });
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
