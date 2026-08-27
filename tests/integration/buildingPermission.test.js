const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Fine-Grained Building Access Control Integration Tests', () => {
  let superAdminToken;
  let adminAToken;
  let adminBToken;
  let buildingA;
  let buildingB;

  beforeAll(async () => {
    // 1. Fetch seeded buildings
    buildingA = await billingService.prisma.building.findFirst({ where: { name: { contains: 'อาคาร A' } } });
    buildingB = await billingService.prisma.building.findFirst({ where: { name: { contains: 'อาคาร B' } } });

    // 2. Fetch seeded users
    const superAdminUser = await billingService.prisma.user.findUnique({ where: { email: 'superadmin@dorm.com' } });
    const adminAUser = await billingService.prisma.user.findUnique({ where: { email: 'admin_building_a@dorm.com' } });
    const adminBUser = await billingService.prisma.user.findUnique({ where: { email: 'admin_building_b@dorm.com' } });

    superAdminToken = authService.generateAccessToken(superAdminUser);
    adminAToken = authService.generateAccessToken(adminAUser);
    adminBToken = authService.generateAccessToken(adminBUser);
  });

  describe('Building Filtering by Admin Permissions', () => {
    test('GET /api/v1/buildings - Super Admin เห็นตึกทั้งหมดในระบบ', async () => {
      const response = await request(app)
        .get('/api/v1/buildings')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);
    });

    test('GET /api/v1/buildings - Admin ตึก A เห็นเฉพาะตึก A เท่านั้น', async () => {
      const response = await request(app)
        .get('/api/v1/buildings')
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
      expect(response.body.data.some((b) => b.id === buildingA.id)).toBe(true);
    });

    test('GET /api/v1/buildings - Admin ตึก B เห็นเฉพาะตึก B เท่านั้น', async () => {
      const response = await request(app)
        .get('/api/v1/buildings')
        .set('Authorization', `Bearer ${adminBToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
      expect(response.body.data.some((b) => b.id === buildingB.id)).toBe(true);
    });

    test('GET /api/v1/rooms?buildingId=... - Admin ตึก A พยายามดูตึก B ต้องถูกปฏิเสธด้วย HTTP 403 Forbidden', async () => {
      const response = await request(app)
        .get(`/api/v1/rooms?buildingId=${buildingB.id}`)
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(response.statusCode).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('ไม่มีสิทธิ์');
    });

    test('GET /api/v1/rooms?buildingId=... - Admin ตึก A ดูตึก A ผ่านฉลุย HTTP 200 OK', async () => {
      const response = await request(app)
        .get(`/api/v1/rooms?buildingId=${buildingA.id}`)
        .set('Authorization', `Bearer ${adminAToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.every(r => r.buildingId === buildingA.id)).toBe(true);
    });

    test('POST /api/v1/rooms - อนุญาตให้สร้างเลขห้องเดียวกันได้หากอยู่คนละตึก (Same room number in Building A and Building B)', async () => {
      const roomNum = 'DUP101';

      // Clean up if exists
      await billingService.prisma.room.deleteMany({ where: { roomNumber: roomNum } });

      // Create room in Building A
      const resA = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ roomNumber: roomNum, floor: 1, price: 4000, buildingId: buildingA.id });

      expect(resA.statusCode).toBe(201);
      expect(resA.body.data.buildingId).toBe(buildingA.id);

      // Create room with SAME number DUP101 in Building B
      const resB = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ roomNumber: roomNum, floor: 1, price: 5000, buildingId: buildingB.id });

      expect(resB.statusCode).toBe(201);
      expect(resB.body.data.buildingId).toBe(buildingB.id);

      // Clean up after test
      await billingService.prisma.room.deleteMany({ where: { roomNumber: roomNum } });
    });
  });
});
