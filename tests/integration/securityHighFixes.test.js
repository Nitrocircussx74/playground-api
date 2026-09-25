const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const { prisma } = require('../../src/services/billingService');

const bearer = (user) => ({ Authorization: `Bearer ${authService.generateAccessToken(user)}` });

describe('ช่องโหว่ความเสี่ยงสูงจาก audit: อัปโหลด, PDF room_owner, ข้ามตึก, แจ้งซ่อมข้ามห้อง', () => {
  let owner, manager, foreignBuilding, foreignRoom;

  beforeAll(async () => {
    owner = await prisma.user.upsert({
      where: { email: 'sec_high_owner@dorm.com' },
      update: { role: 'ROOM_OWNER' },
      create: { email: 'sec_high_owner@dorm.com', name: 'sec-high', passwordHash: 'x', role: 'ROOM_OWNER' }
    });
    manager = await prisma.user.findFirst({ where: { role: { in: ['MANAGER', 'manager'] } } });
    foreignBuilding = await prisma.building.create({ data: { name: 'sec-high-foreign' } });
    foreignRoom = await prisma.room.create({
      data: { roomNumber: 'SEC1', floor: 1, price: 1000, status: 'available', buildingId: foreignBuilding.id }
    });
  });

  afterAll(async () => {
    await prisma.meterRecord.deleteMany({ where: { roomId: foreignRoom.id } });
    await prisma.room.deleteMany({ where: { OR: [{ id: foreignRoom.id }, { buildingId: foreignBuilding.id }] } });
    await prisma.building.delete({ where: { id: foreignBuilding.id } });
    await prisma.user.delete({ where: { id: owner.id } });
  });

  test('อัปโหลดไฟล์ชื่อ .html ที่ขึ้นต้นด้วย PNG: นามสกุลต้องไม่ใช่ .html และไม่ถูกเสิร์ฟเป็น text/html', async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('<script>1</script>')]);
    const res = await request(app).post('/api/v1/uploads').set(bearer(owner)).attach('file', png, { filename: 'x.html', contentType: 'image/png' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.filename).toMatch(/\.png$/);
    const served = await request(app).get(`/uploads/${res.body.data.filename}`);
    expect(served.headers['content-type']).not.toMatch(/html/);
    fs.unlinkSync(path.join(__dirname, '../../public/uploads', res.body.data.filename));
  });

  test('room_owner ดาวน์โหลด PDF บิลของห้องที่ไม่ใช่ของตัวเองไม่ได้ (403)', async () => {
    const invoice = await prisma.invoice.findFirst({ where: { room: { OR: [{ ownerId: null }, { ownerId: { not: owner.id } }] } } });
    const res = await request(app).get(`/api/v1/invoices/${invoice.id}/export`).set(bearer(owner));
    expect(res.statusCode).toBe(403);
  });

  test('MANAGER เขียนเลขมิเตอร์ข้ามไปตึกที่ไม่มีสิทธิ์ไม่ได้ (403)', async () => {
    const res = await request(app).post('/api/v1/meter-records').set(bearer(manager))
      .send({ roomId: foreignRoom.id, meterType: 'water', currentReading: 10, billingCycle: '01-2099' });
    expect(res.statusCode).toBe(403);
  });

  test('MANAGER ย้ายห้องของตัวเองเข้าตึกที่ไม่มีสิทธิ์ไม่ได้ (403)', async () => {
    const perm = await prisma.userBuildingPermission.findFirst({ where: { userId: manager.id } });
    const myRoom = await prisma.room.findFirst({ where: { buildingId: perm.buildingId } });
    const res = await request(app).put(`/api/v1/rooms/${myRoom.id}`).set(bearer(manager)).send({ buildingId: foreignBuilding.id });
    expect(res.statusCode).toBe(403);
    expect((await prisma.room.findUnique({ where: { id: myRoom.id } })).buildingId).toBe(myRoom.buildingId);
  });

  describe('แจ้งซ่อม', () => {
    let tenant, myRoom, otherRoom;
    const created = [];

    beforeAll(async () => {
      tenant = await prisma.tenant.findFirst({ where: { lineUserId: { not: null }, rooms: { some: {} } }, include: { rooms: true } });
      myRoom = tenant.rooms[0];
      otherRoom = await prisma.room.findFirst({ where: { id: { not: myRoom.id }, tenantId: { not: null } } });
    });
    afterAll(() => prisma.maintenanceRequest.deleteMany({ where: { title: 'sec-high-maint' } }));

    test('ลูกบ้านผ่าน LIFF ส่ง roomId/payer/repairCost ของห้องอื่นมา: บันทึกลงห้องที่ตรวจแล้วของตัวเอง และค่าซ่อมเป็น MANAGEMENT/0', async () => {
      const res = await request(app).post('/api/v1/liff/maintenance').set('X-Line-Id-Token', tenant.lineUserId).set('X-Room-Id', myRoom.id)
        .send({ title: 'sec-high-maint', description: 'x', roomId: otherRoom.id, payer: 'TENANT', repairCost: 5000 });
      expect(res.statusCode).toBe(201);
      expect(res.body.data.roomId).toBe(myRoom.id);
      expect(res.body.data.tenantId).toBe(tenant.id);
      expect(res.body.data.payer).toBe('MANAGEMENT');
      expect(Number(res.body.data.repairCost)).toBe(0);
    });

    test('ผู้เช่าเรียก POST /api/v1/maintenance-requests ตรง ๆ ไม่ได้ (403) และแอดมินต้องระบุ roomId (400)', async () => {
      const tenantTok = authService.generateAccessToken({ id: tenant.id, role: 'tenant', tenantId: tenant.id });
      const denied = await request(app).post('/api/v1/maintenance-requests').set('Authorization', `Bearer ${tenantTok}`)
        .send({ title: 'sec-high-maint', description: 'x', roomId: otherRoom.id });
      expect(denied.statusCode).toBe(403);

      const admin = await prisma.user.findFirst({ where: { role: { in: ['OWNER', 'owner'] } } });
      const noRoom = await request(app).post('/api/v1/maintenance-requests').set(bearer(admin)).send({ title: 'sec-high-maint', description: 'x' });
      expect(noRoom.statusCode).toBe(400);
    });
  });
});
