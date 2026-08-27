const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const auditService = require('../../src/services/auditService');
const billingService = require('../../src/services/billingService');

describe('Audit Log / Activity History Integration Tests (/api/admin/audit-logs)', () => {
  let superAdminToken;
  let managerToken;
  let superAdminUser;
  let managerUser;
  let testLogRecord;

  beforeAll(async () => {
    superAdminUser = await billingService.prisma.user.findUnique({
      where: { email: 'superadmin@dorm.com' }
    });
    managerUser = await billingService.prisma.user.findUnique({
      where: { email: 'manager@dorm.com' }
    });

    superAdminToken = authService.generateAccessToken(superAdminUser);
    managerToken = authService.generateAccessToken(managerUser);

    // Create a sample AuditLog record
    testLogRecord = await auditService.logAction({
      adminId: superAdminUser.id,
      action: 'UPDATE',
      entity: 'BUILDING_SETTING',
      entityId: 'test-building-id',
      oldValues: { electricRate: 7, waterRate: 18 },
      newValues: { electricRate: 8, waterRate: 20 }
    });
  });

  test('GET /api/admin/audit-logs - กรณีเป็น MANAGER ต้องถูกปฏิเสธด้วย HTTP 403 Forbidden', async () => {
    const response = await request(app)
      .get('/api/admin/audit-logs')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(response.statusCode).toBe(403);
  });

  test('GET /api/admin/audit-logs - กรณีเป็น OWNER / super_admin ต้องดึงข้อมูลได้สำเร็จ (200 OK)', async () => {
    const response = await request(app)
      .get('/api/admin/audit-logs')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.meta).toHaveProperty('total');
    expect(response.body.meta).toHaveProperty('totalPages');
  });

  test('GET /api/admin/audit-logs?entity=BUILDING_SETTING - กรองข้อมูลตาม entity สำเร็จ', async () => {
    const response = await request(app)
      .get('/api/admin/audit-logs?entity=BUILDING_SETTING')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.length).toBeGreaterThan(0);
    expect(response.body.data[0].entity).toBe('BUILDING_SETTING');
    expect(response.body.data[0].oldValues).toEqual({ electricRate: 7, waterRate: 18 });
    expect(response.body.data[0].newValues).toEqual({ electricRate: 8, waterRate: 20 });
  });
});
