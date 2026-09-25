const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const { prisma } = require('../../src/services/billingService');

// จบสัญญา (ทั้ง process-move-out และ terminate) ต้องปิดสิทธิ์ผู้อยู่ร่วม/การผูก LINE ของคนที่ไม่เหลือที่พัก
// แต่ต้องไม่ตัดสิทธิ์คนที่ยังมีห้องอื่นอยู่ในตึกเดียวกัน
describe('ปิดสิทธิ์เข้าพักเมื่อจบสัญญา (move-out / terminate)', () => {
  const tag = `tr${Date.now()}`;
  let admin, building;
  const roomIds = [];
  const tenantIds = [];

  const mkTenant = async (name) => {
    const t = await prisma.tenant.create({ data: { firstName: name, lastName: tag, phone: `09${Math.floor(Math.random() * 1e8)}`, lineUserId: `U_${tag}_${name}_${tenantIds.length}` } });
    await prisma.userLineAccount.create({ data: { tenantId: t.id, buildingId: building.id, lineUserId: t.lineUserId } });
    tenantIds.push(t.id);
    return t;
  };

  // ห้อง 1: main + roommate (leaver) + stayer (ยังมีห้อง 2 ในตึกเดียวกัน)
  const setup = async () => {
    const main = await mkTenant('main');
    const leaver = await mkTenant('leaver');
    const stayer = await mkTenant('stayer');
    const room = await prisma.room.create({ data: { roomNumber: `${tag}a${roomIds.length}`, floor: 1, price: 1000, status: 'occupied', buildingId: building.id, tenantId: main.id } });
    const other = await prisma.room.create({ data: { roomNumber: `${tag}b${roomIds.length}`, floor: 1, price: 1000, status: 'occupied', buildingId: building.id, tenantId: stayer.id } });
    roomIds.push(room.id, other.id);
    await prisma.roomResident.createMany({ data: [{ roomId: room.id, tenantId: leaver.id }, { roomId: room.id, tenantId: stayer.id }] });
    const lease = await prisma.leaseContract.create({ data: { roomId: room.id, tenantId: main.id, buildingId: building.id, startDate: new Date(), expectedEndDate: new Date(Date.now() + 86400000), status: 'ACTIVE' } });
    return { main, leaver, stayer, room, lease };
  };

  const expectReleased = async ({ main, leaver, stayer, room }) => {
    expect((await prisma.roomResident.findMany({ where: { roomId: room.id, status: 'ACTIVE' } })).length).toBe(0);
    for (const t of [main, leaver]) {
      expect((await prisma.tenant.findUnique({ where: { id: t.id } })).lineUserId).toBeNull();
      expect(await prisma.userLineAccount.count({ where: { tenantId: t.id } })).toBe(0);
    }
    expect((await prisma.tenant.findUnique({ where: { id: stayer.id } })).lineUserId).toBe(stayer.lineUserId);
    expect(await prisma.userLineAccount.count({ where: { tenantId: stayer.id } })).toBe(1);
  };

  beforeAll(async () => {
    admin = await prisma.user.findFirst({ where: { role: { in: ['OWNER', 'owner'] } } });
    building = await prisma.building.findFirst();
  });

  afterAll(async () => {
    await prisma.leaseContract.deleteMany({ where: { roomId: { in: roomIds } } });
    await prisma.moveOutRecord.deleteMany({ where: { lease: { roomId: { in: roomIds } } } }).catch(() => {});
    await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  });

  test('process-move-out: ผู้อยู่ร่วมและผู้เช่าหลักถูกตัดสิทธิ์ ส่วนคนที่ยังมีห้องอื่นในตึกไม่ถูกตัด และกดซ้ำได้ 400', async () => {
    const s = await setup();
    const url = `/api/admin/leases/${s.lease.id}/process-move-out`;
    const auth = { Authorization: `Bearer ${authService.generateAccessToken(admin)}` };
    expect((await request(app).post(url).set(auth).send({})).statusCode).toBe(200);
    await expectReleased(s);
    expect((await request(app).post(url).set(auth).send({})).statusCode).toBe(400);
  });

  test('terminate: ผลเหมือน process-move-out', async () => {
    const s = await setup();
    const res = await request(app).post(`/api/admin/leases/${s.lease.id}/terminate`).set({ Authorization: `Bearer ${authService.generateAccessToken(admin)}` }).send({});
    expect(res.statusCode).toBe(200);
    await expectReleased(s);
  });
});
