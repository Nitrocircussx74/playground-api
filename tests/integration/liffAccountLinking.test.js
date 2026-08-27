const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Account Linking & Onboarding Integration Tests', () => {
  let adminToken;
  let testTenant;
  let generatedInviteCode;

  beforeAll(async () => {
    const adminUser = await billingService.prisma.user.findFirst({
      where: { role: { in: ['SUPERADMIN', 'OWNER', 'ADMIN', 'super_admin', 'owner', 'admin'] } }
    });
    adminToken = authService.generateAccessToken(adminUser);

    testTenant = await billingService.prisma.tenant.findFirst();
  });

  describe('POST /api/admin/tenants/:id/generate-invite', () => {
    test('แอดมินสร้างรหัสเชิญ 6 หลักสำเร็จ (200 OK)', async () => {
      if (!testTenant) return;

      const response = await request(app)
        .post(`/api/admin/tenants/${testTenant.id}/generate-invite`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.inviteCode).toBeDefined();
      expect(response.body.data.inviteCode.length).toBe(6);

      generatedInviteCode = response.body.data.inviteCode;
    });
  });

  describe('POST /api/v1/liff/auth/link-account', () => {
    test('กรณีใส่รหัสเชิญผิด ต้องปฏิเสธ 400 Bad Request', async () => {
      const response = await request(app)
        .post('/api/v1/liff/auth/link-account')
        .send({
          inviteCode: 'WRONG99',
          phoneLast4: '1234'
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('รหัสเชิญไม่ถูกต้อง');
    });

    test('กรณีใส่เบอร์โทร 4 ตัวท้ายผิด ต้องปฏิเสธ 400 Bad Request', async () => {
      if (!generatedInviteCode) return;

      const response = await request(app)
        .post('/api/v1/liff/auth/link-account')
        .send({
          inviteCode: generatedInviteCode,
          phoneLast4: '0000'
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('เบอร์โทรศัพท์ 4 ตัวท้ายไม่ตรง');
    });

    test('กรณีใส่ข้อมูลถูกต้องทั้งหมด ต้องผูกบัญชีสำเร็จและล้างรหัสเชิญออก (200 OK)', async () => {
      if (!generatedInviteCode || !testTenant) return;

      const phoneLast4 = testTenant.phone.trim().slice(-4);
      const testLineUserId = 'U_test_account_link_999';

      const response = await request(app)
        .post('/api/v1/liff/auth/link-account')
        .send({
          inviteCode: generatedInviteCode,
          phoneLast4,
          lineUserId: testLineUserId
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.tenant.lineUserId).toBe(testLineUserId);

      // Verify Prisma clears inviteCode
      const recheckedTenant = await billingService.prisma.tenant.findUnique({
        where: { id: testTenant.id }
      });
      expect(recheckedTenant.inviteCode).toBeNull();
    });
  });
});
