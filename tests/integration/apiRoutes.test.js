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
        .send({ email: 'invalid-email' }); // ไม่มี password และ email ผิดรูป

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

      // ดึง Cookie ล่าสุดเก็บไว้ใช้ทดสอบ /auth/refresh และ /auth/logout
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

    test('POST /auth/refresh - กรณีแนบ Refresh Token Cookie ที่ถูกต้อง ต้องออก Access Token ใหม่ (Token Rotation)', async () => {
      if (!refreshTokenCookie) return;

      const response = await request(app)
        .post('/auth/refresh')
        .set('Cookie', [refreshTokenCookie]);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.accessToken).toBeDefined();

      // อัปเดต Refresh Token Cookie อันใหม่
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
  // 3. Protected Main API Endpoints (/api)
  // -------------------------------------------------------------
  describe('Protected API Endpoints (/api)', () => {
    test('GET /api - แบบไม่แนบ Access Token ต้องปฏิเสธ 401 Unauthorized', async () => {
      const response = await request(app).get('/api');

      expect(response.statusCode).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('GET /api - แนบ Access Token ที่ถูกต้อง ต้องได้ HTTP 200 OK และส่งคืน Dashboard', async () => {
      const response = await request(app)
        .get('/api')
        .set('Authorization', `Bearer ${validAccessToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.authenticatedUser).toBeDefined();
    });

    test('POST /api - กรณีส่ง Body ไม่ผ่าน Zod Schema ต้องตอบกลับ HTTP 400 Bad Request', async () => {
      const response = await request(app)
        .post('/api')
        .set('Authorization', `Bearer ${validAccessToken}`)
        .send({
          title: 'a', // สั้นเกินไป (Zod ต้องการอย่างน้อย 3)
          description: '123' // สั้นเกินไป (Zod ต้องการอย่างน้อย 5)
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
    });

    test('POST /api - กรณีแนบ Token และส่ง Body ถูกต้องตาม Zod Schema ต้องได้ HTTP 201 Created', async () => {
      const response = await request(app)
        .post('/api')
        .set('Authorization', `Bearer ${validAccessToken}`)
        .send({
          title: 'Valid Project Title',
          description: 'Valid description with enough characters',
          category: 'technology'
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.receivedData.title).toBe('Valid Project Title');
    });
  });
});
