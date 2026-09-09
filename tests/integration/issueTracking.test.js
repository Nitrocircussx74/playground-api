const request = require('supertest');
const path = require('path');
const fs = require('fs');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Issue & Maintenance Tracking Integration Tests (/api/liff/issues)', () => {
  let testTenant;
  let testBuilding;
  let testRoom;
  let dummyImagePath;

  beforeAll(async () => {
    // 1. Prepare dummy valid PNG image file for upload testing (PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A)
    const uploadsDir = path.join(__dirname, '../../public/uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    dummyImagePath = path.join(__dirname, 'test_issue_sample.png');
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52
    ]);
    fs.writeFileSync(dummyImagePath, pngBuffer);

    // 2. Create Building, Room, Tenant
    testBuilding = await billingService.prisma.building.create({
      data: {
        name: 'ตึกทดสอบแจ้งซ่อม',
        address: '123/45 ซอยทดสอบ'
      }
    });

    testTenant = await billingService.prisma.tenant.create({
      data: {
        firstName: 'สมบูรณ์',
        lastName: 'แจ้งซ่อม',
        phone: '0812345679',
        lineUserId: 'U_TEST_ISSUE_TRACKING_TENANT_001'
      }
    });

    testRoom = await billingService.prisma.room.create({
      data: {
        roomNumber: 'ISSUE_101',
        floor: 1,
        price: 5000,
        status: 'occupied',
        buildingId: testBuilding.id,
        tenantId: testTenant.id
      }
    });
  });

  afterAll(async () => {
    if (fs.existsSync(dummyImagePath)) {
      fs.unlinkSync(dummyImagePath);
    }
    if (testTenant) {
      await billingService.prisma.issueTicket.deleteMany({ where: { userId: testTenant.id } }).catch(() => {});
      if (testRoom) {
        await billingService.prisma.room.delete({ where: { id: testRoom.id } }).catch(() => {});
      }
      await billingService.prisma.tenant.delete({ where: { id: testTenant.id } }).catch(() => {});
    }
    if (testBuilding) {
      await billingService.prisma.building.delete({ where: { id: testBuilding.id } }).catch(() => {});
    }
  });

  describe('POST /api/liff/issues (Create Issue Ticket)', () => {
    test('กรณีไม่กรอกรายละเอียด (description) ต้องตอบกลับ 400 Bad Request', async () => {
      const response = await request(app)
        .post('/api/liff/issues')
        .set('X-Line-Id-Token', testTenant.lineUserId)
        .send({
          category: 'REPAIR',
          description: ''
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('ควรบันทึกการแจ้งซ่อมใหม่พร้อมแนบไฟล์รูปภาพสำเร็จ (201 Created)', async () => {
      const response = await request(app)
        .post('/api/liff/issues')
        .set('X-Line-Id-Token', testTenant.lineUserId)
        .field('category', 'REPAIR')
        .field('description', 'ก๊อกน้ำในห้องน้ำรั่วซึม มีน้ำหยดตลอดเวลา')
        .attach('files', dummyImagePath);

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.category).toBe('REPAIR');
      expect(response.body.data.status).toBe('PENDING');
      expect(response.body.data.description).toContain('ก๊อกน้ำในห้องน้ำรั่วซึม');
      expect(Array.isArray(response.body.data.imageUrls)).toBe(true);
      expect(response.body.data.imageUrls.length).toBeGreaterThanOrEqual(1);
    });

    test('ควรบันทึกการร้องเรียน (COMPLAINT) สำเร็จ (201 Created)', async () => {
      const response = await request(app)
        .post('/api/v1/liff/issues')
        .set('X-Line-Id-Token', testTenant.lineUserId)
        .send({
          category: 'COMPLAINT',
          description: 'ห้องข้างเคียงเปิดเพลงเสียงดังยามวิกาล'
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.category).toBe('COMPLAINT');
      expect(response.body.data.status).toBe('PENDING');
    });
  });

  describe('GET /api/liff/issues (Get Issue History)', () => {
    test('ควรดึงรายการประวัติการแจ้งเหตุของผู้เช่า เรียงจากล่าสุดไปเก่าสุด (200 OK)', async () => {
      const response = await request(app)
        .get('/api/liff/issues')
        .set('X-Line-Id-Token', testTenant.lineUserId);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(2);

      // Verify ordering (Latest first)
      const firstDate = new Date(response.body.data[0].createdAt).getTime();
      const secondDate = new Date(response.body.data[1].createdAt).getTime();
      expect(firstDate).toBeGreaterThanOrEqual(secondDate);
    });
  });
});
