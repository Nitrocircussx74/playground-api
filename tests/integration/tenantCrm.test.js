const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Tenant CRM & 360 History Profile Integration Tests', () => {
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
        firstName: 'ทดสอบCRM',
        lastName: 'ลูกบ้านจำลอง',
        phone: '0899998888',
        idCard: '1234567890123',
        internalNotes: 'บันทึกเดิมก่อนทดสอบ',
        isBlacklisted: false
      }
    });

    testRoom = await billingService.prisma.room.create({
      data: {
        roomNumber: 'CRM_909',
        floor: 9,
        price: 6000,
        status: 'occupied',
        buildingId: testBuilding.id,
        tenantId: testTenant.id
      }
    });

    testLease = await billingService.prisma.leaseContract.create({
      data: {
        roomId: testRoom.id,
        tenantId: testTenant.id,
        buildingId: testBuilding.id,
        startDate: new Date('2026-01-01'),
        expectedEndDate: new Date('2026-12-31'),
        depositAmount: 12000,
        status: 'ACTIVE'
      }
    });
  });

  afterAll(async () => {
    if (testLease) {
      await billingService.prisma.leaseContract.delete({ where: { id: testLease.id } }).catch(() => {});
    }
    if (testRoom) {
      await billingService.prisma.room.delete({ where: { id: testRoom.id } }).catch(() => {});
    }
    if (testTenant) {
      await billingService.prisma.tenant.delete({ where: { id: testTenant.id } }).catch(() => {});
    }
  });

  describe('GET /api/admin/tenants', () => {
    test('กรณีไม่แนบ Token ต้องถูกปฏิเสธด้วย HTTP 401 Unauthorized', async () => {
      const res = await request(app).get('/api/admin/tenants');
      expect(res.status).toBe(401);
    });

    test('ควรดึงรายการผู้เช่าทั้งหมดสำเร็จ (200 OK)', async () => {
      const res = await request(app)
        .get('/api/admin/tenants')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const found = res.body.data.find(t => t.id === testTenant.id);
      expect(found).toBeDefined();
      expect(found.firstName).toBe('ทดสอบCRM');
    });

    test('ควรรองรับการค้นหาตาม search query', async () => {
      const res = await request(app)
        .get('/api/admin/tenants?search=ทดสอบCRM')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.some(t => t.id === testTenant.id)).toBe(true);
    });

    test('ควรรองรับการกรองตาม buildingId', async () => {
      const res = await request(app)
        .get(`/api/admin/tenants?buildingId=${testBuilding.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.some(t => t.id === testTenant.id)).toBe(true);
    });
  });

  describe('GET /api/admin/tenants/:tenantId', () => {
    test('กรณีไม่พบ tenantId ต้องตอบกลับ 404 Not Found', async () => {
      const res = await request(app)
        .get('/api/admin/tenants/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    test('ควรดึงข้อมูลผู้เช่าแบบ 360-Degree พร้อม Relations ครบถ้วน (200 OK)', async () => {
      const res = await request(app)
        .get(`/api/admin/tenants/${testTenant.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testTenant.id);
      expect(res.body.data.rooms).toBeDefined();
      expect(res.body.data.leaseContracts).toBeDefined();
      expect(res.body.data.invoices).toBeDefined();
      expect(res.body.data.maintenanceRequests).toBeDefined();
      expect(res.body.data.internalNotes).toBe('บันทึกเดิมก่อนทดสอบ');
    });
  });

  describe('PATCH /api/admin/tenants/:tenantId/notes', () => {
    test('แอดมินควรอัปเดต internalNotes และ isBlacklisted สำเร็จ พร้อมบันทึก Audit Log (200 OK)', async () => {
      const res = await request(app)
        .patch(`/api/admin/tenants/${testTenant.id}/notes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          internalNotes: 'ผู้เช่าชำระตรงเวลา เรียบร้อยดี',
          isBlacklisted: true
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.internalNotes).toBe('ผู้เช่าชำระตรงเวลา เรียบร้อยดี');
      expect(res.body.data.isBlacklisted).toBe(true);

      // Verify Audit Log
      const audit = await billingService.prisma.auditLog.findFirst({
        where: {
          entity: 'TENANT',
          entityId: testTenant.id,
          action: 'UPDATE'
        },
        orderBy: { createdAt: 'desc' }
      });
      expect(audit).toBeDefined();
    });
  });
});
