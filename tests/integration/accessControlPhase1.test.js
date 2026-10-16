const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/config/prisma');
const authService = require('../../src/services/authService');

// เทสต์กันถอยหลังของเฟส 1: ห้ามมีบัญชี/ผู้เช่า/แอดมินตึกอื่น เข้าถึงข้อมูลที่ไม่ใช่สิทธิ์ของตน และ hash ห้ามหลุดใน Response
describe('Access control & secret leakage (Phase 1)', () => {
  const tag = `p1_${Date.now()}`;
  let adminA, buildingA, buildingB, roomA, roomB, tenantA, invoiceB;
  let tenantToken, adminAToken, ownerToken, ownerUser;

  beforeAll(async () => {
    adminA = await prisma.user.create({
      data: { email: `${tag}@dorm.com`, passwordHash: 'x', name: 'Admin A', role: 'admin' }
    });
    buildingA = await prisma.building.create({ data: { name: `${tag} A` } });
    buildingB = await prisma.building.create({ data: { name: `${tag} B` } });
    await prisma.userBuildingPermission.create({ data: { userId: adminA.id, buildingId: buildingA.id } });

    tenantA = await prisma.tenant.create({
      data: { firstName: 'Leak', lastName: 'Test', phone: '0800000001', pinHash: 'SECRET_PIN_HASH', passwordHash: 'SECRET_PW_HASH' }
    });
    roomA = await prisma.room.create({ data: { buildingId: buildingA.id, roomNumber: '101', floor: 1, price: 1000, status: 'occupied', tenantId: tenantA.id } });
    roomB = await prisma.room.create({ data: { buildingId: buildingB.id, roomNumber: '101', floor: 1, price: 1000, status: 'vacant' } });
    invoiceB = await prisma.invoice.create({
      data: {
        invoiceNumber: `${tag}-B`, roomId: roomB.id, tenantId: tenantA.id, billingCycle: '2026-01', roomPrice: 1000,
        waterTotal: 0, electricTotal: 0, commonFee: 0, otherFee: 0, lateFeeCharge: 0, grandTotal: 1000,
        status: 'pending', dueDate: new Date()
      }
    });

    adminAToken = authService.generateAccessToken(adminA);
    ownerUser = await prisma.user.create({ data: { email: `${tag}_owner@dorm.com`, passwordHash: 'x', name: 'Owner', role: 'owner' } });
    ownerToken = authService.generateAccessToken(ownerUser);
    tenantToken = authService.generateAccessToken({ id: tenantA.id, tenantId: tenantA.id, name: 'T', role: 'tenant', email: 't@x.com' });
  });

  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { invoiceNumber: { startsWith: tag } } });
    await prisma.room.deleteMany({ where: { id: { in: [roomA.id, roomB.id] } } });
    await prisma.tenant.delete({ where: { id: tenantA.id } });
    await prisma.building.deleteMany({ where: { id: { in: [buildingA.id, buildingB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [adminA.id, ownerUser.id] } } });
  });

  const get = (url, token) => request(app).get(url).set('Authorization', `Bearer ${token}`);

  test('ผู้เช่า (role tenant) ต้องอ่านตึก/ห้อง/บิลผ่าน API ฝั่งแอดมินไม่ได้ (403)', async () => {
    expect((await get(`/api/v1/buildings/${buildingA.id}`, tenantToken)).statusCode).toBe(403);
    expect((await get(`/api/v1/buildings/${buildingA.id}/settings`, tenantToken)).statusCode).toBe(403);
    expect((await get(`/api/v1/rooms/${roomA.id}`, tenantToken)).statusCode).toBe(403);
    expect((await get('/api/v1/invoices', tenantToken)).statusCode).toBe(403);
    expect((await get(`/api/v1/invoices/${invoiceB.id}/export`, tenantToken)).statusCode).toBe(403);
  });

  test('แอดมินตึก A เข้าถึงตึก B / ห้อง B / บิล B / ออกบิลตึก B ไม่ได้ (403) แต่ตึกตัวเองได้', async () => {
    expect((await get(`/api/v1/buildings/${buildingB.id}/settings`, adminAToken)).statusCode).toBe(403);
    expect((await get(`/api/v1/rooms/${roomB.id}`, adminAToken)).statusCode).toBe(403);
    expect((await get(`/api/v1/invoices/${invoiceB.id}/export`, adminAToken)).statusCode).toBe(403);
    expect((await request(app).post(`/api/admin/buildings/${buildingB.id}/invoices/publish`).set('Authorization', `Bearer ${adminAToken}`).send({})).statusCode).toBe(403);
    expect((await get(`/api/v1/buildings/${buildingA.id}/settings`, adminAToken)).statusCode).toBe(200);
  });

  test('รายการบิลที่ไม่ระบุตึก ต้องเห็นเฉพาะตึกที่มีสิทธิ์', async () => {
    const res = await get('/api/v1/invoices', adminAToken);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.some((i) => i.id === invoiceB.id)).toBe(false);
  });

  test('Response ต้องไม่มี pinHash/passwordHash ของผู้เช่า แม้เจ้าของเรียกดูตึกที่ include ผู้เช่ามาทั้ง Record', async () => {
    const res = await get(`/api/v1/buildings/${buildingA.id}`, ownerToken);
    expect(res.statusCode).toBe(200);
    const raw = JSON.stringify(res.body);
    expect(raw).toContain('Leak'); // มีข้อมูลผู้เช่าอยู่จริง
    expect(raw).not.toMatch(/pinHash|passwordHash|SECRET_PIN_HASH|SECRET_PW_HASH/);
  });

  test('route แนบสลิปแบบเก่า (ไม่ตรวจสิทธิ์) ต้องถูกยกเลิกแล้ว', async () => {
    const res = await request(app).post(`/api/v1/invoices/${invoiceB.id}/payment-slips`).set('Authorization', `Bearer ${ownerToken}`).send({});
    expect(res.statusCode).toBe(404);
  });

  const post = (url, token, body = {}) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body);

  test('ประมวลผลค่าปรับ/ทวงหนี้แบบกลุ่ม: ระบุตึกอื่นได้ 403 และไม่ระบุตึกจะทำเฉพาะตึกที่มีสิทธิ์', async () => {
    expect((await post('/api/v1/invoices/process-late-fees', adminAToken, { buildingId: buildingB.id })).statusCode).toBe(403);
    expect((await post('/api/v1/invoices/remind-bulk', adminAToken, { buildingId: buildingB.id })).statusCode).toBe(403);
    expect((await post('/api/v1/dashboard/remind-debtors', adminAToken, { buildingId: buildingB.id })).statusCode).toBe(403);

    // ตึก A ไม่มีบิลค้างเลย ต้องไม่แตะบิลค้างของตึก B (owner เห็นบิลค้างทุกตึก)
    const late = await post('/api/v1/invoices/process-late-fees', adminAToken);
    expect(late.body.data.totalProcessed).toBe(0);
    expect((await post('/api/v1/invoices/remind-bulk', adminAToken)).body.data.total).toBe(0);
    expect((await post('/api/v1/dashboard/remind-debtors', adminAToken)).body.data.totalDebtors).toBe(0);

    expect((await post('/api/v1/invoices/process-late-fees', ownerToken)).body.data.totalProcessed).toBeGreaterThanOrEqual(1);
    expect((await post('/api/v1/dashboard/remind-debtors', ownerToken)).body.data.totalDebtors).toBeGreaterThanOrEqual(1);
  });

  test('role ใน Token ไม่มีผลเหนือ DB: Token ที่อ้าง owner ของบัญชี admin ยังเป็นสิทธิ์ admin', async () => {
    const forged = authService.generateAccessToken({ ...adminA, role: 'owner' });
    expect((await get('/api/admin/users', forged)).statusCode).toBe(403); // endpoint เฉพาะ owner
    expect((await get('/api/admin/users', ownerToken)).statusCode).toBe(200);
  });

  test('บัญชีที่ถูกลบแล้ว ใช้ Token เดิม (ยังไม่หมดอายุ) ไม่ได้ (401)', async () => {
    const temp = await prisma.user.create({ data: { email: `${tag}_temp@dorm.com`, passwordHash: 'x', name: 'Temp', role: 'admin' } });
    const token = authService.generateAccessToken(temp);
    expect((await get('/auth/me', token)).statusCode).toBe(200);

    await prisma.user.delete({ where: { id: temp.id } });
    expect((await get('/auth/me', token)).statusCode).toBe(401);
  });
});
