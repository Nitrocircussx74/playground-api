const request = require('supertest');
const app = require('../../src/app');
const billingService = require('../../src/services/billingService');
const authService = require('../../src/services/authService');

describe('Meter Reading & Invoice Generation Flow Integration Tests', () => {
  let adminToken;
  let testBuilding;
  let testRoom;
  let testTenant;

  beforeAll(async () => {
    // 1. Create admin user & token
    const adminUser = await billingService.prisma.user.upsert({
      where: { email: 'meter_admin@dorm.com' },
      update: { role: 'admin' },
      create: {
        email: 'meter_admin@dorm.com',
        passwordHash: 'hashed',
        name: 'Meter Admin Test',
        role: 'admin'
      }
    });

    adminToken = authService.generateAccessToken(adminUser);

    // 2. Create Building & BuildingSetting
    testBuilding = await billingService.prisma.building.create({
      data: {
        name: 'Building Meter Test',
        address: '123 Meter Test St'
      }
    });

    await billingService.prisma.buildingSetting.create({
      data: {
        buildingId: testBuilding.id,
        waterRate: 18.0,
        electricRate: 7.0,
        dueDateDay: 5
      }
    });

    // 3. Create Tenant
    testTenant = await billingService.prisma.tenant.create({
      data: {
        firstName: 'Meter',
        lastName: 'Tester',
        phone: '0899999999',
        idCard: '1100099999999'
      }
    });

    // 4. Create Occupied Room
    testRoom = await billingService.prisma.room.create({
      data: {
        buildingId: testBuilding.id,
        roomNumber: 'M101',
        floor: 1,
        price: 5000.0,
        status: 'occupied',
        tenantId: testTenant.id
      }
    });

    // 5. Seed previous meter readings
    await billingService.prisma.meterRecord.createMany({
      data: [
        {
          roomId: testRoom.id,
          meterType: 'water',
          previousReading: 100,
          currentReading: 120,
          unitsUsed: 20,
          billingCycle: '07-2026',
          recordedAt: new Date('2026-07-25')
        },
        {
          roomId: testRoom.id,
          meterType: 'electric',
          previousReading: 400,
          currentReading: 450,
          unitsUsed: 50,
          billingCycle: '07-2026',
          recordedAt: new Date('2026-07-25')
        }
      ]
    });
  });

  afterAll(async () => {
    // Cleanup created data
    if (testRoom) {
      await billingService.prisma.invoice.deleteMany({ where: { roomId: testRoom.id } });
      await billingService.prisma.meterRecord.deleteMany({ where: { roomId: testRoom.id } });
      await billingService.prisma.room.delete({ where: { id: testRoom.id } });
    }
    if (testTenant) await billingService.prisma.tenant.delete({ where: { id: testTenant.id } });
    if (testBuilding) {
      await billingService.prisma.buildingSetting.deleteMany({ where: { buildingId: testBuilding.id } });
      await billingService.prisma.building.delete({ where: { id: testBuilding.id } });
    }
    await billingService.prisma.user.deleteMany({ where: { email: 'meter_admin@dorm.com' } });
  });

  describe('GET /api/v1/buildings/:buildingId/meters/draft', () => {
    it('ควรดึงรายการห้องพัก occupied พร้อมเลขมิเตอร์เดิมและเรทค่าน้ำไฟ (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/v1/buildings/${testBuilding.id}/meters/draft?billingCycle=08-2026`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rates.waterRate).toBe(18);
      expect(res.body.data.rates.electricRate).toBe(7);

      const targetRoom = res.body.data.rooms.find((r) => r.roomId === testRoom.id);
      expect(targetRoom).toBeDefined();
      expect(targetRoom.previousWaterReading).toBe(120);
      expect(targetRoom.previousElectricReading).toBe(450);
    });
  });

  describe('POST /api/v1/buildings/:buildingId/invoices/generate (Prisma Transaction)', () => {
    it('ควรบันทึก MeterRecord ใหม่ และออกบิลสถานะ draft พร้อมคำนวณ Grand Total ถูกต้อง (201 Created)', async () => {
      const payload = {
        billingCycle: '08-2026',
        roomReadings: [
          {
            roomId: testRoom.id,
            currentWaterReading: 130, // ใช้งานน้ำไป 10 หน่วย (10 * 18 = 180)
            currentElectricReading: 550, // ใช้งานไฟไป 100 หน่วย (100 * 7 = 700)
            otherFee: 200,
            otherFeeNote: 'ค่าที่จอดรถ'
          }
        ]
      };

      const res = await request(app)
        .post(`/api/v1/buildings/${testBuilding.id}/invoices/generate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);

      const inv = res.body.data[0];
      expect(inv.status).toBe('draft');
      expect(Number(inv.waterTotal)).toBe(180);
      expect(Number(inv.electricTotal)).toBe(700);
      expect(Number(inv.roomPrice)).toBe(5000);
      expect(Number(inv.commonFee)).toBe(100);
      expect(Number(inv.otherFee)).toBe(200);
      // Grand Total = 5000 + 180 + 700 + 100 + 200 = 6180
      expect(Number(inv.grandTotal)).toBe(6180);
    });
  });

  describe('POST /api/v1/buildings/:buildingId/invoices/publish', () => {
    it('ควรอัปเดตสถานะบิลจาก draft เป็น pending และส่งแจ้งเตือน (200 OK)', async () => {
      const res = await request(app)
        .post(`/api/v1/buildings/${testBuilding.id}/invoices/publish`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ billingCycle: '08-2026' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.publishedCount).toBeGreaterThanOrEqual(1);

      // Verify DB status changed to pending
      const invInDb = await billingService.prisma.invoice.findFirst({
        where: { roomId: testRoom.id, billingCycle: '08-2026' }
      });
      expect(invInDb.status).toBe('pending');
    });
  });
});
