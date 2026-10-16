const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const prisma = require('../../src/config/prisma');

describe('E-Contract PDF & Rental Agreement Integration Tests', () => {
  let adminToken;
  let adminUser;
  let testLease;
  let testTenant;
  let tenantToken;
  let grantedPermission = null;

  beforeAll(async () => {
    adminUser = await prisma.user.findFirst({
      where: { role: { in: ['admin', 'superadmin'] } }
    });
    testLease = await prisma.leaseContract.findFirst({
      include: { tenant: true, room: true, building: true }
    });

    adminToken = authService.generateAccessToken(adminUser);

    // role admin เข้าถึงได้เฉพาะตึกที่ได้รับสิทธิ์ ถ้ายังไม่มีให้เพิ่มไว้ชั่วคราวแล้วลบตอนจบ
    const leaseBuildingId = testLease?.buildingId || testLease?.room?.buildingId;
    if (adminUser && leaseBuildingId) {
      const where = { userId_buildingId: { userId: adminUser.id, buildingId: leaseBuildingId } };
      if (!(await prisma.userBuildingPermission.findUnique({ where }))) {
        await prisma.userBuildingPermission.create({ data: { userId: adminUser.id, buildingId: leaseBuildingId } });
        grantedPermission = { userId: adminUser.id, buildingId: leaseBuildingId };
      }
    }

    if (testLease?.tenant) {
      testTenant = testLease.tenant;
      tenantToken = authService.generateAccessToken({
        id: testTenant.id,
        tenantId: testTenant.id,
        role: 'tenant',
        name: `${testTenant.firstName} ${testTenant.lastName}`,
        phone: testTenant.phone
      });
    }
  });

  describe('GET /api/admin/leases/:leaseId/contract', () => {
    test('กรณีเป็น Admin ต้องดึงรายละเอียดสัญญาเช่าฉบับสมบูรณ์สำเร็จ (200 OK)', async () => {
      if (!testLease) return;

      const res = await request(app)
        .get(`/api/admin/leases/${testLease.id}/contract`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testLease.id);
      expect(res.body.data.room).toBeDefined();
      expect(res.body.data.tenant).toBeDefined();
      expect(res.body.data.building).toBeDefined();
    });

    test('กรณีระบุ leaseId ที่ไม่มีอยู่จริง ต้องตอบ 404 Not Found', async () => {
      const nonExistentId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/api/admin/leases/${nonExistentId}/contract`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/liff/contract', () => {
    test('กรณีเป็น Tenant ที่มี Active Lease ต้องดึงสัญญาของตนเองสำเร็จ (200 OK)', async () => {
      if (!testTenant || !tenantToken) return;

      const res = await request(app)
        .get('/api/v1/liff/contract')
        .set('Authorization', `Bearer ${tenantToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      if (res.body.data) {
        expect(res.body.data.room).toBeDefined();
        expect(res.body.data.building).toBeDefined();
        expect(res.body.data.tenant.firstName).toBe(testTenant.firstName);
      }
    });
  });

  describe('GET /api/v1/liff/contract - ENABLE_E_CONTRACT Feature Toggle Enforcement', () => {
    let toggleBuilding, toggleRoom, toggleTenant, toggleLease, toggleTenantToken, toggleFeatureRecord;

    beforeAll(async () => {
      toggleBuilding = await prisma.building.create({ data: { name: 'ตึกทดสอบปิด E-Contract' } });
      toggleTenant = await prisma.tenant.create({
        data: { firstName: 'ปิด', lastName: 'สัญญา', phone: '0899990033' }
      });
      toggleRoom = await prisma.room.create({
        data: { roomNumber: 'ECTOGGLE-101', floor: 1, price: 3000, status: 'occupied', buildingId: toggleBuilding.id, tenantId: toggleTenant.id }
      });
      toggleLease = await prisma.leaseContract.create({
        data: {
          roomId: toggleRoom.id,
          tenantId: toggleTenant.id,
          buildingId: toggleBuilding.id,
          startDate: new Date(),
          expectedEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          status: 'ACTIVE'
        }
      });
      toggleTenantToken = authService.generateAccessToken({ id: toggleTenant.id, tenantId: toggleTenant.id, role: 'tenant' });
    });

    afterAll(async () => {
      if (toggleFeatureRecord) await prisma.featureToggle.delete({ where: { id: toggleFeatureRecord.id } }).catch(() => {});
      if (toggleLease) await prisma.leaseContract.delete({ where: { id: toggleLease.id } }).catch(() => {});
      if (toggleRoom) await prisma.room.delete({ where: { id: toggleRoom.id } }).catch(() => {});
      if (toggleTenant) await prisma.tenant.delete({ where: { id: toggleTenant.id } }).catch(() => {});
      if (toggleBuilding) await prisma.building.delete({ where: { id: toggleBuilding.id } }).catch(() => {});
    });

    test('ปิด ENABLE_E_CONTRACT ของตึกนี้แล้ว เรียกตรงๆ ต้องโดนบล็อก (403) แม้ไม่ผ่านปุ่มในหน้าโปรไฟล์', async () => {
      toggleFeatureRecord = await prisma.featureToggle.create({
        data: { key: 'ENABLE_E_CONTRACT', buildingId: toggleBuilding.id, isActive: false }
      });

      const res = await request(app)
        .get('/api/v1/liff/contract')
        .set('Authorization', `Bearer ${toggleTenantToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('เปิดกลับมาแล้ว ต้องดึงสัญญาได้ปกติอีกครั้ง (200 OK)', async () => {
      await prisma.featureToggle.update({ where: { id: toggleFeatureRecord.id }, data: { isActive: true } });

      const res = await request(app)
        .get('/api/v1/liff/contract')
        .set('Authorization', `Bearer ${toggleTenantToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(toggleLease.id);
    });
  });

  afterAll(async () => {
    if (grantedPermission) await prisma.userBuildingPermission.deleteMany({ where: grantedPermission });
  });
});
