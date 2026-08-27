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
    const ownerUser = await billingService.prisma.user.findUnique({ where: { email: 'superadmin@dorm.com' } });
    const managerUser = await billingService.prisma.user.findUnique({ where: { email: 'admin_building_a@dorm.com' } });

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
  });
});
