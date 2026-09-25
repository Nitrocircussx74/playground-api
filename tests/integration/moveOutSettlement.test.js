const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');
const { prisma } = billingService;

describe('ย้ายออก: คิดเงินจาก BuildingSetting, บันทึกเลขมิเตอร์สุดท้าย, ตัดบิลค้างด้วยมัดจำ, ตรวจ input', () => {
  const tag = `mo${Date.now()}`;
  let auth, building;
  const created = { leases: [], rooms: [], tenants: [] };

  // ห้องในตึกที่น้ำฟรี (waterRate 0) ไฟหน่วยละ 5 มิเตอร์เดิม น้ำ 100 ไฟ 1000 บิลค้าง 3000
  const setup = async (deposit) => {
    const tenant = await prisma.tenant.create({ data: { firstName: 'mo', lastName: tag, phone: `09${Math.floor(Math.random() * 1e8)}` } });
    const room = await prisma.room.create({ data: { roomNumber: `${tag}${created.rooms.length}`, floor: 1, price: 1000, status: 'occupied', buildingId: building.id, tenantId: tenant.id } });
    for (const [meterType, current] of [['water', 100], ['electric', 1000]]) {
      await prisma.meterRecord.create({ data: { roomId: room.id, meterType, billingCycle: '08-2026', previousReading: 0, currentReading: current, unitsUsed: current, recordedAt: new Date(Date.now() - 86400000) } });
    }
    const invoice = await prisma.invoice.create({
      data: { invoiceNumber: `INV-${tag}-${created.rooms.length}`, roomId: room.id, tenantId: tenant.id, billingCycle: '08-2026', roomPrice: 3000, waterTotal: 0, electricTotal: 0, commonFee: 0, otherFee: 0, grandTotal: 3000, status: 'pending', dueDate: new Date() }
    });
    const lease = await prisma.leaseContract.create({ data: { roomId: room.id, tenantId: tenant.id, buildingId: building.id, startDate: new Date(), expectedEndDate: new Date(Date.now() + 86400000), depositAmount: deposit, status: 'ACTIVE' } });
    created.leases.push(lease.id); created.rooms.push(room.id); created.tenants.push(tenant.id);
    return { tenant, room, invoice, lease };
  };

  beforeAll(async () => {
    const admin = await prisma.user.findFirst({ where: { role: { in: ['OWNER', 'owner'] } } });
    auth = { Authorization: `Bearer ${authService.generateAccessToken(admin)}` };
    building = await prisma.building.create({ data: { name: `${tag}-bld` } });
    await prisma.buildingSetting.create({ data: { buildingId: building.id, waterRate: 0, electricRate: 5 } });
  });

  afterAll(async () => {
    await prisma.moveOutRecord.deleteMany({ where: { leaseId: { in: created.leases } } });
    await prisma.leaseContract.deleteMany({ where: { id: { in: created.leases } } });
    await prisma.meterRecord.deleteMany({ where: { roomId: { in: created.rooms } } });
    await prisma.invoice.deleteMany({ where: { roomId: { in: created.rooms } } });
    await prisma.room.deleteMany({ where: { id: { in: created.rooms } } });
    await prisma.tenant.deleteMany({ where: { id: { in: created.tenants } } });
    await prisma.building.delete({ where: { id: building.id } });
  });

  test('พรีวิว: อัตราน้ำ 0 ต้องคิดเป็นฟรี (ไม่ใช่ 18) และไฟตามอัตราของตึก', async () => {
    const { lease } = await setup(10000);
    const res = await request(app).get(`/api/admin/leases/${lease.id}/move-out-calculation?finalWater=150&finalElectric=1100`).set(auth);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.finalWaterTotal).toBe(0);
    expect(res.body.data.finalElectricTotal).toBe(500);
    expect(res.body.data.unpaidInvoicesTotal).toBe(3000);
  });

  test('เลขมิเตอร์ต่ำกว่าเดิม/ไม่ใช่ตัวเลข/ค่าเสียหายติดลบ/วันที่เพี้ยน: 400 และไม่จบสัญญา', async () => {
    const { lease } = await setup(10000);
    expect((await request(app).get(`/api/admin/leases/${lease.id}/move-out-calculation?finalWater=50`).set(auth)).statusCode).toBe(400);
    const post = (body) => request(app).post(`/api/admin/leases/${lease.id}/process-move-out`).set(auth).send(body);
    expect((await post({ finalWaterMeter: 'abc' })).statusCode).toBe(400);
    expect((await post({ damageCharges: [{ amount: -500 }] })).statusCode).toBe(400);
    expect((await post({ moveOutDate: 'not-a-date' })).statusCode).toBe(400);
    expect((await prisma.leaseContract.findUnique({ where: { id: lease.id } })).status).toBe('ACTIVE');
  });

  test('ย้ายออกเมื่อมัดจำพอ: คืนสุทธิถูก, บิลค้างถูกตัดจ่ายด้วยมัดจำ, เลขมิเตอร์สุดท้ายเป็นเลขก่อนหน้าของคนถัดไป', async () => {
    const { lease, room, invoice } = await setup(10000);
    const res = await request(app).post(`/api/admin/leases/${lease.id}/process-move-out`).set(auth)
      .send({ finalWaterMeter: 150, finalElectricMeter: 1100, damageCharges: [{ amount: 200 }] });
    expect(res.statusCode).toBe(200);
    expect(Number(res.body.data.moveOutRecord.netRefund)).toBe(6300);

    const paid = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(paid.status).toBe('paid');
    expect(paid.paymentMethod).toBe('DEPOSIT');

    expect((await billingService.getPreviousReading(prisma, room.id, 'water', '09-2026')).previousReading).toBe(150);
    expect((await billingService.getPreviousReading(prisma, room.id, 'electric', '09-2026')).previousReading).toBe(1100);
  });

  test('ย้ายออกเมื่อมัดจำไม่พอ: netRefund ติดลบ และบิลค้างยังไม่ถูกตัดจ่าย', async () => {
    const { lease, invoice } = await setup(1000);
    const res = await request(app).post(`/api/admin/leases/${lease.id}/process-move-out`).set(auth).send({});
    expect(res.statusCode).toBe(200);
    expect(Number(res.body.data.moveOutRecord.netRefund)).toBe(-2000);
    expect((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status).toBe('pending');
  });
});
