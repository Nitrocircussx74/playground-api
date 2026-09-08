const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');
const bcrypt = require('bcryptjs');

describe('Admin Tenant Security & Access Management Integration Tests', () => {
  let adminToken;
  let tenantToken;
  let testTenant;

  beforeAll(async () => {
    // 1. Get Admin User & generate Token
    const adminUser = await billingService.prisma.user.findFirst({
      where: { role: { in: ['SUPERADMIN', 'OWNER', 'ADMIN', 'super_admin', 'owner', 'admin'] } }
    });
    adminToken = authService.generateAccessToken(adminUser);

    // 2. Get/Create a test tenant with PIN and LINE ID
    testTenant = await billingService.prisma.tenant.findFirst();
    if (!testTenant) {
      testTenant = await billingService.prisma.tenant.create({
        data: {
          firstName: 'Security',
          lastName: 'TestUser',
          phone: '0899998888',
          lineUserId: 'U_sec_test_9999',
          lineDisplayName: 'Sec LINE Test',
          linePictureUrl: 'https://example.com/sec.jpg',
          pinHash: bcrypt.hashSync('123456', 10)
        }
      });
    } else {
      testTenant = await billingService.prisma.tenant.update({
        where: { id: testTenant.id },
        data: {
          lineUserId: 'U_sec_test_9999',
          lineDisplayName: 'Sec LINE Test',
          linePictureUrl: 'https://example.com/sec.jpg',
          pinHash: bcrypt.hashSync('123456', 10)
        }
      });
    }

    // Token for non-admin tenant user to test 403 Forbidden
    tenantToken = authService.generateAccessToken({ id: testTenant.id, role: 'TENANT' });
  });

  describe('POST /api/admin/tenants/:id/reset-pin', () => {
    test('กรณีเป็น Tenant ต้องถูกปฏิเสธด้วย HTTP 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/api/admin/tenants/${testTenant.id}/reset-pin`)
        .set('Authorization', `Bearer ${tenantToken}`);

      expect(res.statusCode).toBe(403);
    });

    test('แอดมินรีเซ็ตรหัส PIN ของผู้เช่าสำเร็จ (200 OK) และ pin_hash กลายเป็น null', async () => {
      const res = await request(app)
        .post(`/api/admin/tenants/${testTenant.id}/reset-pin`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hasPin).toBe(false);

      const dbTenant = await billingService.prisma.tenant.findUnique({
        where: { id: testTenant.id }
      });
      expect(dbTenant.pinHash).toBeNull();
    });
  });

  describe('POST /api/admin/tenants/:id/unlink-line', () => {
    test('กรณีเป็น Tenant ต้องถูกปฏิเสธด้วย HTTP 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/api/admin/tenants/${testTenant.id}/unlink-line`)
        .set('Authorization', `Bearer ${tenantToken}`);

      expect(res.statusCode).toBe(403);
    });

    test('แอดมินยกเลิกการผูก LINE ของผู้เช่าสำเร็จ (200 OK) ล้างค่า LINE และ PIN ทั้งหมด', async () => {
      const res = await request(app)
        .post(`/api/admin/tenants/${testTenant.id}/unlink-line`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.lineUserId).toBeNull();
      expect(res.body.data.hasPin).toBe(false);

      const dbTenant = await billingService.prisma.tenant.findUnique({
        where: { id: testTenant.id }
      });
      expect(dbTenant.lineUserId).toBeNull();
      expect(dbTenant.lineDisplayName).toBeNull();
      expect(dbTenant.pinHash).toBeNull();
    });
  });

  describe('POST /api/admin/tenants/:id/generate-invite', () => {
    test('แอดมินสร้างรหัสเชิญ 6 หลักใหม่สำเร็จ (200 OK)', async () => {
      const res = await request(app)
        .post(`/api/admin/tenants/${testTenant.id}/generate-invite`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.inviteCode).toBeDefined();
      expect(res.body.data.inviteCode.length).toBe(6);
      expect(res.body.data.inviteExpiresAt).toBeDefined();

      const dbTenant = await billingService.prisma.tenant.findUnique({
        where: { id: testTenant.id }
      });
      expect(dbTenant.inviteCode).toBe(res.body.data.inviteCode);
    });
  });
});
