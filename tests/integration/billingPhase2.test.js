const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/config/prisma');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

// เฟส 2: ยอดเงิน — อัตราจาก BuildingSetting เป็นแหล่งเดียว, ออกบิลซ้ำได้ปลอดภัย, ไม่ทับบิลที่เผยแพร่/จ่ายแล้ว,
// ค่าซ่อมไม่หาย, เลขบิลไม่ชนข้ามตึก
describe('Billing engine (Phase 2)', () => {
  const tag = `p2_${Date.now()}`;
  const CYCLE = '09-2026';
  const NEXT_CYCLE = '10-2026';
  let admin, token, bA, bB, tenantA, tenantB, roomA, roomB;

  const generate = (building, roomReadings, cycle = CYCLE) =>
    request(app)
      .post(`/api/admin/buildings/${building.id}/invoices/generate`)
      .set('Authorization', `Bearer ${token}`)
      .send({ billingCycle: cycle, roomReadings });
  const readings = (room, water, electric, extra = {}) => ({ roomId: room.id, currentWaterReading: water, currentElectricReading: electric, ...extra });
  const invoiceOf = (room, cycle = CYCLE) => prisma.invoice.findFirst({ where: { roomId: room.id, billingCycle: cycle } });

  beforeAll(async () => {
    admin = await prisma.user.create({ data: { email: `${tag}@dorm.com`, passwordHash: 'x', name: 'Billing Admin', role: 'admin' } });
    token = authService.generateAccessToken(admin);

    bA = await prisma.building.create({ data: { name: `${tag} A` } });
    bB = await prisma.building.create({ data: { name: `${tag} B` } });
    await prisma.buildingSetting.create({ data: { buildingId: bA.id, waterRate: 20, electricRate: 9, dueDateDay: 5 } });
    await prisma.userBuildingPermission.createMany({ data: [{ userId: admin.id, buildingId: bA.id }, { userId: admin.id, buildingId: bB.id }] });

    tenantA = await prisma.tenant.create({ data: { firstName: 'A', lastName: 'T', phone: '0810000001' } });
    tenantB = await prisma.tenant.create({ data: { firstName: 'B', lastName: 'T', phone: '0810000002' } });
    // เลขห้องเดียวกัน (101) ในสองตึก
    roomA = await prisma.room.create({ data: { buildingId: bA.id, roomNumber: '101', floor: 1, price: 5000, status: 'occupied', tenantId: tenantA.id } });
    roomB = await prisma.room.create({ data: { buildingId: bB.id, roomNumber: '101', floor: 1, price: 4000, status: 'occupied', tenantId: tenantB.id } });

    for (const room of [roomA, roomB]) {
      await prisma.meterRecord.createMany({
        data: [
          { roomId: room.id, meterType: 'water', previousReading: 0, currentReading: 100, unitsUsed: 100, billingCycle: '08-2026', recordedAt: new Date('2026-08-31') },
          { roomId: room.id, meterType: 'electric', previousReading: 0, currentReading: 200, unitsUsed: 200, billingCycle: '08-2026', recordedAt: new Date('2026-08-31') }
        ]
      });
    }
  });

  afterAll(async () => {
    const roomIds = [roomA.id, roomB.id];
    await prisma.maintenanceRequest.deleteMany({ where: { roomId: { in: roomIds } } });
    await prisma.invoice.deleteMany({ where: { roomId: { in: roomIds } } });
    await prisma.meterRecord.deleteMany({ where: { roomId: { in: roomIds } } });
    await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
    await prisma.buildingSetting.deleteMany({ where: { buildingId: { in: [bA.id, bB.id] } } });
    await prisma.building.deleteMany({ where: { id: { in: [bA.id, bB.id] } } });
    await prisma.user.delete({ where: { id: admin.id } });
  });

  test('ค่าน้ำ/ไฟคิดจากอัตราใน BuildingSetting ของตึก (ไม่มีขั้นต่ำน้ำ 150 แบบ hardcode)', async () => {
    // ใช้น้ำ 3 หน่วย ไฟ 10 หน่วย (ตึก A: น้ำ 20, ไฟ 9) — เดิมน้ำ <= 5 หน่วยถูกคิดขั้นต่ำ 150
    const res = await generate(bA, [readings(roomA, 103, 210)]);
    expect(res.statusCode).toBe(201);
    const inv = await invoiceOf(roomA);
    expect(Number(inv.waterTotal)).toBe(60);
    expect(Number(inv.electricTotal)).toBe(90);
    expect(Number(inv.grandTotal)).toBe(5000 + 60 + 90 + 100);
    expect(inv.status).toBe('draft');
  });

  test('ออกบิลรอบเดิมซ้ำ ยอดต้องเท่าเดิม และมี MeterRecord รอบนี้แค่ 1 แถวต่อชนิด (เดิมหน่วยกลายเป็น 0)', async () => {
    const before = await invoiceOf(roomA);
    const again = await generate(bA, [readings(roomA, 103, 210)]);
    expect(again.statusCode).toBe(201);
    const after = await invoiceOf(roomA);

    expect(Number(after.waterTotal)).toBe(60);
    expect(Number(after.grandTotal)).toBe(Number(before.grandTotal));
    expect(await prisma.meterRecord.count({ where: { roomId: roomA.id, billingCycle: CYCLE } })).toBe(2);

    // แก้เลขมิเตอร์แล้วออกซ้ำ ต้องคำนวณจากเลขรอบก่อน (100/200) ไม่ใช่จากค่าที่เพิ่งบันทึก
    await generate(bA, [readings(roomA, 105, 220)]);
    const corrected = await invoiceOf(roomA);
    expect(Number(corrected.waterTotal)).toBe(100);
    expect(Number(corrected.electricTotal)).toBe(180);
  });

  test('รอบถัดไปอ้างเลขมิเตอร์ของรอบก่อน และดึงเลขก่อนหน้าใน draft ถูกต้อง', async () => {
    const draft = await request(app).get(`/api/admin/buildings/${bA.id}/meters/draft`).query({ billingCycle: NEXT_CYCLE }).set('Authorization', `Bearer ${token}`);
    const row = draft.body.data.rooms.find((r) => r.roomId === roomA.id);
    expect(row.previousWaterReading).toBe(105);
    expect(draft.body.data.rates.waterRate).toBe(20);

    // รอบเดิมต้องเห็นเลขก่อนหน้าเป็นรอบ 08 ไม่ใช่ค่าที่เพิ่งบันทึกในรอบนี้
    const cur = await request(app).get(`/api/admin/buildings/${bA.id}/meters/draft`).query({ billingCycle: CYCLE }).set('Authorization', `Bearer ${token}`);
    expect(cur.body.data.rooms.find((r) => r.roomId === roomA.id).previousWaterReading).toBe(100);

    await generate(bA, [readings(roomA, 125, 240)], NEXT_CYCLE);
    const inv = await invoiceOf(roomA, NEXT_CYCLE);
    expect(Number(inv.waterTotal)).toBe(400); // (125-105) x 20
  });

  test('เลขมิเตอร์ต่ำกว่าเลขก่อนหน้า ต้องปฏิเสธ 400 และไม่บันทึกอะไรเลย', async () => {
    const recordsBefore = await prisma.meterRecord.count({ where: { roomId: roomB.id } });
    const res = await generate(bB, [readings(roomB, 50, 300)]);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('101');
    expect(await prisma.meterRecord.count({ where: { roomId: roomB.id } })).toBe(recordsBefore);
    expect(await invoiceOf(roomB)).toBeNull();
  });

  test('ข้อมูลไม่ถูกต้อง (NaN/ค่าว่าง/ติดลบ) ต้องปฏิเสธ 400 ก่อนเริ่มบันทึก', async () => {
    for (const bad of [{ currentWaterReading: 'abc' }, { currentWaterReading: '' }, { currentElectricReading: -1 }, { otherFee: -5 }]) {
      expect((await generate(bA, [{ ...readings(roomA, 130, 250), ...bad }])).statusCode).toBe(400);
    }
  });

  test('เลขห้องซ้ำกันคนละตึก (101) ต้องออกบิลได้ทั้งคู่ และเลขบิลไม่ชนกัน', async () => {
    const res = await generate(bB, [readings(roomB, 110, 230)]);
    expect(res.statusCode).toBe(201);
    const a = await invoiceOf(roomA);
    const b = await invoiceOf(roomB);
    expect(a.invoiceNumber).not.toBe(b.invoiceNumber);
    expect(b.invoiceNumber).toMatch(/^INV-092026-[0-9A-F]{6}-101$/);
    // ตึก B ไม่มีแถว BuildingSetting ใช้ค่าสำรองเท่า default ใน schema (น้ำ 18, ไฟ 7)
    expect(Number(b.waterTotal)).toBe(180);
    expect(Number(b.electricTotal)).toBe(210);
  });

  test('billingService.generateInvoice (ทางที่สอง) ใช้อัตราจาก setting เหมือนกัน: ไม่มีขั้นต่ำน้ำ และเลขบิลไม่ชนข้ามตึก', async () => {
    // ห้อง B เลขก่อนหน้าคือรอบ 09 (น้ำ 110, ไฟ 230) → ใช้น้ำ 3 หน่วย ไฟ 5 หน่วย ตามอัตราค่าสำรอง (18/7)
    await billingService.recordMeterReading({ roomId: roomB.id, meterType: 'water', currentReading: 113, billingCycle: NEXT_CYCLE });
    await billingService.recordMeterReading({ roomId: roomB.id, meterType: 'electric', currentReading: 235, billingCycle: NEXT_CYCLE });
    // บันทึกซ้ำรอบเดิมต้องแก้ค่าเดิม ไม่เพิ่มแถว และยังอ้างเลขรอบก่อน
    await billingService.recordMeterReading({ roomId: roomB.id, meterType: 'water', currentReading: 113, billingCycle: NEXT_CYCLE });
    expect(await prisma.meterRecord.count({ where: { roomId: roomB.id, meterType: 'water', billingCycle: NEXT_CYCLE } })).toBe(1);

    const inv = await billingService.generateInvoice({ roomId: roomB.id, billingCycle: NEXT_CYCLE });
    expect(Number(inv.waterTotal)).toBe(54); // เดิมโดนขั้นต่ำ 150
    expect(Number(inv.electricTotal)).toBe(35); // เดิมอัตรา 8 → 40
    expect(inv.invoiceNumber).toMatch(/^INV-102026-[0-9A-F]{6}-101$/);

    // ตึก A ห้อง 101 รอบเดียวกันก็ต้องออกได้ (เลขบิลต่างกัน)
    const invA = await invoiceOf(roomA, NEXT_CYCLE);
    expect(invA.invoiceNumber).not.toBe(inv.invoiceNumber);
  });

  test('ห้องของตึกอื่นที่ปนมาใน roomReadings ต้องถูกข้าม ไม่ออกบิลข้ามตึก', async () => {
    const res = await generate(bA, [readings(roomB, 300, 400)], '12-2026');
    expect(res.statusCode).toBe(201);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.skipped[0].reason).toContain('ไม่พบห้องนี้ในตึก');
    expect(await invoiceOf(roomB, '12-2026')).toBeNull();
  });

  test('บิลที่เผยแพร่/ชำระ/รอตรวจสลิปแล้ว ต้องไม่ถูกออกซ้ำทับ (ข้ามและรายงานใน skipped)', async () => {
    for (const status of ['pending', 'reviewing', 'paid']) {
      await prisma.invoice.update({ where: { id: (await invoiceOf(roomA)).id }, data: { status } });
      const before = await invoiceOf(roomA);
      const res = await generate(bA, [readings(roomA, 131, 261)]);

      expect(res.statusCode).toBe(201);
      expect(res.body.skipped).toHaveLength(1);
      const after = await invoiceOf(roomA);
      expect(after.status).toBe(status);
      expect(Number(after.grandTotal)).toBe(Number(before.grandTotal));
    }
    await prisma.invoice.update({ where: { id: (await invoiceOf(roomA)).id }, data: { status: 'draft' } });
  });

  test('ค่าซ่อมที่ผู้เช่าจ่ายเอง ถูกรวมเข้าบิล และไม่หายเมื่อออกบิลซ้ำ', async () => {
    const repair = await prisma.maintenanceRequest.create({
      data: { roomId: roomA.id, title: 'ก๊อกน้ำ', description: 'd', payer: 'TENANT', status: 'resolved', repairCost: 500 }
    });

    await generate(bA, [readings(roomA, 105, 220)]);
    let inv = await invoiceOf(roomA);
    expect(Number(inv.otherFee)).toBe(500);
    expect((await prisma.maintenanceRequest.findUnique({ where: { id: repair.id } })).billedInvoiceId).toBe(inv.id);

    await generate(bA, [readings(roomA, 105, 220)]); // ออกซ้ำ: เดิมค่าซ่อมหายไปจากยอดทั้งที่ถูกมาร์กว่าเรียกเก็บแล้ว
    inv = await invoiceOf(roomA);
    expect(Number(inv.otherFee)).toBe(500);
    expect(Number(inv.grandTotal)).toBe(5000 + 100 + 180 + 100 + 500);
  });

  test('แนบสลิปกับบิลที่ชำระแล้ว ต้องปฏิเสธ 409 และสถานะยังเป็น paid', async () => {
    const inv = await invoiceOf(roomA);
    await prisma.invoice.update({ where: { id: inv.id }, data: { status: 'paid', paidAt: new Date() } });

    await expect(billingService.uploadSlipFromLiff({ id: inv.id, lineUserId: null, file: { buffer: Buffer.from('x') }, slipUrl: 'http://x/y.png' }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect((await invoiceOf(roomA)).status).toBe('paid');
  });
});
