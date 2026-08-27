const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Maintenance & Ticketing System Integration Tests', () => {
  let adminToken;
  let testRoom;
  let testTenant;
  let createdTicketId;

  beforeAll(async () => {
    const adminUser = await billingService.prisma.user.findFirst({
      where: { role: { in: ['SUPERADMIN', 'OWNER', 'ADMIN', 'super_admin', 'owner', 'admin'] } }
    });
    adminToken = authService.generateAccessToken(adminUser);

    testRoom = await billingService.prisma.room.findFirst({ where: { status: 'occupied' } });
    testTenant = await billingService.prisma.tenant.findFirst();
  });

  describe('POST /api/v1/maintenance-requests & /api/liff/maintenance', () => {
    test('ควรบันทึกตั๋วแจ้งซ่อมใหม่สำเร็จ (201 Created)', async () => {
      const response = await request(app)
        .post('/api/v1/maintenance-requests')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: testRoom.id,
          tenantId: testTenant ? testTenant.id : undefined,
          title: 'เครื่องปรับอากาศมีเสียงดัง',
          description: 'แอร์เปิดแล้วมีเสียงสั่นและลมไม่ค่อยเย็น',
          technicianName: 'ช่างสมชาย',
          repairCost: 500
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.title).toBe('เครื่องปรับอากาศมีเสียงดัง');

      createdTicketId = response.body.data.id;
    });
  });

  describe('GET /api/v1/maintenance-requests & /api/admin/buildings/:buildingId/maintenance', () => {
    test('ควรดึงรายการแจ้งซ่อมทั้งหมดพร้อม Room, Tenant, Building (200 OK)', async () => {
      const response = await request(app)
        .get('/api/v1/maintenance-requests')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('PATCH /api/v1/maintenance-requests/:id & /api/admin/maintenance/:id', () => {
    test('ควรอัปเดตสถานะเป็น in_progress มอบหมายช่าง และส่ง LINE Notification (200 OK)', async () => {
      const response = await request(app)
        .patch(`/api/v1/maintenance-requests/${createdTicketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'in_progress',
          technicianName: 'ช่างสมพงษ์ (ช่างแอร์ประจำหอ)',
          repairCost: 800,
          adminNote: 'ช่างจะข้าพบห้องพักเวลา 14:00 น.'
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('in_progress');
      expect(response.body.data.technicianName).toBe('ช่างสมพงษ์ (ช่างแอร์ประจำหอ)');
      expect(Number(response.body.data.repairCost)).toBe(800);
    });

    test('ควรอัปเดตสถานะเป็น resolved และบันทึก resolvedAt (200 OK)', async () => {
      const response = await request(app)
        .patch(`/api/v1/maintenance-requests/${createdTicketId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'resolved',
          adminNote: 'ล้างแอร์และเติมน้ำยาแอร์เรียบร้อยแล้ว'
        });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('resolved');
      expect(response.body.data.resolvedAt).not.toBeNull();
    });
  });
});
