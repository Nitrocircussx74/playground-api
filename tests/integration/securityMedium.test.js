const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../../src/app');
const config = require('../../src/config/env');
const authService = require('../../src/services/authService');
const lateFeeService = require('../../src/services/lateFeeService');
const prisma = require('../../src/config/prisma');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('x')]);

describe('ช่องโหว่ระดับกลางจาก audit', () => {
  const tag = `sm_${Date.now()}`;
  const PASSWORD = 'password123';
  let admin, owner, ownerTok;

  const login = () => request(app).post('/auth/login').send({ email: admin.email, password: PASSWORD });
  const cookieOf = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('refreshToken=')).split(';')[0];

  beforeAll(async () => {
    admin = await prisma.user.create({ data: { email: `${tag}@dorm.com`, passwordHash: await bcrypt.hash(PASSWORD, 4), name: 'sm', role: 'admin' } });
    owner = await prisma.user.findFirst({ where: { role: { in: ['OWNER', 'owner'] } } });
    ownerTok = authService.generateAccessToken(owner);
  });
  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId: admin.id } });
    await prisma.user.delete({ where: { id: admin.id } });
  });

  test('5xx ไม่ส่งข้อความ error ภายใน (Prisma/path) ออกไป', async () => {
    const res = await request(app).get('/api/v1/rooms/not-a-uuid').set('Authorization', `Bearer ${ownerTok}`);
    expect(res.statusCode).toBe(500);
    expect(res.body.message).not.toMatch(/prisma|invocation|\.js/i);
  });

  test('URL ไฟล์อัปโหลดใช้ PUBLIC_BASE_URL ไม่เชื่อ Host header', async () => {
    const fs = require('fs');
    const path = require('path');
    config.publicBaseUrl = 'https://api.example.com';
    try {
      const res = await request(app).post('/api/v1/uploads').set('Authorization', `Bearer ${ownerTok}`).set('Host', 'evil.example').attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
      expect(res.body.data.url).toBe(`https://api.example.com/uploads/${res.body.data.filename}`);
      fs.unlinkSync(path.join(__dirname, '../../public/uploads', res.body.data.filename));
    } finally {
      config.publicBaseUrl = '';
    }
  });

  test('อัปเดตสถานะบิล: ค่านอก whitelist ได้ 400 และไม่แก้บิล', async () => {
    const invoice = await prisma.invoice.findFirst();
    const res = await request(app).patch(`/api/v1/invoices/${invoice.id}/status`).set('Authorization', `Bearer ${ownerTok}`).send({ status: 'bogus' });
    expect(res.statusCode).toBe(400);
    expect((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status).toBe(invoice.status);
  });

  test('process-late-fees ไม่รับ targetDate จาก Client', async () => {
    const spy = jest.spyOn(lateFeeService, 'processLateFees');
    try {
      const res = await request(app).post('/api/v1/invoices/process-late-fees').set('Authorization', `Bearer ${ownerTok}`).send({ targetDate: '2099-01-01' });
      expect(res.statusCode).toBe(200);
      expect(spy.mock.calls[0][0]).not.toHaveProperty('targetDate');
    } finally {
      spy.mockRestore();
    }
  });

  test('refresh แพ้ race (grace window): 401 แต่ต้องไม่สั่งลบ cookie ที่อีกแท็บเพิ่งได้ไป', async () => {
    const cookie = cookieOf(await login());
    const [a, b] = await Promise.all([1, 2].map(() => request(app).post('/auth/refresh').set('Cookie', cookie)));
    const loser = a.statusCode === 401 ? a : b;
    expect(loser.statusCode).toBe(401);
    expect((loser.headers['set-cookie'] || []).some((c) => c.startsWith('refreshToken=;'))).toBe(false);

    // token ที่ไม่มีอยู่จริงยังโดนลบ cookie ตามเดิม
    const junk = authService.generateRefreshToken(admin);
    const dead = await request(app).post('/auth/refresh').set('Cookie', `refreshToken=${junk}`);
    expect(dead.statusCode).toBe(401);
    expect((dead.headers['set-cookie'] || []).some((c) => c.startsWith('refreshToken=;'))).toBe(true);
  });

  test('เปลี่ยนรหัสผ่านแล้ว session อื่นหลุด แต่ session ที่กำลังใช้งานอยู่ยังต่ออายุได้', async () => {
    const mine = await login();
    const other = cookieOf(await login());
    const res = await request(app).put('/api/admin/me/password').set('Authorization', `Bearer ${mine.body.accessToken}`).set('Cookie', cookieOf(mine))
      .send({ currentPassword: PASSWORD, newPassword: 'newpassword456' });
    expect(res.statusCode).toBe(200);
    expect((await request(app).post('/auth/refresh').set('Cookie', other)).statusCode).toBe(401);
    expect((await request(app).post('/auth/refresh').set('Cookie', cookieOf(mine))).statusCode).toBe(200);
  });

  test('CSV: ค่าที่ขึ้นต้นด้วยตัวอักษรสูตรถูกนำหน้าด้วย \' และ " ถูก escape', () => {
    const csvCell = require('../../src/utils/csvCell');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe(`"'+1"`);
    expect(csvCell('สมชาย')).toBe('"สมชาย"');
    expect(csvCell(null)).toBe('""');
  });

  test('GET /api/features เข้าถึงได้แบบ public (เดิม 404 เสมอ)', async () => {
    expect((await request(app).get('/api/features')).statusCode).toBe(200);
  });

  test('สร้างผู้ใช้แอดมิน: role นอก whitelist และรหัสผ่านสั้นเกินไปได้ 400, ADMIN ได้สิทธิ์ตึกตาม buildingIds', async () => {
    const post = (body) => request(app).post('/api/admin/users').set('Authorization', `Bearer ${ownerTok}`).send({ name: 'sm', ...body });
    expect((await post({ email: `${tag}_r@dorm.com`, password: 'password123', role: 'MANAGERR' })).statusCode).toBe(400);
    expect((await post({ email: `${tag}_p@dorm.com`, password: '1', role: 'MANAGER' })).statusCode).toBe(400);

    const building = await prisma.building.findFirst();
    const ok = await post({ email: `${tag}_a@dorm.com`, password: 'password123', role: 'ADMIN', buildingIds: [building.id] });
    expect(ok.statusCode).toBe(201);
    expect(await prisma.userBuildingPermission.count({ where: { userId: ok.body.data.id } })).toBe(1);
    await prisma.user.delete({ where: { id: ok.body.data.id } });
  });

  test('ออกบิลทั้งตึก: isReset ไม่ทำให้ rollback และ waiveCommonFee ยกเว้นค่าส่วนกลางรายห้อง', async () => {
    const building = await prisma.building.findFirst();
    const tenant = await prisma.tenant.create({ data: { firstName: 'sm', lastName: tag, phone: `09${Math.floor(Math.random() * 1e8)}` } });
    const room = await prisma.room.create({ data: { roomNumber: `${tag}r`, floor: 1, price: 1000, status: 'occupied', buildingId: building.id, tenantId: tenant.id } });
    try {
      for (const [meterType, current] of [['water', 100], ['electric', 1000]]) {
        await prisma.meterRecord.create({ data: { roomId: room.id, meterType, billingCycle: '01-2098', previousReading: 0, currentReading: current, unitsUsed: current, recordedAt: new Date(Date.now() - 86400000) } });
      }
      const res = await request(app).post(`/api/admin/buildings/${building.id}/invoices/generate`).set('Authorization', `Bearer ${ownerTok}`)
        .send({ billingCycle: '02-2098', commonFee: 100, roomReadings: [{ roomId: room.id, currentWaterReading: 5, currentElectricReading: 20, isReset: true, waiveCommonFee: true }] });
      expect(res.statusCode).toBe(201);
      expect(Number(res.body.data[0].commonFee)).toBe(0);
      const water = await prisma.meterRecord.findFirst({ where: { roomId: room.id, meterType: 'water', billingCycle: '02-2098' } });
      expect(Number(water.unitsUsed)).toBe(5);
    } finally {
      await prisma.invoice.deleteMany({ where: { roomId: room.id } });
      await prisma.meterRecord.deleteMany({ where: { roomId: room.id } });
      await prisma.room.delete({ where: { id: room.id } });
      await prisma.tenant.delete({ where: { id: tenant.id } });
    }
  });
});
