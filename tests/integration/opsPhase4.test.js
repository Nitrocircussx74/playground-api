const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/app');
const prisma = require('../../src/config/prisma');
const authService = require('../../src/services/authService');
const { MAX_FAILS } = require('../../src/utils/attemptLimiter');

describe('Ops hardening (Phase 4)', () => {
  const tag = `p4_${Date.now()}`;
  let victim, other, admin, adminToken, building, room;

  beforeAll(async () => {
    const pinHash = await bcrypt.hash('123456', 4);
    victim = await prisma.tenant.create({ data: { firstName: 'V', lastName: 'T', phone: '0820000001', pinHash, lineUserId: `U_${tag}_v` } });
    other = await prisma.tenant.create({ data: { firstName: 'O', lastName: 'T', phone: '0820000002', pinHash, lineUserId: `U_${tag}_o` } });

    admin = await prisma.user.create({ data: { email: `${tag}@dorm.com`, passwordHash: 'x', name: 'Ops Admin', role: 'admin' } });
    adminToken = authService.generateAccessToken(admin);
    building = await prisma.building.create({ data: { name: `${tag} B` } });
    await prisma.userBuildingPermission.create({ data: { userId: admin.id, buildingId: building.id } });
    room = await prisma.room.create({ data: { buildingId: building.id, roomNumber: '1', floor: 1, price: 1, status: 'occupied', tenantId: victim.id } });
  });

  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { invoiceNumber: { startsWith: tag } } });
    await prisma.room.deleteMany({ where: { id: room.id } });
    await prisma.building.deleteMany({ where: { id: building.id } });
    await prisma.tenant.deleteMany({ where: { id: { in: [victim.id, other.id] } } });
    await prisma.user.delete({ where: { id: admin.id } });
  });

  const pinLogin = (lineUserId, pin) => request(app).post('/api/v1/liff/auth/pin-login').send({ lineIdToken: lineUserId, pin });

  test('กรอก PIN ผิดครบกำหนดต่อบัญชี ต้องล็อก (429) แม้ภายหลังกรอก PIN ถูก และไม่กระทบผู้เช่าคนอื่น', async () => {
    for (let i = 0; i < MAX_FAILS; i++) {
      expect((await pinLogin(victim.lineUserId, '000000')).statusCode).toBe(401);
    }
    const locked = await pinLogin(victim.lineUserId, '123456');
    expect(locked.statusCode).toBe(429);
    expect(locked.body.code).toBe('TOO_MANY_ATTEMPTS');

    expect((await pinLogin(other.lineUserId, '123456')).statusCode).toBe(200);
  });

  test('ลบบิลที่ชำระแล้วไม่ได้ (409) แต่ลบบิลที่ยังไม่ชำระได้', async () => {
    const base = { roomId: room.id, tenantId: victim.id, billingCycle: '09-2026', roomPrice: 1, waterTotal: 0, electricTotal: 0, commonFee: 0, otherFee: 0, lateFeeCharge: 0, grandTotal: 1, dueDate: new Date() };
    const paid = await prisma.invoice.create({ data: { ...base, invoiceNumber: `${tag}-paid`, status: 'paid', paidAt: new Date() } });
    const pending = await prisma.invoice.create({ data: { ...base, billingCycle: '10-2026', invoiceNumber: `${tag}-pending`, status: 'pending' } });

    const del = (id) => request(app).delete(`/api/v1/invoices/${id}`).set('Authorization', `Bearer ${adminToken}`);
    expect((await del(paid.id)).statusCode).toBe(409);
    expect(await prisma.invoice.findUnique({ where: { id: paid.id } })).not.toBeNull();
    expect((await del(pending.id)).statusCode).toBe(200);
  });

  test('TRUST_PROXY อ่านจาก env: ตัวเลขใช้ตามนั้น, ไม่ตั้ง/ค่าไม่ถูกต้องใช้ 1', () => {
    const read = (value) => {
      const prev = process.env.TRUST_PROXY;
      if (value === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = value;
      let result;
      jest.isolateModules(() => { result = require('../../src/config/env').trustProxy; });
      if (prev === undefined) delete process.env.TRUST_PROXY; else process.env.TRUST_PROXY = prev;
      return result;
    };
    expect(read('0')).toBe(0);
    expect(read('2')).toBe(2);
    expect(read(undefined)).toBe(1);
    expect(read('')).toBe(1);
    expect(read('abc')).toBe(1);
  });
});
