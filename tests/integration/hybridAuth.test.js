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

  describe('POST /api/auth/liff/pin-login & /setup-pin (LIFF Seamless PIN Auto-Login)', () => {
    const testPin = '123456';
    const wrongPin = '654321';
    const mockLineIdToken = 'U_hybrid_test_user_line_123';

    test('กรณีลูกบ้านยังไม่ได้ตั้งค่า PIN ต้องส่งคืน 400 PIN_NOT_SET', async () => {
      const response = await request(app)
        .post('/api/auth/liff/pin-login')
        .send({
          lineIdToken: mockLineIdToken,
          pin: testPin
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('PIN_NOT_SET');
    });

    test('ลูกบ้านตั้งค่ารหัส PIN 6 หลักสำเร็จ (200 OK)', async () => {
      const response = await request(app)
        .post('/api/auth/liff/setup-pin')
        .send({
          lineIdToken: mockLineIdToken,
          pin: testPin
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);

      const updated = await billingService.prisma.tenant.findUnique({
        where: { id: testTenant.id }
      });
      expect(updated.pinHash).toBeDefined();
      const isMatch = await bcrypt.compare(testPin, updated.pinHash);
      expect(isMatch).toBe(true);
    });

    test('กรณีระบุรหัส PIN ผิด ต้องปฏิเสธ 401 Unauthorized พร้อม code INVALID_PIN', async () => {
      const response = await request(app)
        .post('/api/auth/liff/pin-login')
        .send({
          lineIdToken: mockLineIdToken,
          pin: wrongPin
        });

      expect(response.statusCode).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_PIN');
    });

    test('กรณีระบุรหัส PIN 6 หลักถูกต้อง ล็อกอินสำเร็จและได้รับ Backend JWT (200 OK)', async () => {
      const response = await request(app)
        .post('/api/auth/liff/pin-login')
        .send({
          lineIdToken: mockLineIdToken,
          pin: testPin
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.user.role).toBe('tenant');
      expect(response.body.data.user.phone).toBe(testPhone);
    });

    test('กรณี LINE ID Token ไม่ตรงกับผู้ใช้ใดเลย ต้องส่งคืน 404 TENANT_NOT_FOUND', async () => {
      const response = await request(app)
        .post('/api/auth/liff/pin-login')
        .send({
          lineIdToken: 'U_non_existent_tenant_999',
          pin: testPin
        });

      expect(response.statusCode).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('TENANT_NOT_FOUND');
    });

    test('POST /api/liff/auth/check-status - ตรวจสอบสถานะการผูกบัญชีและ PIN (200 OK)', async () => {
      const response = await request(app)
        .post('/api/liff/auth/check-status')
        .send({
          lineIdToken: mockLineIdToken
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.isLinked).toBe(true);
      expect(response.body.hasPin).toBe(true);
    });

    test('POST /api/liff/profile/change-pin - เปลี่ยนรหัส PIN สำเร็จ (200 OK)', async () => {
      const newChangedPin = '987654';
      const response = await request(app)
        .post('/api/liff/profile/change-pin')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({
          oldPin: testPin,
          newPin: newChangedPin
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify new PIN works for login
      const loginRes = await request(app)
        .post('/api/liff/auth/pin-login')
        .send({
          lineIdToken: mockLineIdToken,
          pin: newChangedPin
        });

      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.body.success).toBe(true);
    });

    test('POST /api/v1/liff/auth/reset-pin - รีเซ็ตรหัส PIN เมื่อลืมรหัสเดิม (Forgot PIN) สำเร็จ (200 OK)', async () => {
      const resetNewPin = '112233';
      const resetRes = await request(app)
        .post('/api/v1/liff/auth/reset-pin')
        .send({
          phone: testPhone,
          lineIdToken: mockLineIdToken,
          newPin: resetNewPin
        });

      expect(resetRes.statusCode).toBe(200);
      expect(resetRes.body.success).toBe(true);
      expect(resetRes.body.accessToken).toBeDefined();

      // Test login with the newly reset PIN
      const loginRes = await request(app)
        .post('/api/liff/auth/pin-login')
        .send({
          lineIdToken: mockLineIdToken,
          pin: resetNewPin
        });

      expect(loginRes.statusCode).toBe(200);
      expect(loginRes.body.success).toBe(true);

      // Restore PIN back to 987654 (currentPin) for subsequent test cases
      await request(app)
        .post('/api/v1/liff/auth/reset-pin')
        .send({
          phone: testPhone,
          lineIdToken: mockLineIdToken,
          newPin: '987654'
        });
    });
  });

  describe('Centralized User Identity (1 User : Multi-Building LINE OA IDs)', () => {
    const building2LineUserId = 'U_building2_scoped_line_id_999';
    let testBuilding2;

    beforeAll(async () => {
      // Create building 2
      testBuilding2 = await billingService.prisma.building.create({
        data: {
          name: 'หอพักสุขสบาย สาขา 2',
          address: '456 ถนนสุขุมวิท'
        }
      });
    });

    afterAll(async () => {
      if (testBuilding2) {
        await billingService.prisma.userLineAccount.deleteMany({
          where: { buildingId: testBuilding2.id }
        });
        await billingService.prisma.building.delete({
          where: { id: testBuilding2.id }
        });
      }
    });

    test('POST /api/liff/auth/verify-phone-status - ตรวจสอบเบอร์โทรที่ยังไม่มีในระบบ', async () => {
      const response = await request(app)
        .post('/api/liff/auth/verify-phone-status')
        .send({
          phone: '0990001122'
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.isExistingUser).toBe(false);
      expect(response.body.hasPin).toBe(false);
    });

    test('POST /api/liff/auth/verify-phone-status - ตรวจสอบเบอร์โทรของผู้เช่าเดิมในระบบ', async () => {
      const response = await request(app)
        .post('/api/liff/auth/verify-phone-status')
        .send({
          phone: testPhone
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.isExistingUser).toBe(true);
      expect(response.body.hasPin).toBe(true);
      expect(response.body.tenantName).toBe('ไฮบริด ออธ');
    });

    test('POST /api/liff/auth/link-and-login - กรณีใส่ PIN ผิด ต้องปฏิเสธ 401 INVALID_PIN', async () => {
      const response = await request(app)
        .post('/api/liff/auth/link-and-login')
        .send({
          phone: testPhone,
          pin: '000000',
          buildingId: testBuilding2.id,
          lineIdToken: building2LineUserId
        });

      expect(response.statusCode).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_PIN');
    });

    test('POST /api/liff/auth/link-and-login - กรณีใส่ PIN ถูกต้อง ต้องผูก UserLineAccount และออก Token สำเร็จ', async () => {
      const currentPin = '987654'; // PIN updated in previous change-pin test
      const response = await request(app)
        .post('/api/liff/auth/link-and-login')
        .send({
          phone: testPhone,
          pin: currentPin,
          buildingId: testBuilding2.id,
          lineIdToken: building2LineUserId,
          lineDisplayName: 'Hybrid User Building 2',
          linePictureUrl: 'https://example.com/pic2.jpg',
          lineStatusMessage: 'อยู่ในสาขา 2'
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.accessToken).toBeDefined();
      expect(response.body.data.user.phone).toBe(testPhone);

      // Verify UserLineAccount created in database
      const linkedAccount = await billingService.prisma.userLineAccount.findUnique({
        where: {
          buildingId_lineUserId: {
            buildingId: testBuilding2.id,
            lineUserId: building2LineUserId
          }
        }
      });
      expect(linkedAccount).toBeDefined();
      expect(linkedAccount.tenantId).toBe(testTenant.id);
      expect(linkedAccount.lineDisplayName).toBe('Hybrid User Building 2');
    });

    test('POST /api/liff/auth/check-status - ตรวจสอบสถานะของ LINE User ID ในสาขา 2 ต้องพบสถานะ linked', async () => {
      const response = await request(app)
        .post('/api/liff/auth/check-status')
        .send({
          lineIdToken: building2LineUserId,
          buildingId: testBuilding2.id
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.isLinked).toBe(true);
      expect(response.body.hasPin).toBe(true);
    });
  });

  describe('POST /api/liff/auth/link-and-login - กรณีบัญชียังไม่เคยตั้งรหัส PIN (Set PIN On Verify)', () => {
    const noPinPhone = '0888000111';
    const noPinLineUserId = 'U_no_pin_verify_test_user_456';
    let noPinTenant;
    let testBuildingForNoPin;

    beforeAll(async () => {
      testBuildingForNoPin = await billingService.prisma.building.create({
        data: {
          name: 'หอพักสุขสบาย สาขา 3',
          address: '789 ถนนพระราม 9'
        }
      });

      noPinTenant = await billingService.prisma.tenant.create({
        data: {
          firstName: 'ยังไม่มี',
          lastName: 'พิน',
          phone: noPinPhone,
          pinHash: null
        }
      });
    });

    afterAll(async () => {
      await billingService.prisma.userLineAccount.deleteMany({
        where: { buildingId: testBuildingForNoPin.id }
      });
      // ลบด้วย id ของ tenant ที่สร้างในเทสนี้โดยตรงเท่านั้น (phone ไม่ใช่ unique field จึงห้ามลบด้วยเบอร์โทรเพราะอาจไปโดน tenant รายอื่นที่ใช้เบอร์เดียวกัน)
      await billingService.prisma.tenant.delete({
        where: { id: noPinTenant.id }
      });
      await billingService.prisma.building.delete({
        where: { id: testBuildingForNoPin.id }
      });
    });

    test('กรณีรหัส PIN ที่ส่งมาไม่ใช่ตัวเลข 6 หลัก ต้องปฏิเสธ 400 Bad Request', async () => {
      const response = await request(app)
        .post('/api/liff/auth/link-and-login')
        .send({
          phone: noPinPhone,
          pin: '12',
          buildingId: testBuildingForNoPin.id,
          lineIdToken: noPinLineUserId
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
    });

    // ⚠️ Security Fix: เดิม endpoint นี้ถ้ายังไม่เคยตั้ง PIN จะเอา PIN ที่ Client ส่งมาตั้งเป็นของจริงทันที
    // (แค่รู้เบอร์โทรก็ Takeover บัญชีได้ ไม่ต้องเดา PIN เลย) — ต้องปฏิเสธ 400 PIN_NOT_SET เหมือน pinLogin แทน
    test('กรณีบัญชียังไม่เคยตั้ง PIN ต้องปฏิเสธ 400 PIN_NOT_SET (ป้องกัน Account Takeover ด้วยเบอร์โทรอย่างเดียว)', async () => {
      const response = await request(app)
        .post('/api/liff/auth/link-and-login')
        .send({
          phone: noPinPhone,
          pin: '135790',
          buildingId: testBuildingForNoPin.id,
          lineIdToken: noPinLineUserId
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('PIN_NOT_SET');

      // ต้องไม่มีการสร้าง PIN ขึ้นมาเองในฐานข้อมูล
      const untouchedTenant = await billingService.prisma.tenant.findUnique({
        where: { id: noPinTenant.id }
      });
      expect(untouchedTenant.pinHash).toBeNull();
    });

    test('กรณีตั้ง PIN ผ่านช่องทางที่ยืนยันตัวตนจริง (reset-pin ด้วย LINE เดียวกัน) แล้วค่อยล็อกอินด้วย link-and-login ควรสำเร็จ (200 OK)', async () => {
      const newPin = '135790';

      // ตั้ง PIN ครั้งแรกผ่าน setup-pin/reset-pin ด้วย LINE ID เดียวกัน (เส้นทางที่ต้องมี Identity ที่ Verify แล้ว)
      const setupRes = await request(app)
        .post('/api/v1/liff/auth/reset-pin')
        .send({
          phone: noPinPhone,
          lineIdToken: noPinLineUserId,
          newPin
        });
      expect(setupRes.statusCode).toBe(200);
      expect(setupRes.body.success).toBe(true);

      const response = await request(app)
        .post('/api/liff/auth/link-and-login')
        .send({
          phone: noPinPhone,
          pin: newPin,
          buildingId: testBuildingForNoPin.id,
          lineIdToken: noPinLineUserId
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.pinCreated).toBe(false);
      expect(response.body.data.accessToken).toBeDefined();

      const linkedAccount = await billingService.prisma.userLineAccount.findUnique({
        where: {
          buildingId_lineUserId: {
            buildingId: testBuildingForNoPin.id,
            lineUserId: noPinLineUserId
          }
        }
      });
      expect(linkedAccount).toBeDefined();
      expect(linkedAccount.tenantId).toBe(noPinTenant.id);
    });
  });
});
