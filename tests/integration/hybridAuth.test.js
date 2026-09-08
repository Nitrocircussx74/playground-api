const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');
const bcrypt = require('bcryptjs');

describe('Hybrid Authentication (LINE SSO + Local Password) Integration Tests', () => {
  let testTenant;
  let tenantToken;
  const testPhone = '0899998877';
  const testPassword = 'SecurePassword123!';

  beforeAll(async () => {
    // Create or find a test tenant for hybrid authentication testing
    testTenant = await billingService.prisma.tenant.findFirst({
      where: { phone: testPhone }
    });

    if (!testTenant) {
      testTenant = await billingService.prisma.tenant.create({
        data: {
          firstName: 'ไฮบริด',
          lastName: 'ออธ',
          phone: testPhone,
          lineUserId: 'U_hybrid_test_user_line_123',
          passwordHash: null // Initially null to test PASSWORD_NOT_SET flow
        }
      });
    } else {
      testTenant = await billingService.prisma.tenant.update({
        where: { id: testTenant.id },
        data: {
          lineUserId: 'U_hybrid_test_user_line_123',
          passwordHash: null
        }
      });
    }

    // Generate tenant token for authenticated setup-password testing
    tenantToken = authService.generateAccessToken({
      id: testTenant.id,
      role: 'TENANT',
      phone: testTenant.phone,
      tenantId: testTenant.id
    });
  });

  afterAll(async () => {
    if (testTenant) {
      await billingService.prisma.tenant.deleteMany({
        where: { phone: testPhone }
      });
    }
  });

  describe('POST /api/auth/login/local', () => {
    test('กรณีเบอร์โทรยังไม่ได้ตั้งรหัสผ่าน ต้องส่งข้อความแจ้งเตือน (400 PASSWORD_NOT_SET)', async () => {
      const response = await request(app)
        .post('/api/auth/login/local')
        .send({
          phoneNumber: testPhone,
          password: testPassword
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('PASSWORD_NOT_SET');
    });

    test('กรณีไม่ระบุข้อมูลครบถ้วน ต้องแจ้งเตือน 400 Bad Request', async () => {
      const response = await request(app)
        .post('/api/auth/login/local')
        .send({
          phoneNumber: testPhone
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('กรณีระบุเบอร์โทรที่ไม่พบในระบบ ต้องแจ้งเตือน 401 Unauthorized', async () => {
      const response = await request(app)
        .post('/api/auth/login/local')
        .send({
          phoneNumber: '0999999999',
          password: 'anyPassword123'
        });

      expect(response.statusCode).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/setup-password', () => {
    test('กรณีไม่มี Token ยืนยันตัวตน ต้องปฏิเสธ 401 Unauthorized', async () => {
      const response = await request(app)
        .post('/api/auth/setup-password')
        .send({
          newPassword: testPassword
        });

      expect(response.statusCode).toBe(401);
    });

    test('กรณีระบุรหัสผ่านสั้นกว่า 6 ตัวอักษร ต้องปฏิเสธ 400 Bad Request', async () => {
      const response = await request(app)
        .post('/api/auth/setup-password')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({
          newPassword: '123'
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('ลูกบ้านตั้งค่ารหัสผ่านใหม่สำเร็จ (200 OK)', async () => {
      const response = await request(app)
        .post('/api/auth/setup-password')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({
          newPassword: testPassword
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify DB has hashed password
      const updated = await billingService.prisma.tenant.findUnique({
        where: { id: testTenant.id }
      });
      expect(updated.passwordHash).toBeDefined();
      expect(updated.passwordHash).not.toBe(testPassword);
      const isMatch = await bcrypt.compare(testPassword, updated.passwordHash);
      expect(isMatch).toBe(true);
    });
  });

  describe('POST /api/auth/login/local (After Password is Set)', () => {
    test('ล็อกอินด้วยรหัสผ่านที่ผิด ต้องปฏิเสธ 401 Unauthorized', async () => {
      const response = await request(app)
        .post('/api/auth/login/local')
        .send({
          phoneNumber: testPhone,
          password: 'WrongPassword!'
        });

      expect(response.statusCode).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('ล็อกอินด้วยเบอร์โทรศัพท์และรหัสผ่านที่ถูกต้อง สำเร็จและได้รับ JWT (200 OK)', async () => {
      const response = await request(app)
        .post('/api/auth/login/local')
        .send({
          phoneNumber: testPhone,
          password: testPassword
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.phone).toBe(testPhone);
    });
  });
});
