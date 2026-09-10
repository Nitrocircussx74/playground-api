const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Building Settings & RBAC Integration Tests (OWNER vs MANAGER)', () => {
  let ownerToken;
  let managerToken;
  let testBuilding;

  beforeAll(async () => {
    // 1. Fetch test building
    testBuilding = await billingService.prisma.building.findFirst({ where: { name: { contains: 'อาคาร A' } } });

    // 2. Fetch test users
    const ownerUser = await billingService.prisma.user.findUnique({ where: { email: 'owner@dorm.com' } });
    const managerUser = await billingService.prisma.user.findUnique({ where: { email: 'manager@dorm.com' } });

    ownerToken = authService.generateAccessToken(ownerUser);
    managerToken = authService.generateAccessToken(managerUser);
  });

  describe('GET & PUT /api/admin/buildings/:buildingId/settings', () => {
    test('GET /api/admin/buildings/:buildingId/settings - ดึงตั้งค่าตึก (อนุญาตทั้ง OWNER และ MANAGER)', async () => {
      const response = await request(app)
        .get(`/api/admin/buildings/${testBuilding.id}/settings`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testBuilding.id);
      expect(response.body.data.setting).toBeDefined();
    });

    test('PUT /api/admin/buildings/:buildingId/settings - MANAGER พยายามอัปเดต ต้องโดนปฏิเสธด้วย HTTP 403 Forbidden', async () => {
      const response = await request(app)
        .put(`/api/admin/buildings/${testBuilding.id}/settings`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          waterRate: 25.00,
          electricRate: 10.00
        });

      expect(response.statusCode).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('ไม่มีสิทธิ์');
    });

    test('PUT /api/admin/buildings/:buildingId/settings - OWNER อัปเดตตั้งค่า 4 หมวดหมู่ ผ่านฉลุย HTTP 200 OK', async () => {
      const payload = {
        name: 'อาคาร A (Main Building Updated)',
        phone: '02-123-9999',
        bankName: 'ธนาคารกสิกรไทย (KBANK)',
        bankAccountName: 'หอพักอาคาร A จำกัด',
        bankAccountNo: '123-4-56789-0',
        waterRate: 19.50,
        electricRate: 7.50,
        dueDateDay: 7,
        depositMonths: 2,
        termsAndConditions: 'ห้ามส่งเสียงดังหลังเวลา 22:00 น.'
      };

      const response = await request(app)
        .put(`/api/admin/buildings/${testBuilding.id}/settings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(payload);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('อาคาร A (Main Building Updated)');
      expect(parseFloat(response.body.data.setting.waterRate)).toBe(19.50);
      expect(parseFloat(response.body.data.setting.electricRate)).toBe(7.50);
      expect(response.body.data.setting.dueDateDay).toBe(7);
    });

    test('PUT /api/admin/buildings/:buildingId/settings - OWNER อัปเดตการตั้งค่า LINE Official Account ประจำตึกสำเร็จ (200 OK)', async () => {
      const linePayload = {
        lineOaId: '@horhub_branch_a',
        lineChannelAccessToken: 'test_custom_building_line_access_token_xyz_123',
        lineChannelSecret: 'test_custom_secret_456',
        lineLiffId: '2011289517-TESTLIFFID',
        lineAddFriendUrl: 'https://line.me/R/ti/p/@horhub_branch_a'
      };

      const response = await request(app)
        .put(`/api/admin/buildings/${testBuilding.id}/settings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(linePayload);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.setting.lineOaId).toBe('@horhub_branch_a');
      expect(response.body.data.setting.lineChannelAccessToken).toBe('test_custom_building_line_access_token_xyz_123');
      expect(response.body.data.setting.lineChannelSecret).toBe('test_custom_secret_456');
      expect(response.body.data.setting.lineLiffId).toBe('2011289517-TESTLIFFID');
      expect(response.body.data.setting.lineAddFriendUrl).toBe('https://line.me/R/ti/p/@horhub_branch_a');
    });

    test('GET /api/admin/buildings/:buildingId/line-quota - ดึงโควต้าข้อความ LINE สำเร็จ (คำนวณ percentage และ status ถูกต้อง)', async () => {
      const axios = require('axios');
      jest.spyOn(axios, 'get').mockImplementation((url) => {
        if (url.includes('/quota/consumption')) {
          return Promise.resolve({ data: { totalUsage: 350 } });
        }
        if (url.includes('/quota')) {
          return Promise.resolve({ data: { type: 'limited', value: 500 } });
        }
        return Promise.reject(new Error('Not found'));
      });

      const response = await request(app)
        .get(`/api/admin/buildings/${testBuilding.id}/line-quota`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.configured).toBe(true);
      expect(response.body.data.isUnlimited).toBe(false);
      expect(response.body.data.quota).toBe(500);
      expect(response.body.data.totalUsage).toBe(350);
      expect(response.body.data.remaining).toBe(150);
      expect(response.body.data.percentage).toBe(70);
      expect(response.body.data.status).toBe('warning');

      axios.get.mockRestore();
    });

    test('GET /api/admin/buildings/:buildingId/line-quota - จัดการกรณี Token หมดอายุ (401 Unauthorized)', async () => {
      const axios = require('axios');
      jest.spyOn(axios, 'get').mockImplementation(() => {
        const error = new Error('Unauthorized');
        error.response = { status: 401, data: { message: 'Authentication failed' } };
        return Promise.reject(error);
      });

      const response = await request(app)
        .get(`/api/admin/buildings/${testBuilding.id}/line-quota`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.configured).toBe(true);
      expect(response.body.data.status).toBe('invalid_token');
      expect(response.body.data.error).toBe('INVALID_TOKEN');

      axios.get.mockRestore();
    });

    test('GET /api/admin/buildings/:buildingId/notification-logs - ดึงประวัติการส่งแจ้งเตือน LINE พร้อม Filter และ Pagination สำเร็จ', async () => {
      const lineService = require('../../src/services/lineService');
      const testRoom = await billingService.prisma.room.findFirst({ where: { buildingId: testBuilding.id } });
      const testTenant = await billingService.prisma.tenant.findFirst();

      // สร้าง Mock Log 2 รายการ (SUCCESS และ FAILED)
      await lineService.logDelivery({
        buildingId: testBuilding.id,
        roomId: testRoom?.id,
        tenantId: testTenant?.id,
        notificationType: 'INVOICE',
        messagePreview: 'ใบแจ้งหนี้ประจำเดือน 2026-09 ห้อง A101',
        status: 'SUCCESS'
      });

      await lineService.logDelivery({
        buildingId: testBuilding.id,
        roomId: testRoom?.id,
        tenantId: testTenant?.id,
        notificationType: 'PARCEL',
        messagePreview: 'พัสดุมาถึง: TH123456',
        status: 'FAILED',
        errorReason: 'User has blocked this official account'
      });

      // 1. ดึงทั้งหมด
      const resAll = await request(app)
        .get(`/api/admin/buildings/${testBuilding.id}/notification-logs?page=1&limit=10`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(resAll.statusCode).toBe(200);
      expect(resAll.body.success).toBe(true);
      expect(Array.isArray(resAll.body.data)).toBe(true);
      expect(resAll.body.data.length).toBeGreaterThanOrEqual(2);
      expect(resAll.body.pagination).toBeDefined();

      // 2. ฟิลเตอร์เฉพาะ FAILED
      const resFailed = await request(app)
        .get(`/api/admin/buildings/${testBuilding.id}/notification-logs?status=FAILED`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(resFailed.statusCode).toBe(200);
      expect(resFailed.body.data.every((l) => l.status === 'FAILED')).toBe(true);
      expect(resFailed.body.data[0].errorReason).toContain('blocked');
    });
  });
});
