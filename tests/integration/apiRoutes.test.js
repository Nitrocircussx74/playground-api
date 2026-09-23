const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');

const billingService = require('../../src/services/billingService');

describe('Full API Integration Tests (ทดสอบ Endpoints ทั้งหมดในระบบ)', () => {
  let validAccessToken;
  let refreshTokenCookie;

  beforeAll(async () => {
    const mockUser = {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'integration@test.com',
      name: 'Integration Test User',
      role: 'admin'
    };
    validAccessToken = authService.generateAccessToken(mockUser);

    await billingService.prisma.tenant.upsert({
      where: { lineUserId: 'U_test_apiroutes_profile' },
      update: { phone: '0812345678' },
      create: {
        firstName: 'ทดสอบ',
        lastName: 'โปรไฟล์',
        phone: '0812345678',
        lineUserId: 'U_test_apiroutes_profile'
      }
    });
  });

  afterAll(async () => {
    await billingService.prisma.tenant.deleteMany({
      where: { lineUserId: 'U_test_apiroutes_profile' }
    });
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
        .set('Authorization', `Bearer ${validAccessToken}`)
        .send({ isActive: true });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('GET /api/v1/features - ดึงรายการตาม buildingId และ override ค่าถูกต้อง', async () => {
      let building = await billingService.prisma.building.findFirst();
      if (!building) {
        building = await billingService.prisma.building.create({
          data: { name: 'Test Feature Building', totalFloors: 5 }
        });
      }

      // 1. ตั้งค่าปิดฟีเจอร์เฉพาะตึก
      await request(app)
        .put('/api/v1/features/ENABLE_MAINTENANCE_REQUEST')
        .set('Authorization', `Bearer ${validAccessToken}`)
        .send({ isActive: false, buildingId: building.id });

      // 2. ดึงด้วย query buildingId
      const resWithBuilding = await request(app).get(`/api/v1/features?buildingId=${building.id}`);
      expect(resWithBuilding.statusCode).toBe(200);
      expect(resWithBuilding.body.data.featureMap['ENABLE_MAINTENANCE_REQUEST']).toBe(false);

      // 3. ดึงแบบ global (ไม่ระบุตึก) ต้องได้ค่า default true
      const resGlobal = await request(app).get('/api/v1/features');
      expect(resGlobal.statusCode).toBe(200);
      expect(resGlobal.body.data.featureMap['ENABLE_MAINTENANCE_REQUEST']).toBe(true);

      // Cleanup
      await billingService.prisma.featureToggle.deleteMany({
        where: { buildingId: building.id }
      });
    });

    test('GET /api/v1/features - ต้องไม่โชว์ Key เก่าที่เลิกใช้แล้วแต่ยังมี Row ค้างอยู่ในตาราง (Orphan/Renamed Key)', async () => {
      // จำลองสถานการณ์จริงที่เจอ: มี Row ในตารางด้วย Key ที่ไม่มีอยู่ใน STANDARD_FEATURE_METADATA แล้ว
      // (เช่น Rename Key ไปแล้วแต่ไม่ได้ลบ Row เก่า) — เดิมจะโผล่มาเป็นการ์ดที่ไม่มี Title จริง
      // (โชว์ Raw Key แทน) ปนกับฟีเจอร์จริงในหน้า Feature Settings
      const orphan = await billingService.prisma.featureToggle.create({
        data: { key: 'ENABLE_THIS_KEY_NO_LONGER_EXISTS', isActive: false }
      });

      try {
        const response = await request(app).get('/api/v1/features');
        expect(response.statusCode).toBe(200);
        expect(response.body.data.featureMap['ENABLE_THIS_KEY_NO_LONGER_EXISTS']).toBeUndefined();
        expect(response.body.data.features.some((f) => f.key === 'ENABLE_THIS_KEY_NO_LONGER_EXISTS')).toBe(false);
      } finally {
        await billingService.prisma.featureToggle.delete({ where: { id: orphan.id } });
      }
    });
  });

  // -------------------------------------------------------------
  // 4. LIFF Tenant Profile Endpoints (/api/v1/liff/profile)
  // -------------------------------------------------------------
  describe('LIFF Tenant Profile Endpoints (/api/v1/liff/profile)', () => {
    test('GET /api/v1/liff/profile - ดึงโปรไฟล์ลูกบ้าน', async () => {
      const response = await request(app)
        .get('/api/v1/liff/profile')
        .set('X-Line-Id-Token', 'U_test_apiroutes_profile');

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.firstName).toBeDefined();
    });

    test('PUT /api/v1/liff/profile - อัปเดตเบอร์โทรศัพท์ผิดรูปแบบ (ต้องปฏิเสธ 400)', async () => {
      const response = await request(app)
        .put('/api/v1/liff/profile')
        .set('X-Line-Id-Token', 'U_test_apiroutes_profile')
        .send({ phone: '123' });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('PUT /api/v1/liff/profile - อัปเดตเบอร์โทรศัพท์ถูกต้อง (ต้องสำเร็จ 200)', async () => {
      const response = await request(app)
        .put('/api/v1/liff/profile')
        .set('X-Line-Id-Token', 'U_test_apiroutes_profile')
        .send({ phone: '0898765432' });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.phone).toBe('0898765432');
    });
  });

  // -------------------------------------------------------------
  // 5. Dashboard & Report Export Endpoints (/api/v1/dashboard)
  // -------------------------------------------------------------
  describe('Dashboard & Report Export Endpoints (/api/v1/dashboard)', () => {
    test('GET /api/v1/dashboard/summary - ดึงข้อมูลสรุปภาพรวมธุรกิจ', async () => {
      const response = await request(app)
        .get('/api/v1/dashboard/summary')
        .set('Authorization', `Bearer ${validAccessToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.occupancy).toBeDefined();
      expect(response.body.data.financial).toBeDefined();
    });

    test('GET /api/v1/dashboard/trend - ดึงข้อมูลแนวโน้มรายรับย้อนหลัง 6 เดือน', async () => {
      const response = await request(app)
        .get('/api/v1/dashboard/trend')
        .set('Authorization', `Bearer ${validAccessToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(6);
    });

    test('GET /api/v1/dashboard/export/csv - ส่งออกรายงานเป็นไฟล์ CSV (UTF-8 BOM)', async () => {
      const response = await request(app)
        .get('/api/v1/dashboard/export/csv')
        .set('Authorization', `Bearer ${validAccessToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.text).toContain('Invoice Number');
    });

    test('GET /api/v1/dashboard/export/pdf - ส่งออกรายงานงบการเงินเป็นไฟล์ PDF', async () => {
      const response = await request(app)
        .get('/api/v1/dashboard/export/pdf')
        .set('Authorization', `Bearer ${validAccessToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
    });
  });
});
