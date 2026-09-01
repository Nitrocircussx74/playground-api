const request = require('supertest');
const app = require('../../src/app');
const billingService = require('../../src/services/billingService');

describe('LINE Rich Menu & LIFF Smart Entry Router Integration Tests', () => {
  let testTenant;

  beforeAll(async () => {
    testTenant = await billingService.prisma.tenant.findFirst({
      where: { lineUserId: { not: null } }
    });
  });

  describe('GET /api/v1/liff/check-status', () => {
    test('กรณีไม่แนบ LINE ID Token ต้องถูกปฏิเสธ 401 Unauthorized', async () => {
      const response = await request(app).get('/api/v1/liff/check-status');

      expect(response.statusCode).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('กรณีแนบ LINE ID Token ของผู้ใช้ที่ยังไม่เคยลงทะเบียน ต้องส่งคืน isRegistered: false (200 OK)', async () => {
      const response = await request(app)
        .get('/api/v1/liff/check-status')
        .set('X-Line-Id-Token', 'U_unregistered_test_123456');

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.isRegistered).toBe(false);
      expect(response.body.data).toBeNull();
    });

    test('กรณีแนบ LINE ID Token ของผู้เช่าที่มีสัญญาในระบบ ต้องส่งคืน isRegistered: true พร้อมข้อมูลผู้เช่าและห้อง (200 OK)', async () => {
      if (!testTenant) return;

      const response = await request(app)
        .get('/api/v1/liff/check-status')
        .set('X-Line-Id-Token', testTenant.lineUserId);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.isRegistered).toBe(true);
      expect(response.body.data.tenant).toBeDefined();
      expect(response.body.data.tenant.lineUserId).toBe(testTenant.lineUserId);
    });
  });
});
