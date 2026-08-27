const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Room Invite Code & Registration Integration Tests', () => {
  let adminToken;
  let testRoom;
  let inviteCode;

  beforeAll(async () => {
    adminToken = authService.generateAccessToken({
      id: '00000000-0000-0000-0000-000000000001',
      email: 'admin@test.com',
      name: 'Admin User',
      role: 'admin'
    });

    // Create a fresh test available room
    testRoom = await billingService.prisma.room.create({
      data: {
        roomNumber: 'TEST999',
        floor: 9,
        price: 5000,
        status: 'available'
      }
    });
  });

  afterAll(async () => {
    // Clean up test room and created data
    if (testRoom) {
      await billingService.prisma.roomInvite.deleteMany({ where: { roomId: testRoom.id } });
      await billingService.prisma.room.delete({ where: { id: testRoom.id } }).catch(() => {});
    }
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

    test('GET /api/v1/rooms/:id/invites - ดึงรายการ Invite Codes ของห้องพัก', async () => {
      const response = await request(app)
        .get(`/api/v1/rooms/${testRoom.id}/invites`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('LIFF Invite Verification & Registration Endpoints', () => {
    test('GET /api/v1/liff/invites/verify/:code - ตรวจสอบรหัสเชิญล่วงหน้า (200 OK)', async () => {
      const response = await request(app).get(`/api/v1/liff/invites/verify/${inviteCode}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.roomNumber).toBe('TEST999');
    });

    test('POST /api/v1/liff/register/invite - ลงทะเบียนผู้เช่าและผูกเข้ากับห้องพัก (Prisma Transaction)', async () => {
      const response = await request(app)
        .post('/api/v1/liff/register/invite')
        .send({
          inviteCode,
          firstName: 'สมชาย',
          lastName: 'สายลม',
          phone: '0887776655',
          idCard: '1100200300405',
          lineUserId: 'U1234567890abcdef'
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.room.status).toBe('occupied');

      // Clean up created tenant
      if (response.body.data.tenant?.id) {
        await billingService.prisma.tenant.delete({ where: { id: response.body.data.tenant.id } }).catch(() => {});
      }
    });

    test('GET /api/v1/liff/invites/verify/:code - กรณีใช้รหัสเชิญเดิมซ้ำ ต้องปฏิเสธ 400 (IsUsed = true)', async () => {
      const response = await request(app).get(`/api/v1/liff/invites/verify/${inviteCode}`);

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});
