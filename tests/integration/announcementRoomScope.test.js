const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const { prisma } = require('../../src/services/billingService');

// targetType ROOM: targetId คือ "ห้อง" ไม่ใช่ "ตึก" แต่ _resolveAllowedBuildingId เดิมเอา targetId
// ไปตรวจเป็น buildingId ตรงๆ ทำให้ MANAGER ส่ง buildingId ของตึกที่ตัวเองมีสิทธิ์ (ผ่านสิทธิ์)
// พร้อม targetId เป็นห้องของตึกอื่น (ไม่มีสิทธิ์) แล้วประกาศไปตกที่ผู้เช่าตึกอื่นได้จริง
describe('Announcement targetType=ROOM ต้องตรวจสิทธิ์ตามตึกจริงของห้อง ไม่ใช่ buildingId ที่ Client ส่งมาแยก', () => {
  const tag = `arsc${Date.now()}`;
  let manager, managerToken, myRoom, foreignRoom, myBuildingId;
  const created = { rooms: [], tenants: [], buildings: [] };

  beforeAll(async () => {
    manager = await prisma.user.findFirst({ where: { role: { in: ['MANAGER', 'manager'] } } });
    managerToken = authService.generateAccessToken(manager);
    const perms = (await prisma.userBuildingPermission.findMany({ where: { userId: manager.id } })).map((p) => p.buildingId);
    myBuildingId = perms[0];

    const foreignBuilding = await prisma.building.create({ data: { name: `${tag}-foreign` } });
    created.buildings.push(foreignBuilding.id);

    const mkRoomWithTenant = async (buildingId, suffix) => {
      const tenant = await prisma.tenant.create({ data: { firstName: tag, lastName: suffix, phone: `09${Math.floor(Math.random() * 1e8)}`, lineUserId: `U_${tag}_${suffix}` } });
      const room = await prisma.room.create({ data: { roomNumber: `${tag}${suffix}`, floor: 1, price: 1000, status: 'occupied', buildingId, tenantId: tenant.id } });
      created.tenants.push(tenant.id);
      created.rooms.push(room.id);
      return room;
    };

    myRoom = await mkRoomWithTenant(myBuildingId, 'mine');
    foreignRoom = await mkRoomWithTenant(foreignBuilding.id, 'foreign');
  });

  afterAll(async () => {
    await prisma.notificationLog.deleteMany({ where: { tenantId: { in: created.tenants } } });
    await prisma.announcement.deleteMany({ where: { title: { startsWith: tag } } });
    await prisma.room.deleteMany({ where: { id: { in: created.rooms } } });
    await prisma.tenant.deleteMany({ where: { id: { in: created.tenants } } });
    await prisma.building.deleteMany({ where: { id: { in: created.buildings } } });
  });

  test('ส่ง buildingId เป็นตึกตัวเอง (ผ่านสิทธิ์) + targetId เป็นห้องของตึกอื่น ต้องถูกปฏิเสธ 403 ไม่ใช่ส่งไปตกที่ตึกอื่น', async () => {
    const res = await request(app).post('/api/admin/broadcasts').set('Authorization', `Bearer ${managerToken}`)
      .send({ title: `${tag}-bypass`, content: 'x', targetType: 'ROOM', targetId: foreignRoom.id, buildingId: myBuildingId });
    expect(res.statusCode).toBe(403);
    expect(await prisma.announcement.count({ where: { title: `${tag}-bypass` } })).toBe(0);
  });

  test('ตรวจ recipients-count (preview) ด้วย payload เดียวกันก็ต้องถูกปฏิเสธเช่นกัน', async () => {
    const res = await request(app).get('/api/admin/broadcasts/recipients-count')
      .query({ targetType: 'ROOM', targetId: foreignRoom.id, buildingId: myBuildingId })
      .set('Authorization', `Bearer ${managerToken}`);
    expect(res.statusCode).toBe(403);
  });

  test('ส่งไปห้องของตึกตัวเองได้ปกติ แม้ไม่ส่ง buildingId มาแยกเลย', async () => {
    const res = await request(app).post('/api/admin/broadcasts').set('Authorization', `Bearer ${managerToken}`)
      .send({ title: `${tag}-ok`, content: 'x', targetType: 'ROOM', targetId: myRoom.id });
    expect(res.statusCode).toBe(201);
    expect(res.body.data.recipientCount).toBe(1);
  });
});
