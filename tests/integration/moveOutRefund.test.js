const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Move-out & Deposit Refund System Integration Tests', () => {
  let adminToken;
  let testBuilding;
  let testTenant;
  let testRoom;
  let testLease;

  beforeAll(async () => {
    const adminUser = await billingService.prisma.user.findFirst({
      where: { role: { in: ['SUPERADMIN', 'OWNER', 'ADMIN', 'super_admin', 'owner', 'admin'] } }
    });
    adminToken = authService.generateAccessToken(adminUser);

    testBuilding = await billingService.prisma.building.findFirst();

    testTenant = await billingService.prisma.tenant.create({
      data: {
        firstName: 'ผู้เช่า',
        lastName: 'ย้ายออกคืนมัดจำ',
        phone: '0899988776',
        lineUserId: 'U_test_moveout_unlink',
        lineDisplayName: 'ผู้เช่าย้ายออก LINE'
      }
    });

    testRoom = await billingService.prisma.room.create({
      data: {
        roomNumber: 'REFUND_909',
        floor: 9,
        price: 5500,
        status: 'occupied',
        buildingId: testBuilding.id,
        tenantId: testTenant.id
      }
    });

    // Create meter records
    await billingService.prisma.meterRecord.create({
      data: {
        roomId: testRoom.id,
        meterType: 'water',
        previousReading: 100,
        currentReading: 150,
        unitsUsed: 50,
        billingCycle: '07-2026',
        recordedAt: new Date()
      }
    });
    await billingService.prisma.meterRecord.create({
      data: {
        roomId: testRoom.id,
        meterType: 'electric',
        previousReading: 1000,
        currentReading: 1200,
        unitsUsed: 200,
        billingCycle: '07-2026',
        recordedAt: new Date()
      }
    });

    // Create active LeaseContract
    testLease = await billingService.prisma.leaseContract.create({
      data: {
        roomId: testRoom.id,
        tenantId: testTenant.id,
        buildingId: testBuilding.id,
        startDate: new Date('2026-01-01'),
        expectedEndDate: new Date('2026-12-31'),
        depositAmount: 6000,
        status: 'ACTIVE',
        adminNote: 'เงินมัดจำ 6,000 บาท'
      }
    });
  });

  afterAll(async () => {
    if (testLease) {
      await billingService.prisma.moveOutRecord.deleteMany({ where: { leaseId: testLease.id } }).catch(() => {});
      await billingService.prisma.leaseContract.delete({ where: { id: testLease.id } }).catch(() => {});
    }
    if (testRoom) {
      await billingService.prisma.meterRecord.deleteMany({ where: { roomId: testRoom.id } }).catch(() => {});
      await billingService.prisma.room.delete({ where: { id: testRoom.id } }).catch(() => {});
    }
    if (testTenant) {
      await billingService.prisma.tenant.delete({ where: { id: testTenant.id } }).catch(() => {});
    }
  });

  describe('GET /api/admin/leases/:id/move-out-calculation', () => {
    test('ควรส่งคืนข้อมูลประมาณการค่าน้ำไฟและมัดจำสำเร็จ (200 OK)', async () => {
      const response = await request(app)
        .get(`/api/admin/leases/${testLease.id}/move-out-calculation?finalWater=160&finalElectric=1250`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.depositAmount).toBe(6000);
      expect(response.body.data.oldWater).toBe(150);
      expect(response.body.data.newWater).toBe(160);
      expect(response.body.data.waterUsage).toBe(10);
      expect(response.body.data.oldElectric).toBe(1200);
      expect(response.body.data.newElectric).toBe(1250);
      expect(response.body.data.electricUsage).toBe(50);
    });
  });

  describe('POST /api/admin/leases/:id/process-move-out', () => {
    test('ควรประมวลผลย้ายออกใน Prisma Transaction (อัปเดตสัญญาเป็น ENDED, สร้าง MoveOutRecord, และเปลี่ยนห้องเป็น maintenance) (200 OK)', async () => {
      const response = await request(app)
        .post(`/api/admin/leases/${testLease.id}/process-move-out`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          moveOutDate: '2026-08-31',
          finalWaterMeter: 160,
          finalElectricMeter: 1250,
          damageCharges: [
            { item: 'ค่าทำความสะอาดห้องพัก', amount: 500 },
            { item: 'ค่าซ่อมสีผนัง', amount: 1000 }
          ],
          moveOutReason: 'ย้ายกลับต่างจังหวัด',
          adminNote: 'คืนเงินมัดจำสุทธิ'
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.lease.status).toBe('ENDED');
      expect(response.body.data.room.status).toBe('maintenance');
      expect(response.body.data.room.tenantId).toBeNull();
      expect(response.body.data.moveOutRecord).toBeDefined();
      expect(response.body.data.moveOutRecord.finalWaterMeter).toBe(160);
      expect(response.body.data.moveOutRecord.finalElectricMeter).toBe(1250);
      expect(Number(response.body.data.moveOutRecord.depositAmount)).toBe(6000);
    });

    test('ควรปลดผูกบัญชี LINE ของผู้เช่าที่ย้ายออก (lineUserId ต้องถูกล้างเป็น null)', async () => {
      const recheckedTenant = await billingService.prisma.tenant.findUnique({
        where: { id: testTenant.id }
      });

      expect(recheckedTenant.lineUserId).toBeNull();
      expect(recheckedTenant.lineDisplayName).toBeNull();
    });
  });
});
