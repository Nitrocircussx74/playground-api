const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Room Owner Scoped Access Integration Tests (/api/v1/rooms, /api/v1/invoices, /api/admin)', () => {
  let roomOwnerUser;
  let roomOwnerToken;
  let otherOwnerUser;
  let otherOwnerToken;
  let ownedRoom;
  let otherRoom;

  beforeAll(async () => {
    // 1. Create 2 test room owner users
    roomOwnerUser = await billingService.prisma.user.upsert({
      where: { email: 'room_owner_test@dorm.com' },
      update: { role: 'ROOM_OWNER' },
      create: {
        email: 'room_owner_test@dorm.com',
        name: 'Khun Somchai RoomOwner',
        passwordHash: 'dummyhash',
        role: 'ROOM_OWNER'
      }
    });

    otherOwnerUser = await billingService.prisma.user.upsert({
      where: { email: 'other_room_owner_test@dorm.com' },
      update: { role: 'ROOM_OWNER' },
      create: {
        email: 'other_room_owner_test@dorm.com',
        name: 'Khun Somsak OtherOwner',
        passwordHash: 'dummyhash',
        role: 'ROOM_OWNER'
      }
    });

    roomOwnerToken = authService.generateAccessToken(roomOwnerUser);
    otherOwnerToken = authService.generateAccessToken(otherOwnerUser);

    // 2. Fetch or assign rooms
    const building = await billingService.prisma.building.findFirst();

    ownedRoom = await billingService.prisma.room.findFirst({
      where: { buildingId: building.id }
    });
    await billingService.prisma.room.update({
      where: { id: ownedRoom.id },
      data: { ownerId: roomOwnerUser.id }
    });

    // Find another room and assign to other owner
    const allRooms = await billingService.prisma.room.findMany({
      where: { buildingId: building.id, id: { not: ownedRoom.id } },
      take: 1
    });
    otherRoom = allRooms[0];
    if (otherRoom) {
      await billingService.prisma.room.update({
        where: { id: otherRoom.id },
        data: { ownerId: otherOwnerUser.id }
      });
    }
  });

  test('GET /api/v1/rooms - ROOM_OWNER เห็นเฉพาะห้องที่ตนเองเป็นเจ้าของเท่านั้น', async () => {
    const res = await request(app)
      .get('/api/v1/rooms')
      .set('Authorization', `Bearer ${roomOwnerToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    // All returned rooms must have ownerId equal to roomOwnerUser.id
    res.body.data.forEach((r) => {
      expect(r.ownerId).toBe(roomOwnerUser.id);
    });
  });

  test('GET /api/v1/rooms/:id - ROOM_OWNER พยายามดูห้องของคนอื่นต้องถูกปฏิเสธ 403 Forbidden', async () => {
    if (!otherRoom) return;

    const res = await request(app)
      .get(`/api/v1/rooms/${otherRoom.id}`)
      .set('Authorization', `Bearer ${roomOwnerToken}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('ไม่มีสิทธิ์');
  });

  test('DELETE /api/v1/rooms/:id - ROOM_OWNER ไม่มีสิทธิ์ลบห้องพัก (403 Forbidden)', async () => {
    const res = await request(app)
      .delete(`/api/v1/rooms/${ownedRoom.id}`)
      .set('Authorization', `Bearer ${roomOwnerToken}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('GET /api/admin/users - ROOM_OWNER ไม่มีสิทธิ์เข้าถึงเมนูจัดการแอดมิน (403 Forbidden)', async () => {
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${roomOwnerToken}`);

    expect(res.statusCode).toBe(403);
  });

  test('MANAGER สามารถส่ง LINE แจ้งเตือนทวงหนี้และประกาศข่าวสารได้ (200 OK)', async () => {
    const managerUser = await billingService.prisma.user.findFirst({
      where: { role: { in: ['MANAGER', 'manager'] } }
    });
    const managerToken = authService.generateAccessToken(managerUser);

    // 1. MANAGER ส่งทวงหนี้ผ่าน LINE Flex Message
    const remindRes = await request(app)
      .post('/api/v1/dashboard/remind-debtors')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(remindRes.statusCode).toBe(200);
    expect(remindRes.body.success).toBe(true);

    // 2. MANAGER เช็คจำนวนผู้รับประกาศ Broadcast
    const countRes = await request(app)
      .get('/api/admin/broadcasts/recipients-count?targetType=ALL')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(countRes.statusCode).toBe(200);
    expect(countRes.body.success).toBe(true);
  });
});
