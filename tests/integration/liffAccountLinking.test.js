const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Account Linking & Onboarding Integration Tests', () => {
  let adminToken;
  let testTenant;
  let generatedInviteCode;
  // เทสชุดนี้หยิบ tenant ตัวแรกในฐานข้อมูล (ไม่ใช่ fixture ที่สร้างเองแยกต่างหาก) มาทดลองผูก/ซิงค์บัญชี
  // ซึ่งอาจไปโดนบัญชีจริงที่ใช้ร่วมกันอยู่ ต้องจดค่าเดิมไว้ก่อนแล้ว restore กลับให้ครบใน afterAll เสมอ
  let originalTenantValues = null;

  beforeAll(async () => {
    const adminUser = await billingService.prisma.user.findFirst({
      where: { role: { in: ['SUPERADMIN', 'OWNER', 'ADMIN', 'super_admin', 'owner', 'admin'] } }
    });
    adminToken = authService.generateAccessToken(adminUser);

    testTenant = await billingService.prisma.tenant.findFirst();
    if (testTenant) {
      originalTenantValues = {
        lineUserId: testTenant.lineUserId,
        lineDisplayName: testTenant.lineDisplayName,
        linePictureUrl: testTenant.linePictureUrl,
        inviteCode: testTenant.inviteCode,
        inviteExpiresAt: testTenant.inviteExpiresAt
      };
      await billingService.prisma.tenant.update({
        where: { id: testTenant.id },
        data: { lineUserId: null, inviteCode: null, inviteExpiresAt: null }
      });
    }
  });

  afterAll(async () => {
    if (testTenant && originalTenantValues) {
      await billingService.prisma.tenant.update({
        where: { id: testTenant.id },
        data: originalTenantValues
      });
    }
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
    test('กรณีไม่แนบ LINE ID Token ต้องปฏิเสธ 401 Unauthorized (ป้องกันการปลอมแปลง lineUserId)', async () => {
      const response = await request(app)
        .post('/api/v1/liff/auth/link-account')
        .send({
          inviteCode: 'ANYCODE',
          phoneLast4: '1234'
        });

      expect(response.statusCode).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('กรณีใส่รหัสเชิญผิด ต้องปฏิเสธ 400 Bad Request', async () => {
      const response = await request(app)
        .post('/api/v1/liff/auth/link-account')
        .set('X-Line-Id-Token', 'U_test_wrong_invite')
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
        .set('X-Line-Id-Token', 'U_test_wrong_phone')
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
        .set('X-Line-Id-Token', testLineUserId)
        .send({
          inviteCode: generatedInviteCode,
          phoneLast4
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

    test('กรณีแนบข้อมูล LINE Profile ต้องบันทึก lineDisplayName และ linePictureUrl ลง DB (200 OK)', async () => {
      if (!testTenant) return;

      const inviteRes = await request(app)
        .post(`/api/admin/tenants/${testTenant.id}/generate-invite`)
        .set('Authorization', `Bearer ${adminToken}`);

      const newInvite = inviteRes.body.data.inviteCode;
      const phoneLast4 = testTenant.phone.trim().slice(-4);
      const testLineUserId = `U_test_profile_extract_${Date.now()}`;

      const response = await request(app)
        .post('/api/v1/liff/auth/link-account')
        .set('X-Line-Id-Token', testLineUserId)
        .send({
          inviteCode: newInvite,
          phoneLast4,
          lineDisplayName: 'Somchai LINE Display Name',
          linePictureUrl: 'https://profile.line-scdn.net/sample_avatar.jpg',
          lineStatusMessage: 'Hello LINE'
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.data.tenant.lineDisplayName).toBe('Somchai LINE Display Name');
      expect(response.body.data.tenant.linePictureUrl).toBe('https://profile.line-scdn.net/sample_avatar.jpg');
      // ต้องบอกสถานะ PIN กลับมาด้วย เพื่อให้ Frontend พาไปตั้ง PIN ต่อได้หากยังไม่เคยตั้ง
      expect(typeof response.body.data.hasPin).toBe('boolean');
      expect(response.body.data.hasPin).toBe(response.body.hasPin);
    });
  });

  describe('PATCH /api/v1/liff/auth/sync-profile', () => {
    test('อัปเดตซิงค์ข้อมูลโปรไฟล์ LINE ของลูกบ้านสำเร็จ (200 OK)', async () => {
      // เทสนี้หยิบผู้เช่า "ตัวแรกที่มี lineUserId" ในฐานข้อมูลมาทดสอบ ซึ่งอาจไปโดนบัญชีจริง/ของเทสอื่นที่ใช้ร่วมกันอยู่
      // ต้องจด lineDisplayName/linePictureUrl เดิมไว้ก่อน แล้ว restore กลับหลังเทสเสร็จเสมอ กันไม่ให้ข้อมูลเดิมหายถาวร
      const tenantWithLine = await billingService.prisma.tenant.findFirst({
        where: { lineUserId: { not: null } }
      });
      if (!tenantWithLine) return;

      const originalValues = {
        lineDisplayName: tenantWithLine.lineDisplayName,
        linePictureUrl: tenantWithLine.linePictureUrl
      };

      try {
        const response = await request(app)
          .patch('/api/v1/liff/auth/sync-profile')
          .set('X-Line-Id-Token', tenantWithLine.lineUserId)
          .send({
            lineDisplayName: 'Updated LINE Display Name',
            linePictureUrl: 'https://profile.line-scdn.net/updated_avatar.jpg'
          });

        expect(response.statusCode).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.lineDisplayName).toBe('Updated LINE Display Name');
        expect(response.body.data.linePictureUrl).toBe('https://profile.line-scdn.net/updated_avatar.jpg');
      } finally {
        await billingService.prisma.tenant.update({
          where: { id: tenantWithLine.id },
          data: originalValues
        });
      }
    });
  });

  describe('POST /api/v1/liff/register/invite - ลงทะเบียนผู้เช่าใหม่ด้วย Invite Code', () => {
    const registerPhone = '0887770001';
    const registerLineUserId = 'U_test_register_invite_pin_check';
    let registerBuilding;
    let registerRoom;
    let registerInvite;

    beforeAll(async () => {
      registerBuilding = await billingService.prisma.building.create({
        data: { name: 'หอพักทดสอบลงทะเบียน', address: '111 ถนนทดสอบ' }
      });
      registerRoom = await billingService.prisma.room.create({
        data: {
          buildingId: registerBuilding.id,
          roomNumber: 'REG-101',
          floor: 1,
          price: 4000,
          status: 'available'
        }
      });
      registerInvite = await billingService.prisma.roomInvite.create({
        data: {
          roomId: registerRoom.id,
          code: 'REGT01',
          expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
        }
      });
    });

    afterAll(async () => {
      await billingService.prisma.leaseContract.deleteMany({ where: { roomId: registerRoom.id } });
      await billingService.prisma.roomInvite.deleteMany({ where: { roomId: registerRoom.id } });
      await billingService.prisma.tenant.deleteMany({ where: { phone: registerPhone } });
      await billingService.prisma.room.delete({ where: { id: registerRoom.id } });
      await billingService.prisma.building.delete({ where: { id: registerBuilding.id } });
    });

    test('ลงทะเบียนสำเร็จ ต้องได้ hasPin เป็น false และไม่รั่ว pinHash ออกมาใน response (201 Created)', async () => {
      const response = await request(app)
        .post('/api/v1/liff/register/invite')
        .set('X-Line-Id-Token', registerLineUserId)
        .send({
          inviteCode: registerInvite.code,
          firstName: 'ทดสอบ',
          lastName: 'ลงทะเบียน',
          phone: registerPhone
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.hasPin).toBe(false);
      expect(response.body.data.hasPin).toBe(false);
      expect(response.body.data.tenant.pinHash).toBeUndefined();
      expect(response.body.data.tenant.phone).toBe(registerPhone);
    });
  });
});
