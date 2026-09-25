const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Room Invite Code & Registration Integration Tests', () => {
  let adminToken;
  let testRoom;
  let inviteCode;

  let adminUser;
  let testBuilding;

  beforeAll(async () => {
    adminUser = await billingService.prisma.user.create({
      data: { email: `invite_admin_${Date.now()}@test.com`, passwordHash: 'x', name: 'Admin User', role: 'admin' }
    });
    adminToken = authService.generateAccessToken(adminUser);

    // แอดมินระดับ admin เข้าถึงได้เฉพาะห้องในตึกที่ได้รับสิทธิ์
    testBuilding = await billingService.prisma.building.create({ data: { name: 'Invite Test Building' } });
    await billingService.prisma.userBuildingPermission.create({ data: { userId: adminUser.id, buildingId: testBuilding.id } });

    // Create a fresh test available room
    testRoom = await billingService.prisma.room.create({
      data: {
        roomNumber: 'TEST999',
        floor: 9,
        price: 5000,
        status: 'available',
        buildingId: testBuilding.id
      }
    });
  });

  afterAll(async () => {
    // Clean up test room and created data
    if (testRoom) {
      await billingService.prisma.roomInvite.deleteMany({ where: { roomId: testRoom.id } });
      await billingService.prisma.room.delete({ where: { id: testRoom.id } }).catch(() => {});
    }
    await billingService.prisma.building.delete({ where: { id: testBuilding.id } }).catch(() => {});
    await billingService.prisma.user.delete({ where: { id: adminUser.id } }).catch(() => {});
  });

  describe('Admin Invite Code Generator Endpoints', () => {
    test('POST /api/v1/rooms/:id/invites - สร้างรหัสเชิญสำหรับห้องว่าง (201 Created)', async () => {
      const response = await request(app)
        .post(`/api/v1/rooms/${testRoom.id}/invites`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.code).toBeDefined();
      expect(response.body.data.code.length).toBe(6);

      inviteCode = response.body.data.code;
    });

    test('POST /api/v1/invites - สร้างรหัสเชิญผ่าน /api/v1/invites (201 Created)', async () => {
      const response = await request(app)
        .post('/api/v1/invites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: testRoom.id,
          expiresInHours: 48
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.code).toBeDefined();
      expect(response.body.data.code.length).toBe(6);
    });

    test('GET /api/v1/invites/room/:roomId - ดึงรายการ Invite Codes ผ่าน /api/v1/invites/room/:roomId', async () => {
      const response = await request(app)
        .get(`/api/v1/invites/room/${testRoom.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    test('DELETE /api/v1/invites/:id - ยกเลิกรหัสเชิญสำเร็จ (200 OK)', async () => {
      // สร้าง invite ชั่วคราวเพื่อทดสอบ revoke
      const createRes = await request(app)
        .post('/api/v1/invites')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ roomId: testRoom.id });

      const inviteId = createRes.body.data.id;
      const response = await request(app)
        .delete(`/api/v1/invites/${inviteId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('LIFF Invite Verification & Registration Endpoints', () => {
    test('GET /api/v1/liff/invites/verify/:code - ตรวจสอบรหัสเชิญล่วงหน้า (200 OK)', async () => {
      const response = await request(app)
        .get(`/api/v1/liff/invites/verify/${inviteCode}`)
        .set('X-Line-Id-Token', 'U1234567890abcdef');

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.roomNumber).toBe('TEST999');
    });

    test('POST /api/v1/liff/register/invite - เบอร์โทรผิดรูปแบบ ต้องปฏิเสธ 400 (Zod Validation)', async () => {
      const response = await request(app)
        .post('/api/v1/liff/register/invite')
        .set('X-Line-Id-Token', 'U1234567890abcdef')
        .send({
          inviteCode,
          firstName: 'สมชาย',
          lastName: 'สายลม',
          phone: '123' // ผิดรูปแบบ (ต้อง 9-10 หลัก)
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('POST /api/v1/liff/register/invite - ลงทะเบียนผู้เช่าและผูกเข้ากับห้องพัก (Prisma Transaction)', async () => {
      const response = await request(app)
        .post('/api/v1/liff/register/invite')
        .set('X-Line-Id-Token', 'U1234567890abcdef')
        .send({
          inviteCode,
          firstName: 'สมชาย',
          lastName: 'สายลม',
          phone: '0887776655',
          idCard: '1100200300405'
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.room.status).toBe('occupied');
      expect(response.body.data.tenant.lineUserId).toBe('U1234567890abcdef');

      // Clean up created tenant
      if (response.body.data.tenant?.id) {
        await billingService.prisma.tenant.delete({ where: { id: response.body.data.tenant.id } }).catch(() => {});
      }
    });

    test('GET /api/v1/liff/invites/verify/:code - กรณีใช้รหัสเชิญเดิมซ้ำ ต้องปฏิเสธ 400 (IsUsed = true)', async () => {
      const response = await request(app)
        .get(`/api/v1/liff/invites/verify/${inviteCode}`)
        .set('X-Line-Id-Token', 'U1234567890abcdef');

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});
