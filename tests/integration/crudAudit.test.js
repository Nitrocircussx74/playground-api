const request = require('supertest');
const app = require('../../src/app');
const billingService = require('../../src/services/billingService');
const authService = require('../../src/services/authService');

describe('Full CRUD Audit Integration Tests (ทดสอบสร้าง อ่าน แก้ไข ลบ ทั้งระบบ)', () => {
  let adminToken;
  let testBuilding;
  let testRoom;
  let testTenant;
  let testInvoice;
  let testMaintenance;
  let testAnnouncement;

  beforeAll(async () => {
    // Cleanup any lingering previous test data
    await billingService.prisma.room.deleteMany({ where: { roomNumber: { in: ['AUDIT99', 'AUDIT88', 'TEMP_DEL'] } } });

    // 1. Create admin user & token
    const adminUser = await billingService.prisma.user.upsert({
      where: { email: 'crud_admin@dorm.com' },
      update: { role: 'super_admin' },
      create: {
        email: 'crud_admin@dorm.com',
        passwordHash: 'hashed',
        name: 'CRUD Admin Audit',
        role: 'super_admin'
      }
    });

    adminToken = authService.generateAccessToken(adminUser);

    // 2. Create Building
    testBuilding = await billingService.prisma.building.create({
      data: { name: 'CRUD Audit Building', address: '456 Audit St' }
    });

    // 3. Create Tenant
    testTenant = await billingService.prisma.tenant.create({
      data: { firstName: 'Invoice', lastName: 'Audit', phone: '0811111111', idCard: '1111111111111' }
    });

    // 4. Create Room with tenant
    testRoom = await billingService.prisma.room.create({
      data: {
        roomNumber: 'AUDIT99',
        floor: 9,
        price: 6500.0,
        status: 'occupied',
        buildingId: testBuilding.id,
        tenantId: testTenant.id
      }
    });
  });

  afterAll(async () => {
    // Clean up in reverse dependency order
    await billingService.prisma.announcement.deleteMany({ where: { title: { contains: 'ปิดปรับปรุง' } } });
    await billingService.prisma.maintenanceRequest.deleteMany({ where: { title: { contains: 'เครื่องปรับอากาศ' } } });
    if (testRoom) {
      await billingService.prisma.invoice.deleteMany({ where: { roomId: testRoom.id } });
      await billingService.prisma.meterRecord.deleteMany({ where: { roomId: testRoom.id } });
      await billingService.prisma.room.deleteMany({ where: { id: testRoom.id } });
    }
    if (testTenant) await billingService.prisma.tenant.deleteMany({ where: { id: testTenant.id } });
    if (testBuilding) await billingService.prisma.building.deleteMany({ where: { id: testBuilding.id } });
    await billingService.prisma.user.deleteMany({ where: { email: 'crud_admin@dorm.com' } });
  });

  describe('1. Room Module CRUD Audit', () => {
    it('CREATE: POST /api/v1/rooms - ควรสร้างห้องพักใหม่สำเร็จ (201 Created)', async () => {
      const res = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomNumber: 'AUDIT88',
          floor: 8,
          price: 5500.0,
          buildingId: testBuilding.id
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      // Clean up newly created room
      await billingService.prisma.room.delete({ where: { id: res.body.data.id } });
    });

    it('READ: GET /api/v1/rooms - ดึงข้อมูลรายการห้องพัก (200 OK)', async () => {
      const res = await request(app)
        .get('/api/v1/rooms')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.some((r) => r.id === testRoom.id)).toBe(true);
    });

    it('UPDATE: PUT /api/v1/rooms/:id - อัปเดตราคาและชั้นของห้องพัก (200 OK)', async () => {
      const res = await request(app)
        .put(`/api/v1/rooms/${testRoom.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ price: 7000.0, floor: 10 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Number(res.body.data.price)).toBe(7000);
    });

    it('DELETE: DELETE /api/v1/rooms/:id - ลบห้องพักสำเร็จ (200 OK)', async () => {
      const tempRoom = await billingService.prisma.room.create({
        data: { roomNumber: 'TEMP_DEL', floor: 1, price: 3000 }
      });

      const res = await request(app)
        .delete(`/api/v1/rooms/${tempRoom.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('2. Invoice Module CRUD Audit', () => {
    it('CREATE: POST /api/v1/invoices - สร้างบิลค่าเช่าปรับแต่ง (201 Created)', async () => {
      const res = await request(app)
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: testRoom.id,
          billingCycle: '09-2026',
          customWaterTotal: 250,
          customElectricTotal: 850
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      testInvoice = res.body.data;
    });

    it('READ: GET /api/v1/invoices - ดึงรายการใบแจ้งหนี้ (200 OK)', async () => {
      const res = await request(app)
        .get('/api/v1/invoices')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('UPDATE: PUT /api/v1/invoices/:id - แก้ไขยอดเงินในบิล (200 OK)', async () => {
      expect(testInvoice).toBeDefined();
      const res = await request(app)
        .put(`/api/v1/invoices/${testInvoice.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ otherFee: 300, otherFeeNote: 'ค่าที่จอดรถพิเศษ' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Number(res.body.data.otherFee)).toBe(300);
    });

    it('DELETE: DELETE /api/v1/invoices/:id - ลบใบแจ้งหนี้สำเร็จ (200 OK)', async () => {
      expect(testInvoice).toBeDefined();
      const res = await request(app)
        .delete(`/api/v1/invoices/${testInvoice.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('3. Maintenance Request CRUD Audit', () => {
    it('CREATE: POST /api/v1/maintenance-requests - สร้างรายการแจ้งซ่อม (201 Created)', async () => {
      const res = await request(app)
        .post('/api/v1/maintenance-requests')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: testRoom.id,
          title: 'เครื่องปรับอากาศไม่เย็น',
          description: 'แอร์มีแต่น้ำมูกไหลและลมร้อน'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      testMaintenance = res.body.data;
    });

    it('UPDATE: PATCH /api/v1/maintenance-requests/:id/status - อัปเดตสถานะแจ้งซ่อม (200 OK)', async () => {
      expect(testMaintenance).toBeDefined();
      const res = await request(app)
        .patch(`/api/v1/maintenance-requests/${testMaintenance.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'in_progress', adminNote: 'ช่างกำลังเข้าไปตรวจเช็กเติมน้ำยาแอร์' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('in_progress');
    });

    it('DELETE: DELETE /api/v1/maintenance-requests/:id - ลบรายการแจ้งซ่อม (200 OK)', async () => {
      expect(testMaintenance).toBeDefined();
      const res = await request(app)
        .delete(`/api/v1/maintenance-requests/${testMaintenance.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('4. Announcement CRUD Audit', () => {
    it('CREATE: POST /api/v1/announcements - บรอดแคสต์ประกาศข่าวสาร (201 Created)', async () => {
      const res = await request(app)
        .post('/api/v1/announcements')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'แจ้งปิดปรับปรุงระบบไฟฟ้าประจำปี',
          content: 'จะมีการตัดไฟในวันที่ 30 สิงหาคม 2569 เวลา 09:00 - 12:00 น.',
          targetType: 'all'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      testAnnouncement = res.body.data.announcement || res.body.data;
    });

    it('READ: GET /api/v1/announcements - ดึงรายการข่าวสาร (200 OK)', async () => {
      const res = await request(app)
        .get('/api/v1/announcements')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('DELETE: DELETE /api/v1/announcements/:id - ลบประกาศข่าวสาร (200 OK)', async () => {
      expect(testAnnouncement).toBeDefined();
      const res = await request(app)
        .delete(`/api/v1/announcements/${testAnnouncement.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
