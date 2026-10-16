const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Security & RBAC Protection Integration Tests', () => {
  let tenantUser;
  let tenantToken;
  let adminUser;
  let adminToken;
  let managerUser;
  let managerToken;
  let testBuilding;
  let testRoom;
  let testTenant;

  beforeAll(async () => {
    // 1. Create building & room
    testBuilding = await billingService.prisma.building.create({
      data: { name: 'Security Audit Bldg', address: 'Sec 123' }
    });

    testTenant = await billingService.prisma.tenant.create({
      data: {
        firstName: 'SecTenant',
        lastName: 'Test',
        phone: `087${Math.floor(1000000 + Math.random() * 9000000)}`
      }
    });

    testRoom = await billingService.prisma.room.create({
      data: {
        roomNumber: `SEC-${Date.now().toString().slice(-4)}`,
        floor: 1,
        price: 4000,
        status: 'occupied',
        buildingId: testBuilding.id,
        tenantId: testTenant.id
      }
    });

    // 2. Create Tenant User & Token
    tenantUser = {
      id: testTenant.id,
      email: `${testTenant.phone}@tenant.dorm.com`,
      role: 'tenant',
      tenantId: testTenant.id
    };
    tenantToken = authService.generateAccessToken(tenantUser);

    // 3. Create Admin User & Token
    adminUser = await billingService.prisma.user.create({
      data: {
        email: `admin_sec_${Date.now()}@dorm.com`,
        passwordHash: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        name: 'Sec Admin',
        role: 'ADMIN'
      }
    });
    adminToken = authService.generateAccessToken(adminUser);

    // 4. Create Manager User & Token
    managerUser = await billingService.prisma.user.create({
      data: {
        email: `manager_sec_${Date.now()}@dorm.com`,
        passwordHash: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
        name: 'Sec Manager',
        role: 'MANAGER'
      }
    });
    managerToken = authService.generateAccessToken(managerUser);

    // admin/manager เข้าถึงผู้เช่าได้เฉพาะตึกที่ได้รับสิทธิ์ (ลบอัตโนมัติเมื่อลบผู้ใช้/ตึก ตาม onDelete: Cascade)
    await billingService.prisma.userBuildingPermission.createMany({
      data: [
        { userId: adminUser.id, buildingId: testBuilding.id },
        { userId: managerUser.id, buildingId: testBuilding.id }
      ]
    });
  });

  describe('1. Authentication Validation (POST /auth/login)', () => {
    test('ส่งรหัสผ่านผิด ต้องถูกปฏิเสธ 401 Unauthorized', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: adminUser.email,
          password: 'wrongpassword'
        });

      expect(response.statusCode).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('2. Broken Access Control Protection (Tenant blocked from Admin routes)', () => {
    test('Tenant พยายามส่ง Broadcast ประกาศ ต้องถูกปฏิเสธ 403 Forbidden', async () => {
      const response = await request(app)
        .post('/api/v1/announcements')
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({
          title: 'Hacked Announcement',
          content: 'Attacker broadcast',
          targetType: 'ALL'
        });

      expect(response.statusCode).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('Tenant พยายามดูสัญญาเช่าทั้งหมด ต้องถูกปฏิเสธ 403 Forbidden', async () => {
      const response = await request(app)
        .get('/api/admin/leases')
        .set('Authorization', `Bearer ${tenantToken}`);

      expect(response.statusCode).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('Tenant พยายามดูรายชื่อผู้เช่าทั้งหมดจาก Admin API ต้องถูกปฏิเสธ 403 Forbidden', async () => {
      const response = await request(app)
        .get('/api/admin/tenants')
        .set('Authorization', `Bearer ${tenantToken}`);

      expect(response.statusCode).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('Tenant พยายามออกบิลมิเตอร์ทั้งตึก ต้องถูกปฏิเสธ 403 Forbidden', async () => {
      const response = await request(app)
        .post(`/api/v1/buildings/${testBuilding.id}/invoices/generate`)
        .set('Authorization', `Bearer ${tenantToken}`)
        .send({});

      expect(response.statusCode).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('Tenant พยายามลบรายการแจ้งซ่อม ต้องถูกปฏิเสธ 403 Forbidden', async () => {
      const response = await request(app)
        .delete('/api/v1/maintenance-requests/fake-id')
        .set('Authorization', `Bearer ${tenantToken}`);

      expect(response.statusCode).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('3. Role Middleware Inversion Bug Fix Verification', () => {
    test('Manager สามารถเข้าถึง endpoint ที่ระบุ OWNER, MANAGER, admin ได้สำเร็จ (200 OK)', async () => {
      const response = await request(app)
        .patch(`/api/admin/tenants/${testTenant.id}/notes`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ notes: 'Updated by Manager' });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('Admin สามารถเข้าถึง endpoint ที่ระบุ OWNER, MANAGER, admin ได้สำเร็จ (200 OK)', async () => {
      const response = await request(app)
        .patch(`/api/admin/tenants/${testTenant.id}/notes`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ notes: 'Updated by Admin' });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('4. Incomplete IDOR Protection on Unlinked Invoices', () => {
    test('LINE user อื่นไม่สามารถดูบิลของผู้เช่าที่ยังไม่ได้ผูก LINE ได้ (403 Forbidden)', async () => {
      const invoice = await billingService.prisma.invoice.create({
        data: {
          invoiceNumber: `INV-SEC-${Date.now()}`,
          roomId: testRoom.id,
          tenantId: testTenant.id,
          billingCycle: '2026-09',
          roomPrice: 4000,
          waterTotal: 150,
          electricTotal: 800,
          commonFee: 100,
          grandTotal: 5050,
          status: 'pending',
          dueDate: new Date()
        }
      });

      const response = await request(app)
        .get(`/api/v1/liff/invoices/${invoice.id}`)
        .set('X-Line-Id-Token', 'U_attacker_stranger_line_id');

      expect(response.statusCode).toBe(403);
      expect(response.body.success).toBe(false);

      await billingService.prisma.invoice.delete({ where: { id: invoice.id } }).catch(() => {});
    });
  });

  afterAll(async () => {
    if (adminUser) await billingService.prisma.user.delete({ where: { id: adminUser.id } }).catch(() => {});
    if (managerUser) await billingService.prisma.user.delete({ where: { id: managerUser.id } }).catch(() => {});
    if (testRoom) await billingService.prisma.room.delete({ where: { id: testRoom.id } }).catch(() => {});
    if (testTenant) await billingService.prisma.tenant.delete({ where: { id: testTenant.id } }).catch(() => {});
    if (testBuilding) await billingService.prisma.building.delete({ where: { id: testBuilding.id } }).catch(() => {});
  });
});
