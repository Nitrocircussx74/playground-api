const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const prisma = require('../../src/config/prisma');
const env = require('../../src/config/env');

// เฟส 3: refresh token, การยึดบัญชีด้วยเบอร์โทร, production config guard, ตัด Google login
describe('Auth hardening (Phase 3)', () => {
  const tag = `p3_${Date.now()}`;
  const PASSWORD = 'password123';
  let admin, adminPhone, webTenant, hash;

  const cookieOf = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('refreshToken=')).split(';')[0];
  const loginAdmin = (email) => request(app).post('/auth/login').send({ email, password: PASSWORD });
  const refresh = (cookie) => request(app).post('/auth/refresh').set('Cookie', cookie);
  const webLogin = (phone, pin) => request(app).post('/auth/web/login').send({ phone, pin });
  const makeTenant = (n, data = {}) => prisma.tenant.create({ data: { firstName: `T${n}`, lastName: tag, phone: `0830000${String(n).padStart(3, '0')}`, ...data } });

  beforeAll(async () => {
    hash = await bcrypt.hash(PASSWORD, 4);
    adminPhone = '0839990001';
    admin = await prisma.user.create({ data: { email: `${tag}_admin@dorm.com`, passwordHash: hash, name: 'Admin', role: 'admin', phone: adminPhone } });
    webTenant = await makeTenant(1, { pinHash: await bcrypt.hash('123456', 4) });
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: [admin.id, webTenant.id] } } });
    await prisma.userLineAccount.deleteMany({ where: { tenant: { lastName: tag } } });
    await prisma.tenant.deleteMany({ where: { lastName: tag } });
    await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  });

  describe('Refresh token', () => {
    test('ต่ออายุได้ครั้งเดียว: ใช้ Token เดิมซ้ำ หรือเรียกซ้อนกันพร้อมกัน ต้องสำเร็จแค่ครั้งเดียว', async () => {
      const cookie = cookieOf(await loginAdmin(admin.email));

      const [a, b] = await Promise.all([refresh(cookie), refresh(cookie)]);
      expect([a.statusCode, b.statusCode].sort()).toEqual([200, 401]);
      expect((await refresh(cookie)).statusCode).toBe(401);
    });

    test('ใช้ Token เก่าซ้ำหลังพ้น grace window: เพิกถอนทั้งตระกูล แต่ตระกูลอื่นของบัญชีเดียวกันไม่กระทบ', async () => {
      const oldCookie = cookieOf(await loginAdmin(admin.email));
      const otherDevice = cookieOf(await loginAdmin(admin.email));
      const rotated = cookieOf(await refresh(oldCookie));

      await prisma.refreshToken.updateMany({ where: { token: oldCookie.split('=')[1] }, data: { usedAt: new Date(Date.now() - 60 * 1000) } });
      expect((await refresh(oldCookie)).statusCode).toBe(401);

      expect((await refresh(rotated)).statusCode).toBe(401);
      expect((await refresh(otherDevice)).statusCode).toBe(200);
    });

    test('ใช้ Token เก่าซ้ำภายใน grace window: ปฏิเสธเฉย ๆ ตระกูลยังใช้ต่อได้', async () => {
      const oldCookie = cookieOf(await loginAdmin(admin.email));
      const rotated = cookieOf(await refresh(oldCookie));

      expect((await refresh(oldCookie)).statusCode).toBe(401);
      expect((await refresh(rotated)).statusCode).toBe(200);
    });

    test('role หลังต่ออายุมาจาก DB ล่าสุด (ถูกลดสิทธิ์แล้วมีผลทันที) และไม่ฝัง role/email ใน Refresh Token', async () => {
      const login = await loginAdmin(admin.email);
      const cookie = cookieOf(login);
      expect(Object.keys(jwt.decode(cookie.split('=')[1])).sort()).toEqual(['exp', 'iat', 'id', 'jti']);

      await prisma.user.update({ where: { id: admin.id }, data: { role: 'tenant' } });
      const res = await refresh(cookie);
      expect(res.statusCode).toBe(200);
      expect(jwt.decode(res.body.accessToken).role).toBe('tenant');
      await prisma.user.update({ where: { id: admin.id }, data: { role: 'admin' } });
    });

    test('บัญชีที่ถูกลบแล้ว ต่ออายุไม่ได้ (เดิม fallback ไปใช้ข้อมูลใน Token)', async () => {
      const temp = await prisma.user.create({ data: { email: `${tag}_temp@dorm.com`, passwordHash: hash, name: 'Temp', role: 'admin' } });
      const cookie = cookieOf(await loginAdmin(temp.email));
      await prisma.user.delete({ where: { id: temp.id } });

      const res = await refresh(cookie);
      expect(res.statusCode).toBe(401);
      expect(await prisma.refreshToken.count({ where: { userId: temp.id } })).toBe(0);
    });

    test('ผู้เช่าเว็บต่ออายุแล้วได้ claims ครบ (tenantId/role) ไม่ใช่แค่ id เหมือนเดิม', async () => {
      const login = await webLogin(webTenant.phone, '123456');
      expect(login.statusCode).toBe(200);

      const res = await refresh(cookieOf(login));
      expect(res.statusCode).toBe(200);
      const claims = jwt.decode(res.body.accessToken);
      expect(claims).toMatchObject({ id: webTenant.id, tenantId: webTenant.id, role: 'tenant' });
    });
  });

  describe('ยึดบัญชีด้วยเบอร์โทร (PIN / verify-phone)', () => {
    const setupPin = (lineUserId, phone, pin = '654321') => request(app).post('/api/v1/liff/auth/setup-pin').send({ lineIdToken: lineUserId, phone, pin });
    const verifyPhone = (lineUserId, phone) => request(app).post('/api/v1/liff/auth/verify-phone').set('X-Line-Id-Token', lineUserId).send({ phone });

    test('บัญชีที่ตั้ง PIN แล้วแต่ยังไม่ผูก LINE (ผู้เช่าเว็บ) คนอื่นยึดด้วยเบอร์โทรไม่ได้', async () => {
      for (const res of [await setupPin(`U_${tag}_x1`, webTenant.phone), await verifyPhone(`U_${tag}_x2`, webTenant.phone)]) {
        expect(res.statusCode).toBe(403);
        expect(res.body.code).toBe('ACCOUNT_ALREADY_CLAIMED');
      }
    });

    test('บัญชีที่ผูก LINE แล้วแต่ยังไม่ตั้ง PIN: LINE อื่นตั้ง PIN ทับไม่ได้ (เดิมทำได้) แต่ LINE เจ้าของทำได้', async () => {
      const owner = await makeTenant(2, { lineUserId: `U_${tag}_owner` });

      const stranger = await setupPin(`U_${tag}_stranger`, owner.phone);
      expect(stranger.statusCode).toBe(403);
      expect(stranger.body.code).toBe('ACCOUNT_ALREADY_LINKED');
      expect((await prisma.tenant.findUnique({ where: { id: owner.id } })).pinHash).toBeNull();

      expect((await setupPin(owner.lineUserId, owner.phone)).statusCode).toBe(200);
    });

    test('บัญชีที่ยังไม่มีใครใช้ ยังสมัครครั้งแรกด้วยเบอร์โทรได้ตามเดิม (ไม่เปลี่ยน UX ผู้เช่าทั่วไป)', async () => {
      const fresh = await makeTenant(3);
      const res = await verifyPhone(`U_${tag}_fresh`, fresh.phone);
      expect(res.statusCode).toBe(200);
      expect((await prisma.tenant.findUnique({ where: { id: fresh.id } })).lineUserId).toBe(`U_${tag}_fresh`);
    });

    test('เบอร์ที่ตรงกับผู้ดูแลระบบ ยึดด้วยเบอร์โทรไม่ได้ ต้องผูกผ่านรหัสเชิญ (กันได้สิทธิ์ owner ใน LIFF)', async () => {
      const adminTenant = await makeTenant(4, { phone: adminPhone });
      for (const res of [await setupPin(`U_${tag}_atk1`, adminPhone), await verifyPhone(`U_${tag}_atk2`, adminPhone)]) {
        expect(res.statusCode).toBe(403);
        expect(res.body.code).toBe('ADMIN_ACCOUNT_REQUIRES_INVITE');
      }
      const after = await prisma.tenant.findUnique({ where: { id: adminTenant.id } });
      expect(after.lineUserId).toBeNull();
      expect(after.pinHash).toBeNull();
    });

    test('verify-phone ด้วย JWT ของผู้เช่าคนอื่นโดยไม่มี LINE ที่ยืนยันแล้ว ต้องถูกปฏิเสธ (เดิมรับ Token ของเหยื่อได้)', async () => {
      const victim = await makeTenant(5);
      const attackerJwt = (await webLogin(webTenant.phone, '123456')).body.accessToken;

      const res = await request(app).post('/api/v1/liff/auth/verify-phone').set('Authorization', `Bearer ${attackerJwt}`).send({ phone: victim.phone });
      expect(res.statusCode).toBe(401);
      expect(res.body.accessToken).toBeUndefined();
    });
  });

  describe('Production config guard', () => {
    const ok = { nodeEnv: 'production', jwt: { accessSecret: 'a'.repeat(40), refreshSecret: 'b'.repeat(40) }, line: { mockMode: false } };
    const fails = (cfg) => () => env.assertProductionConfig({ ...ok, ...cfg });

    test('ไม่ใช่ production ไม่ตรวจ, production ที่ค่าถูกต้องผ่าน', () => {
      expect(() => env.assertProductionConfig({ ...ok, nodeEnv: 'development', line: { mockMode: true } })).not.toThrow();
      expect(() => env.assertProductionConfig(ok)).not.toThrow();
    });

    test('ปฏิเสธ secret ค่าเริ่มต้น/ตัวอย่าง/สั้น/ซ้ำกัน และ mock mode', () => {
      expect(fails({ jwt: { ...ok.jwt, accessSecret: 'default_access_secret_key' } })).toThrow(/JWT_ACCESS_SECRET/);
      expect(fails({ jwt: { ...ok.jwt, refreshSecret: 'your_super_secret_refresh_token_key_change_in_production' } })).toThrow(/JWT_REFRESH_SECRET/);
      expect(fails({ jwt: { ...ok.jwt, accessSecret: 'short' } })).toThrow(/32/);
      expect(fails({ jwt: { accessSecret: 'c'.repeat(40), refreshSecret: 'c'.repeat(40) } })).toThrow(/คนละค่า/);
      expect(fails({ line: { mockMode: true } })).toThrow(/LINE_AUTH_MOCK_MODE/);
    });
  });

  test('Google login ถูกตัดออกแล้ว (ไม่มี route)', async () => {
    expect((await request(app).get('/auth/google')).statusCode).toBe(404);
    expect((await request(app).get('/auth/google/callback')).statusCode).toBe(404);
  });
});
