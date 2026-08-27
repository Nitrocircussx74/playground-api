const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Business Analytics Dashboard Integration Tests', () => {
  let adminToken;
  let testBuilding;

  beforeAll(async () => {
    const adminUser = await billingService.prisma.user.findFirst({
      where: { role: { in: ['SUPERADMIN', 'OWNER', 'ADMIN', 'super_admin', 'owner', 'admin'] } }
    });
    adminToken = authService.generateAccessToken(adminUser);
    testBuilding = await billingService.prisma.building.findFirst();
  });

  describe('GET /api/admin/dashboard/summary', () => {
    test('ควรส่งคืนข้อมูลสถิติภาพรวมธุรกิจ (Occupancy, Revenue, Debt, Expiring Leases) สำเร็จ (200 OK)', async () => {
      const response = await request(app)
        .get(`/api/admin/dashboard/summary?buildingId=${testBuilding.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.occupancy).toBeDefined();
      expect(response.body.data.occupancy.occupancyRate).toBeGreaterThanOrEqual(0);
      expect(response.body.data.financial).toBeDefined();
      expect(response.body.data.debt).toBeDefined();
      expect(Array.isArray(response.body.data.expiringLeases)).toBe(true);
      expect(typeof response.body.data.pendingMaintenanceCount).toBe('number');
    });
  });

  describe('GET /api/admin/dashboard/revenue-trend', () => {
    test('ควรส่งคืนสถิติรายได้ย้อนหลัง 6 เดือนสำหรับทำ Stacked Bar Chart (200 OK)', async () => {
      const response = await request(app)
        .get(`/api/admin/dashboard/revenue-trend?buildingId=${testBuilding.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(6);

      const firstMonth = response.body.data[0];
      expect(firstMonth.cycle).toBeDefined();
      expect(typeof firstMonth.roomPrice).toBe('number');
      expect(typeof firstMonth.waterTotal).toBe('number');
      expect(typeof firstMonth.electricTotal).toBe('number');
      expect(typeof firstMonth.commonFee).toBe('number');
    });
  });
});
