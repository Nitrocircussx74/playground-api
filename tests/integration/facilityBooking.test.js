const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Facility Booking Integration Tests', () => {
  let adminToken;
  let testBuilding;
  let testTenant;
  let testRoom;
  let otherTenant;
  let otherRoom;
  let createdFacilityId;
  let createdBookingId;

  beforeAll(async () => {
    const adminUser = await billingService.prisma.user.findFirst({
      where: { role: { in: ['SUPERADMIN', 'OWNER', 'ADMIN', 'super_admin', 'owner', 'admin'] } }
    });
    adminToken = authService.generateAccessToken(adminUser);

    testBuilding = await billingService.prisma.building.findFirst();

    testTenant = await billingService.prisma.tenant.create({
      data: { firstName: 'ทดสอบ', lastName: 'จอง', phone: '0899988101', lineUserId: 'U_TEST_FACILITY_TENANT_999' }
    });
    testRoom = await billingService.prisma.room.create({
      data: { roomNumber: 'FAC_909', floor: 9, price: 5000, status: 'occupied', buildingId: testBuilding.id, tenantId: testTenant.id }
    });

    otherTenant = await billingService.prisma.tenant.create({
      data: { firstName: 'คนอื่น', lastName: 'จอง', phone: '0899988102', lineUserId: 'U_TEST_FACILITY_TENANT_OTHER' }
    });
    otherRoom = await billingService.prisma.room.create({
      data: { roomNumber: 'FAC_910', floor: 9, price: 5000, status: 'occupied', buildingId: testBuilding.id, tenantId: otherTenant.id }
    });
  });

  afterAll(async () => {
    await billingService.prisma.facilityBooking.deleteMany({ where: { facilityId: createdFacilityId } }).catch(() => {});
    if (createdFacilityId) {
      await billingService.prisma.facility.delete({ where: { id: createdFacilityId } }).catch(() => {});
    }
    for (const room of [testRoom, otherRoom]) {
      if (room) await billingService.prisma.room.delete({ where: { id: room.id } }).catch(() => {});
    }
    for (const tenant of [testTenant, otherTenant]) {
      if (tenant) await billingService.prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
    }
  });

  describe('POST /api/admin/buildings/:buildingId/facilities', () => {
    test('แอดมินควรสร้างพื้นที่ส่วนกลางสำเร็จ (201 Created)', async () => {
      const response = await request(app)
        .post(`/api/admin/buildings/${testBuilding.id}/facilities`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'ห้องฟิตเนสทดสอบ', description: 'ทดสอบระบบจอง' });

      expect(response.statusCode).toBe(201);
      createdFacilityId = response.body.data.id;
    });
  });

  describe('GET /api/v1/liff/facilities', () => {
    test('ลูกบ้านควรเห็นพื้นที่ส่วนกลางของตึกตัวเอง (200 OK)', async () => {
      const response = await request(app)
        .get('/api/v1/liff/facilities')
        .set('X-Line-Id-Token', 'U_TEST_FACILITY_TENANT_999');

      expect(response.statusCode).toBe(200);
      expect(response.body.data.some((f) => f.id === createdFacilityId)).toBe(true);
    });
  });

  describe('POST /api/v1/liff/facility-bookings', () => {
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000); // พรุ่งนี้
    const end = new Date(start.getTime() + 60 * 60 * 1000); // +1 ชั่วโมง

    test('ลูกบ้านควรจองสำเร็จ (201 Created)', async () => {
      const response = await request(app)
        .post('/api/v1/liff/facility-bookings')
        .set('X-Line-Id-Token', 'U_TEST_FACILITY_TENANT_999')
        .send({ facilityId: createdFacilityId, startTime: start.toISOString(), endTime: end.toISOString() });

      expect(response.statusCode).toBe(201);
      expect(response.body.data.tenantId).toBe(testTenant.id);
      createdBookingId = response.body.data.id;
    });

    test('จองช่วงเวลาที่ซ้อนทับกับที่จองไว้แล้ว ต้องตอบกลับ HTTP 409 Conflict', async () => {
      const overlapStart = new Date(start.getTime() + 30 * 60 * 1000); // ซ้อนตรงกลาง
      const overlapEnd = new Date(overlapStart.getTime() + 60 * 60 * 1000);

      const response = await request(app)
        .post('/api/v1/liff/facility-bookings')
        .set('X-Line-Id-Token', 'U_TEST_FACILITY_TENANT_OTHER')
        .send({ facilityId: createdFacilityId, startTime: overlapStart.toISOString(), endTime: overlapEnd.toISOString() });

      expect(response.statusCode).toBe(409);
    });

    test('จองช่วงเวลาถัดไปที่ไม่ซ้อนทับ ควรสำเร็จ (201 Created)', async () => {
      const adjacentStart = end; // เริ่มพอดีตอนที่รายการแรกจบ ไม่ซ้อนทับ
      const adjacentEnd = new Date(adjacentStart.getTime() + 60 * 60 * 1000);

      const response = await request(app)
        .post('/api/v1/liff/facility-bookings')
        .set('X-Line-Id-Token', 'U_TEST_FACILITY_TENANT_OTHER')
        .send({ facilityId: createdFacilityId, startTime: adjacentStart.toISOString(), endTime: adjacentEnd.toISOString() });

      expect(response.statusCode).toBe(201);
      await billingService.prisma.facilityBooking.delete({ where: { id: response.body.data.id } }).catch(() => {});
    });
  });

  describe('DELETE /api/v1/liff/facility-bookings/:id', () => {
    test('ยกเลิกการจองของคนอื่นต้องไม่ได้ (404, IDOR)', async () => {
      const response = await request(app)
        .delete(`/api/v1/liff/facility-bookings/${createdBookingId}`)
        .set('X-Line-Id-Token', 'U_TEST_FACILITY_TENANT_OTHER');

      expect(response.statusCode).toBe(404);
    });

    test('เจ้าของยกเลิกการจองของตัวเองได้สำเร็จ (200 OK)', async () => {
      const response = await request(app)
        .delete(`/api/v1/liff/facility-bookings/${createdBookingId}`)
        .set('X-Line-Id-Token', 'U_TEST_FACILITY_TENANT_999');

      expect(response.statusCode).toBe(200);
      expect(response.body.data.status).toBe('CANCELLED');
    });
  });

  describe('FeatureToggle ENABLE_FACILITY_BOOKING ปิดใช้งาน', () => {
    test('เมื่อปิดฟีเจอร์สำหรับตึกนี้ ลูกบ้านจองไม่ได้ (403)', async () => {
      // upsert (ไม่ใช้ create ตรง ๆ) กันชนกับ Unique Constraint ถ้ารันซ้ำหลัง Test ก่อนหน้าล้มเหลวและ cleanup ไม่ทัน
      // try/finally กันไม่ให้ Toggle ค้างเป็น isActive:false ในฐานข้อมูลถ้า assertion ด้านล่างล้มเหลวกลางคัน
      const toggle = await billingService.prisma.featureToggle.upsert({
        where: { key_buildingId: { key: 'ENABLE_FACILITY_BOOKING', buildingId: testBuilding.id } },
        update: { isActive: false },
        create: { key: 'ENABLE_FACILITY_BOOKING', buildingId: testBuilding.id, isActive: false }
      });

      try {
        const start = new Date(Date.now() + 48 * 60 * 60 * 1000);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        const response = await request(app)
          .post('/api/v1/liff/facility-bookings')
          .set('X-Line-Id-Token', 'U_TEST_FACILITY_TENANT_999')
          .send({ facilityId: createdFacilityId, startTime: start.toISOString(), endTime: end.toISOString() });

        expect(response.statusCode).toBe(403);
      } finally {
        await billingService.prisma.featureToggle.delete({ where: { id: toggle.id } }).catch(() => {});
      }
    });
  });
});
