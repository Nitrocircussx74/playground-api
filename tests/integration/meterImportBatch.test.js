const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');
const xlsx = require('xlsx');

describe('Bulk Meter Import Integration Tests', () => {
  let adminToken;
  let testBuilding;
  let testRoom;
  let testTenant;

  beforeAll(async () => {
    const adminUser = await billingService.prisma.user.findFirst({
      where: { role: { in: ['SUPERADMIN', 'OWNER', 'ADMIN', 'super_admin', 'owner', 'admin'] } }
    });
    adminToken = authService.generateAccessToken(adminUser);

    testBuilding = await billingService.prisma.building.findFirst();

    testTenant = await billingService.prisma.tenant.create({
      data: {
        firstName: 'ทดสอบ',
        lastName: 'นำเข้ามิเตอร์',
        phone: '0811122334'
      }
    });

    testRoom = await billingService.prisma.room.create({
      data: {
        roomNumber: 'IMPORT_808',
        floor: 8,
        price: 4800,
        status: 'occupied',
        buildingId: testBuilding.id,
        tenantId: testTenant.id
      }
    });

    await billingService.prisma.meterRecord.create({
      data: {
        roomId: testRoom.id,
        meterType: 'water',
        previousReading: 50,
        currentReading: 100,
        unitsUsed: 50,
        billingCycle: '07-2026',
        recordedAt: new Date()
      }
    });
    await billingService.prisma.meterRecord.create({
      data: {
        roomId: testRoom.id,
        meterType: 'electric',
        previousReading: 900,
        currentReading: 1000,
        unitsUsed: 100,
        billingCycle: '07-2026',
        recordedAt: new Date()
      }
    });
  });

  afterAll(async () => {
    if (testRoom) {
      await billingService.prisma.meterRecord.deleteMany({ where: { roomId: testRoom.id } }).catch(() => {});
      await billingService.prisma.room.delete({ where: { id: testRoom.id } }).catch(() => {});
    }
    if (testTenant) {
      await billingService.prisma.tenant.delete({ where: { id: testTenant.id } }).catch(() => {});
    }
  });

  describe('GET /api/admin/buildings/:buildingId/meters/template', () => {
    test('ควรส่งคืนไฟล์ Excel Template (.xlsx) สำเร็จ (200 OK)', async () => {
      const response = await request(app)
        .get(`/api/admin/buildings/${testBuilding.id}/meters/template`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.body).toBeDefined();
    });
  });

  describe('POST /api/admin/buildings/:buildingId/meters/import-preview', () => {
    test('ควรประมวลผลไฟล์ Excel และส่งคืน Preview Validation JSON สำเร็จ (200 OK)', async () => {
      // Create in-memory dummy Excel buffer
      const dummyData = [
        {
          'เลขห้องพัก (Room Number)': 'IMPORT_808',
          'มิเตอร์น้ำเดิม (Previous Water)': 100,
          'มิเตอร์น้ำใหม่ (New Water)': 120,
          'มิเตอร์ไฟเดิม (Previous Electric)': 1000,
          'มิเตอร์ไฟใหม่ (New Electric)': 1150
        }
      ];

      const worksheet = xlsx.utils.json_to_sheet(dummyData);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const fileBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      const response = await request(app)
        .post(`/api/admin/buildings/${testBuilding.id}/meters/import-preview`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', fileBuffer, 'test_meters.xlsx');

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);

      const targetRow = response.body.data.find(r => r.roomNumber === 'IMPORT_808');
      expect(targetRow).toBeDefined();
      expect(targetRow.isValid).toBe(true);
      expect(targetRow.waterUsage).toBe(20);
      expect(targetRow.electricUsage).toBe(150);
    });

    test('กรณีระบุเลขมิเตอร์ใหม่น้อยกว่าเลขเดิม ต้องส่งคืน isValid: false และแจ้ง Error', async () => {
      const invalidData = [
        {
          'เลขห้องพัก (Room Number)': 'IMPORT_808',
          'มิเตอร์น้ำเดิม (Previous Water)': 100,
          'มิเตอร์น้ำใหม่ (New Water)': 80, // Invalid: new < old
          'มิเตอร์ไฟเดิม (Previous Electric)': 1000,
          'มิเตอร์ไฟใหม่ (New Electric)': 1100
        }
      ];

      const worksheet = xlsx.utils.json_to_sheet(invalidData);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
      const fileBuffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      const response = await request(app)
        .post(`/api/admin/buildings/${testBuilding.id}/meters/import-preview`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', fileBuffer, 'invalid_meters.xlsx');

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);

      const targetRow = response.body.data.find(r => r.roomNumber === 'IMPORT_808');
      expect(targetRow).toBeDefined();
      expect(targetRow.isValid).toBe(false);
      expect(targetRow.errorMessage).toContain('น้อยกว่าเลขเดิม');
    });
  });
});
