const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Admin User & Profile Management Integration Tests (/api/admin)', () => {
  let superAdminToken;
  let managerToken;
  let superAdminUser;
  let managerUser;
  let targetBuilding;

  beforeAll(async () => {
    superAdminUser = await billingService.prisma.user.findUnique({
      where: { email: 'superadmin@dorm.com' }
    });
    managerUser = await billingService.prisma.user.findUnique({
      where: { email: 'manager@dorm.com' }
    });
    targetBuilding = await billingService.prisma.building.findFirst();

    superAdminToken = authService.generateAccessToken(superAdminUser);
    managerToken = authService.generateAccessToken(managerUser);
  });

  describe('Profile Endpoints (/api/admin/me)', () => {
    test('GET /api/admin/me - ดึงข้อมูลโปรไฟล์ของตัวเองสำเร็จ (200 OK)', async () => {
      const response = await request(app)
        .get('/api/admin/me')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe(superAdminUser.email);
    });

    test('PUT /api/admin/me/password - กรณีใส่รหัสผ่านเดิมผิด ต้องปฏิเสธ 400 Bad Request', async () => {
      const response = await request(app)
        .put('/api/admin/me/password')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          currentPassword: 'wrong_password',
          newPassword: 'newpassword123'
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('ไม่ถูกต้อง');
    });

    test('PUT /api/admin/me/password - กรณีใส่รหัสผ่านเดิมถูกต้อง ต้องเปลี่ยนสำเร็จ (200 OK)', async () => {
      const response = await request(app)
        .put('/api/admin/me/password')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          currentPassword: 'password123',
          newPassword: 'password123' // reset back to password123
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('เรียบร้อย');
    });
  });

  describe('Admin User & Role Management Endpoints (/api/admin/users)', () => {
    test('GET /api/admin/users - กรณีเป็น MANAGER ต้องถูกปฏิเสธด้วย HTTP 403 Forbidden', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(response.statusCode).toBe(403);
    });

    test('GET /api/admin/users - กรณีเป็น OWNER / super_admin ต้องดึงรายชื่อได้สำเร็จ (200 OK)', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('POST & PUT & DELETE /api/admin/users - สร้าง Manager ใหม่, ผูกตึก, และลบสำเร็จ', async () => {
      const testEmail = 'new_test_manager@dorm.com';

      // Clean up if existing
      await billingService.prisma.user.deleteMany({ where: { email: testEmail } });

      // 1. Create New Manager
      const createRes = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Test Manager',
          email: testEmail,
          password: 'password123',
          role: 'MANAGER',
          buildingIds: [targetBuilding.id]
        });

      expect(createRes.statusCode).toBe(201);
      expect(createRes.body.data.role).toBe('MANAGER');
      expect(createRes.body.data.buildingPermissions.length).toBe(1);

      const createdUserId = createRes.body.data.id;

      // 2. Update Permissions (Change Role to OWNER)
      const updateRes = await request(app)
        .put(`/api/admin/users/${createdUserId}/permissions`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          role: 'OWNER',
          buildingIds: []
        });

      expect(updateRes.statusCode).toBe(200);
      expect(updateRes.body.data.role).toBe('OWNER');

      // 3. Delete User
      const deleteRes = await request(app)
        .delete(`/api/admin/users/${createdUserId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(deleteRes.statusCode).toBe(200);
      expect(deleteRes.body.success).toBe(true);
    });
  });
});
