const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');
const { prisma } = billingService;
const { formatBillingCycle } = require('../../src/utils/formatBillingCycle');

const nextCycle = () => {
  const d = new Date();
  return formatBillingCycle(new Date(d.getFullYear(), d.getMonth() + 1, 1));
};

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

    // เลขตอนย้ายออกเป็น record ชุดเดิมของห้อง รอบ MM-YYYY ของเดือนที่ย้ายออก (ไม่มีรอบพิเศษ)
    const records = await prisma.meterRecord.findMany({ where: { roomId: room.id, meterType: 'water' } });
    expect(records.map((r) => r.billingCycle).sort()).toEqual(['08-2026', formatBillingCycle(new Date())].sort());
    expect((await billingService.getPreviousReading(prisma, room.id, 'water', nextCycle())).previousReading).toBe(150);
    expect((await billingService.getPreviousReading(prisma, room.id, 'electric', nextCycle())).previousReading).toBe(1100);
  });

  test('ย้ายออกเมื่อมัดจำไม่พอ: netRefund ติดลบ และบิลค้างยังไม่ถูกตัดจ่าย', async () => {
    const { lease, invoice } = await setup(1000);
    const res = await request(app).post(`/api/admin/leases/${lease.id}/process-move-out`).set(auth).send({});
    expect(res.statusCode).toBe(200);
    expect(Number(res.body.data.moveOutRecord.netRefund)).toBe(-2000);
    expect((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status).toBe('pending');
  });

  test('ผู้เช่าใหม่: บิลรอบแรกคิดหน่วยจากเลขที่จดตอนเข้าพัก ไม่ใช่เลขตอนคนเก่าย้ายออก และรอบถัดไปใช้ record ของตัวเอง', async () => {
    const { lease, room } = await setup(10000);
    await request(app).post(`/api/admin/leases/${lease.id}/process-move-out`).set(auth).send({ finalWaterMeter: 150, finalElectricMeter: 1100 });

    const newTenant = await prisma.tenant.create({ data: { firstName: 'new', lastName: tag, phone: `09${Math.floor(Math.random() * 1e8)}` } });
    created.tenants.push(newTenant.id);
    const start = new Date(Date.now() + 86400000);
    const res = await request(app).post(`/api/admin/rooms/${room.id}/leases`).set(auth)
      .send({ tenantId: newTenant.id, startDate: start.toISOString(), expectedEndDate: new Date(Date.now() + 30 * 86400000).toISOString(), initialWaterReading: 160, initialElectricReading: 1130 });
    expect(res.statusCode).toBe(201);
    created.leases.push(res.body.data.id);

    expect((await billingService.getPreviousReading(prisma, room.id, 'water', nextCycle())).previousReading).toBe(160);
    expect((await billingService.getPreviousReading(prisma, room.id, 'electric', nextCycle())).previousReading).toBe(1130);

    // มี record ของผู้เช่าใหม่เองหลังวันเข้าพักแล้ว รอบถัดไปต้องนับต่อจาก record นั้น
    await prisma.meterRecord.create({ data: { roomId: room.id, meterType: 'water', billingCycle: '12-2099', previousReading: 160, currentReading: 175, unitsUsed: 15, recordedAt: new Date(start.getTime() + 86400000) } });
    expect((await billingService.getPreviousReading(prisma, room.id, 'water', '01-2100')).previousReading).toBe(175);

    // เลขไม่ถูกต้อง: 400
    const bad = await request(app).post(`/api/admin/rooms/${room.id}/leases`).set(auth)
      .send({ tenantId: newTenant.id, startDate: start.toISOString(), expectedEndDate: start.toISOString(), initialWaterReading: -5 });
    expect(bad.statusCode).toBe(400);
  });

  test('จดเลขมิเตอร์วันเข้าพักทีหลัง (สัญญาที่สร้างผ่าน invite code): PATCH initial-readings ใช้เป็นเลขเริ่มนับ และตรวจ input/สถานะสัญญา', async () => {
    const { lease, room } = await setup(10000);
    const url = `/api/admin/leases/${lease.id}/initial-readings`;
    // ไม่มี record ใหม่กว่าวันเริ่มสัญญา + เลขที่จดต้องกลายเป็นเลขก่อนหน้าของรอบแรก
    await prisma.meterRecord.updateMany({ where: { roomId: room.id }, data: { recordedAt: new Date(Date.now() - 10 * 86400000) } });
    await prisma.leaseContract.update({ where: { id: lease.id }, data: { startDate: new Date(Date.now() - 86400000) } });

    expect((await request(app).patch(url).set(auth).send({})).statusCode).toBe(400);
    expect((await request(app).patch(url).set(auth).send({ initialWaterReading: -1 })).statusCode).toBe(400);
    expect((await request(app).patch(`/api/admin/leases/00000000-0000-4000-8000-000000000000/initial-readings`).set(auth).send({ initialWaterReading: 1 })).statusCode).toBe(404);

    const ok = await request(app).patch(url).set(auth).send({ initialWaterReading: 120, initialElectricReading: 1050 });
    expect(ok.statusCode).toBe(200);
    expect((await billingService.getPreviousReading(prisma, room.id, 'water', nextCycle())).previousReading).toBe(120);
    expect((await billingService.getPreviousReading(prisma, room.id, 'electric', nextCycle())).previousReading).toBe(1050);

    await request(app).post(`/api/admin/leases/${lease.id}/process-move-out`).set(auth).send({});
    expect((await request(app).patch(url).set(auth).send({ initialWaterReading: 130 })).statusCode).toBe(400);
  });
});
