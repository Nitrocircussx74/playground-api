const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Targeted Broadcast & LINE Multicast Integration Tests', () => {
  let adminToken;
  let testBuilding;
  let testTenant;
  let testRoom;

  beforeAll(async () => {
    const adminUser = await billingService.prisma.user.findFirst({
      where: { role: { in: ['SUPERADMIN', 'OWNER', 'ADMIN', 'super_admin', 'owner', 'admin'] } }
    });
    adminToken = authService.generateAccessToken(adminUser);

    testBuilding = await billingService.prisma.building.findFirst();

    testTenant = await billingService.prisma.tenant.create({
      data: {
        firstName: 'ทดสอบ',
        lastName: 'บรอดแคสต์',
        phone: '0891112233',
        lineUserId: 'U_TEST_BROADCAST_RECIPIENT_001'
      }
    });

    testRoom = await billingService.prisma.room.create({
      data: {
        roomNumber: 'BROADCAST_101',
        floor: 1,
        price: 4500,
        status: 'occupied',
        buildingId: testBuilding.id,
        tenantId: testTenant.id
      }
    });
  });

  afterAll(async () => {
    if (testRoom) {
      await billingService.prisma.room.delete({ where: { id: testRoom.id } }).catch(() => {});
    }
    if (testTenant) {
      await billingService.prisma.tenant.delete({ where: { id: testTenant.id } }).catch(() => {});
    }
  });

  describe('GET /api/admin/broadcasts/recipients-count', () => {
    test('ควรคืนค่าจำนวนผู้รับตาม Target Type (ALL / BUILDING / FLOOR) (200 OK)', async () => {
      const response = await request(app)
        .get('/api/admin/broadcasts/recipients-count?targetType=ALL')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(typeof response.body.recipientCount).toBe('number');
      expect(response.body.recipientCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('POST /api/admin/broadcasts', () => {
    test('ควรสร้างประกาศข่าวสารและรัน LINE Multicast Broadcast สำเร็จ (201 Created)', async () => {
      const response = await request(app)
        .post('/api/admin/broadcasts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'ทดสอบประกาศข่าวสารเฉพาะกลุ่ม',
          content: 'รายละเอียดข่าวสารทดสอบระบบ LINE Multicast',
          imageUrl: 'https://example.com/banner.png',
          targetType: 'BUILDING',
          buildingId: testBuilding?.id || null
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.announcement.title).toBe('ทดสอบประกาศข่าวสารเฉพาะกลุ่ม');
      expect(response.body.data.recipientCount).toBeGreaterThanOrEqual(1);

      // Clean up created announcement
      await billingService.prisma.announcement.delete({
        where: { id: response.body.data.announcement.id }
      }).catch(() => {});
    });
  });

  describe('LIFF Announcement Read Tracking Endpoints', () => {
    let testAnnouncement;

    beforeAll(async () => {
      testAnnouncement = await billingService.prisma.announcement.create({
        data: {
          title: 'ประกาศสำหรับทดสอบ Read Tracking',
          content: 'เนื้อหาทดสอบการอ่านประกาศ',
          targetType: 'ALL'
        }
      });
    });

    afterAll(async () => {
      if (testAnnouncement) {
        await billingService.prisma.announcement.delete({ where: { id: testAnnouncement.id } }).catch(() => {});
      }
    });

    test('GET /api/v1/liff/announcements - ควรส่งคืน isRead = false ก่อนเปิดอ่าน', async () => {
      const response = await request(app)
        .get('/api/v1/liff/announcements')
        .set('X-Line-Id-Token', testTenant.lineUserId);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      const found = response.body.data.find((a) => a.id === testAnnouncement.id);
      expect(found).toBeDefined();
      expect(found.isRead).toBe(false);
    });

    test('POST /api/v1/liff/announcements/:id/read - บันทึกสถานะการเปิดอ่านสำเร็จ (200 OK)', async () => {
      const response = await request(app)
        .post(`/api/v1/liff/announcements/${testAnnouncement.id}/read`)
        .set('X-Line-Id-Token', testTenant.lineUserId);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isRead).toBe(true);
      expect(response.body.data.readAt).toBeDefined();
    });

    test('GET /api/v1/liff/announcements - ควรส่งคืน isRead = true หลังเปิดอ่านแล้ว', async () => {
      const response = await request(app)
        .get('/api/v1/liff/announcements')
        .set('X-Line-Id-Token', testTenant.lineUserId);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      const found = response.body.data.find((a) => a.id === testAnnouncement.id);
      expect(found).toBeDefined();
      expect(found.isRead).toBe(true);
      expect(found.readAt).toBeDefined();
    });

    test('POST /api/v1/liff/announcements/read-all - ทำเครื่องหมายว่าอ่านทั้งหมดสำเร็จ (200 OK)', async () => {
      const response = await request(app)
        .post('/api/v1/liff/announcements/read-all')
        .set('X-Line-Id-Token', testTenant.lineUserId);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
