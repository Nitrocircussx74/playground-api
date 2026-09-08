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

  describe('POST /api/v1/liff/auth/verify-phone', () => {
    test('กรณีเบอร์โทรศัพท์ไม่มีในระบบ ควรส่งคืน 404 Not Found', async () => {
      const response = await request(app)
        .post('/api/v1/liff/auth/verify-phone')
        .set('X-Line-Id-Token', 'U_test_verify_phone_not_found')
        .send({ phone: '0999999999' });

      expect(response.statusCode).toBe(404);
      expect(response.body.success).toBe(false);
    });

    test('กรณีส่งเบอร์โทรศัพท์ที่ถูกต้อง ควรจับคู่ผู้เช่าและบันทึก LINE Profile สำเร็จ (200 OK)', async () => {
      if (!testTenant || !testTenant.phone) return;

      const newUid = `U_verified_phone_${Date.now()}`;
      const response = await request(app)
        .post('/api/v1/liff/auth/verify-phone')
        .set('X-Line-Id-Token', newUid)
        .send({
          phone: testTenant.phone,
          lineDisplayName: 'Test Phone Verified Tenant',
          linePictureUrl: 'https://example.com/phone_avatar.png'
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.tenant.id).toBe(testTenant.id);
      expect(response.body.data.tenant.lineUserId).toBe(newUid);
      expect(response.body.data.tenant.lineDisplayName).toBe('Test Phone Verified Tenant');

      // Restore testTenant lineUserId
      await billingService.prisma.tenant.update({
        where: { id: testTenant.id },
        data: { lineUserId: testTenant.lineUserId, lineDisplayName: testTenant.lineDisplayName }
      });
    });
  });

  describe('POST /api/v1/liff/auth/silent-login (Silent Re-Authentication)', () => {
    test('กรณีไม่ส่ง LINE ID Token ต้องส่งคืน 401 Unauthorized', async () => {
      const response = await request(app)
        .post('/api/v1/liff/auth/silent-login')
        .send({});

      expect(response.statusCode).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('กรณี LINE ID Token ไม่ตรงกับ Tenant ใดเลย ต้องส่งคืน 404 Not Found', async () => {
      const response = await request(app)
        .post('/api/v1/liff/auth/silent-login')
        .send({ lineIdToken: 'U_completely_non_existent_tenant_99999' });

      expect(response.statusCode).toBe(404);
      expect(response.body.success).toBe(false);
    });

    test('กรณีส่ง LINE ID Token ของผู้เช่าที่ถูกต้อง ต้องออก Backend JWT ใหม่สำเร็จ (200 OK)', async () => {
      if (!testTenant || !testTenant.lineUserId) return;

      const response = await request(app)
        .post('/api/v1/liff/auth/silent-login')
        .send({
          lineIdToken: testTenant.lineUserId,
          lineDisplayName: testTenant.lineDisplayName || 'Silent Reauth Tenant'
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.accessToken).toBeDefined();
      expect(response.body.data.tenant.id).toBe(testTenant.id);

      // ทดสอบนำ JWT ที่ได้ไปยิง endpoint อื่นเพื่อยืนยันว่า JWT ใช้งานได้จริง
      const profileRes = await request(app)
        .get('/api/v1/liff/profile')
        .set('Authorization', `Bearer ${response.body.accessToken}`);

      expect(profileRes.statusCode).toBe(200);
      expect(profileRes.body.success).toBe(true);
    });
  });
});
