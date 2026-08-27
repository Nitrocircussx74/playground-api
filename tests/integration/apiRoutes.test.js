const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');

describe('Full API Integration Tests (ทดสอบ Endpoints ทั้งหมดในระบบ)', () => {
  let validAccessToken;
  let refreshTokenCookie;

  beforeAll(() => {
    const mockUser = {
      id: 1,
      email: 'integration@test.com',
      name: 'Integration Test User',
      role: 'tester'
    };
    validAccessToken = authService.generateAccessToken(mockUser);
  });

  // -------------------------------------------------------------
  // 1. Health Check Endpoint
  // -------------------------------------------------------------
  describe('GET / (Health Check)', () => {
    test('ควรส่งคืน HTTP 200 OK พร้อมสถานะการทำงานของเซิร์ฟเวอร์', async () => {
      const response = await request(app).get('/');

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('running smoothly');
    });
  });

  // -------------------------------------------------------------
  // 2. Auth Endpoints (/auth)
  // -------------------------------------------------------------
  describe('Authentication Endpoints (/auth)', () => {
    test('POST /auth/login - กรณีส่งข้อมูลไม่ครบถ้วน ต้องปฏิเสธด้วย HTTP 400 (Zod Validation Failed)', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'invalid-email' });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    test('POST /auth/login - กรณีส่งข้อมูลถูกต้อง ต้องออก Access Token (Body) และ Refresh Token (Cookie)', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'password123'
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.accessToken).toBeDefined();

      const cookies = response.headers['set-cookie'];
      expect(cookies).toBeDefined();
      refreshTokenCookie = cookies.find((c) => c.startsWith('refreshToken='));
      expect(refreshTokenCookie).toBeDefined();
    });

    test('GET /auth/me - กรณีไม่แนบ Access Token ต้องตอบกลับ HTTP 401 Unauthorized', async () => {
      const response = await request(app).get('/auth/me');

      expect(response.statusCode).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('GET /auth/me - กรณีแนบ Access Token ที่ถูกต้อง ต้องส่งคืน Profile HTTP 200 OK', async () => {
      const response = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${validAccessToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
    });

    test('POST /auth/refresh - กรณีไม่แนบ Cookie ต้องตอบกลับ HTTP 401 Unauthorized', async () => {
      const response = await request(app).post('/auth/refresh');

      expect(response.statusCode).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('POST /auth/refresh - กรณีแนบ Refresh Token Cookie ที่ถูกต้อง ต้องออก Access Token ใหม่', async () => {
      if (!refreshTokenCookie) return;

      const response = await request(app)
        .post('/auth/refresh')
        .set('Cookie', [refreshTokenCookie]);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.accessToken).toBeDefined();

      const cookies = response.headers['set-cookie'];
      if (cookies) {
        refreshTokenCookie = cookies.find((c) => c.startsWith('refreshToken='));
      }
    });

    test('POST /auth/logout - ออกจากระบบ -> เคลียร์ Cookie และเพิกถอน Token', async () => {
      const response = await request(app)
        .post('/auth/logout')
        .set('Cookie', refreshTokenCookie ? [refreshTokenCookie] : []);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 3. Feature Flag Endpoints (/api/v1/features)
  // -------------------------------------------------------------
  describe('Feature Flag Toggles (/api/v1/features)', () => {
    test('GET /api/v1/features - ดึงรายการ Feature Toggles ทั้งหมด', async () => {
      const response = await request(app).get('/api/v1/features');

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.featureMap).toBeDefined();
    });

    test('PUT /api/v1/features/:key - อัปเดตสถานะ Feature Toggle', async () => {
      const response = await request(app)
        .put('/api/v1/features/ENABLE_LINE_PAYMENT')
        .send({ isActive: true });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 4. LIFF Tenant Profile Endpoints (/api/v1/liff/profile)
  // -------------------------------------------------------------
  describe('LIFF Tenant Profile Endpoints (/api/v1/liff/profile)', () => {
    test('GET /api/v1/liff/profile - ดึงโปรไฟล์ลูกบ้าน', async () => {
      const response = await request(app).get('/api/v1/liff/profile');

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.firstName).toBeDefined();
    });

    test('PUT /api/v1/liff/profile - อัปเดตเบอร์โทรศัพท์ผิดรูปแบบ (ต้องปฏิเสธ 400)', async () => {
      const response = await request(app)
        .put('/api/v1/liff/profile')
        .send({ phone: '123' });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('PUT /api/v1/liff/profile - อัปเดตเบอร์โทรศัพท์ถูกต้อง (ต้องสำเร็จ 200)', async () => {
      const response = await request(app)
        .put('/api/v1/liff/profile')
        .send({ phone: '0898765432' });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.phone).toBe('0898765432');
    });
  });
});
