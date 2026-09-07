const request = require('supertest');
const app = require('../../src/app');
const billingService = require('../../src/services/billingService');
const prisma = billingService.prisma;

describe('Multi-Room Tenancy Integration Tests', () => {
  let building;
  let room1;
  let room2;
  let inviteCode1;
  let inviteCode2;
  const mockLineUserId = `U_multi_room_test_${Date.now()}`;
  const mockPhone = `089${Math.floor(1000000 + Math.random() * 9000000)}`;

  beforeAll(async () => {
    // Create test building
    building = await prisma.building.create({
      data: {
        name: `Multi-Room Test Building ${Date.now()}`,
        address: '123 Multi St'
      }
    });

    // Create room 1
    room1 = await prisma.room.create({
      data: {
        roomNumber: `MR101-${Date.now().toString().slice(-4)}`,
        floor: 1,
        price: 5000,
        status: 'available',
        buildingId: building.id
      }
    });

    // Create room 2
    room2 = await prisma.room.create({
      data: {
        roomNumber: `MR102-${Date.now().toString().slice(-4)}`,
        floor: 1,
        price: 5500,
        status: 'available',
        buildingId: building.id
      }
    });

    // Create invite codes
    const inv1 = await prisma.roomInvite.create({
      data: {
        code: `INV1-${Date.now()}`,
        roomId: room1.id,
        isUsed: false,
        expiresAt: new Date(Date.now() + 86400000)
      }
    });
    inviteCode1 = inv1.code;

    const inv2 = await prisma.roomInvite.create({
      data: {
        code: `INV2-${Date.now()}`,
        roomId: room2.id,
        isUsed: false,
        expiresAt: new Date(Date.now() + 86400000)
      }
    });
    inviteCode2 = inv2.code;
  });

  afterAll(async () => {
    await prisma.maintenanceRequest.deleteMany({ where: { room: { buildingId: building.id } } });
    await prisma.leaseContract.deleteMany({ where: { room: { buildingId: building.id } } });
    await prisma.roomInvite.deleteMany({ where: { roomId: { in: [room1?.id, room2?.id].filter(Boolean) } } });
    await prisma.room.deleteMany({ where: { buildingId: building.id } });
    await prisma.tenant.deleteMany({ where: { lineUserId: mockLineUserId } });
    await prisma.building.deleteMany({ where: { id: building.id } });
  });

  test('1. ลงทะเบียนห้องแรกด้วย Invite Code สำเร็จ', async () => {
    const res = await request(app)
      .post('/api/v1/liff/register/invite')
      .set('X-Line-Id-Token', mockLineUserId)
      .send({
        inviteCode: inviteCode1,
        firstName: 'สมชาย',
        lastName: 'หลายห้อง',
        phone: mockPhone,
        idCard: '1100200300405'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.room.id).toBe(room1.id);
  });

  test('2. ผูกห้องที่สองเพิ่มเติมด้วย Invite Code ที่สอง กับ LINE User ID เดียวกัน สำเร็จ (ไม่เกิด duplicate tenant record)', async () => {
    const res = await request(app)
      .post('/api/v1/liff/register/invite')
      .set('X-Line-Id-Token', mockLineUserId)
      .send({
        inviteCode: inviteCode2,
        firstName: 'สมชาย',
        lastName: 'หลายห้อง',
        phone: mockPhone,
        idCard: '1100200300405'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.room.id).toBe(room2.id);

    // Verify database: only 1 Tenant record exists with this lineUserId
    const tenantRecords = await prisma.tenant.findMany({
      where: { lineUserId: mockLineUserId }
    });
    expect(tenantRecords.length).toBe(1);

    // Verify that both rooms are linked to this tenant
    const rooms = await prisma.room.findMany({
      where: { tenantId: tenantRecords[0].id }
    });
    expect(rooms.length).toBe(2);
  });

  test('3. ดึง LIFF Profile ตรวจสอบว่าส่งคืนรายการห้องทั้งหมด (totalRooms = 2)', async () => {
    const res = await request(app)
      .get('/api/v1/liff/profile')
      .set('X-Line-Id-Token', mockLineUserId)
      .query({ lineUserId: mockLineUserId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalRooms).toBe(2);
    expect(res.body.data.rooms.length).toBe(2);
  });
});
