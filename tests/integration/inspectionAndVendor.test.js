const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const prisma = require('../../src/config/prisma');

describe('Room Inspection and Vendor Management Integration Tests', () => {
  let adminToken;
  let adminUser;
  let testBuilding;
  let testLease;
  let createdInspectionId;
  let createdVendorId;
  let grantedPermission = false;

  beforeAll(async () => {
    adminUser = await prisma.user.findFirst({
      where: { role: { in: ['admin', 'superadmin'] } }
    });
    testBuilding = await prisma.building.findFirst();
    testLease = await prisma.leaseContract.findFirst();

    adminToken = authService.generateAccessToken(adminUser);

    // role admin เข้าถึงได้เฉพาะตึกที่ได้รับสิทธิ์ ถ้ายังไม่มีให้เพิ่มไว้ชั่วคราวแล้วลบตอนจบ
    if (adminUser && testBuilding) {
      const where = { userId_buildingId: { userId: adminUser.id, buildingId: testBuilding.id } };
      if (!(await prisma.userBuildingPermission.findUnique({ where }))) {
        await prisma.userBuildingPermission.create({ data: { userId: adminUser.id, buildingId: testBuilding.id } });
        grantedPermission = true;
      }
    }
  });

  describe('Room Inspection API', () => {
    test('POST /api/admin/inspections - บันทึกการตรวจสภาพห้องพัก (Move-in) สำเร็จ', async () => {
      if (!testLease || !testBuilding) return;

      const res = await request(app)
        .post('/api/admin/inspections')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          leaseId: testLease.id,
          buildingId: testBuilding.id,
          type: 'MOVE_IN',
          items: [
            { label: 'ผนังห้อง', condition: 'GOOD', note: 'ทาสีใหม่ ไม่มีรอย' },
            { label: 'เครื่องปรับอากาศ', condition: 'GOOD', note: 'เย็นปกติ ล้างแอร์แล้ว' },
            { label: 'สุขภัณฑ์ห้องน้ำ', condition: 'FAIR', note: 'สายฉีดชำระมีรอยใช้งาน' }
          ],
          photoUrls: [],
          adminNote: 'ตรวจสภาพร่วมกับผู้เช่าก่อนส่งมอบกุญแจ'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.type).toBe('MOVE_IN');
      createdInspectionId = res.body.data.id;
    });

    test('GET /api/admin/leases/:leaseId/inspections - ดึงข้อมูลการตรวจสภาพห้องของสัญญาเช่า', async () => {
      if (!testLease) return;

      const res = await request(app)
        .get(`/api/admin/leases/${testLease.id}/inspections`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('GET /api/admin/buildings/:buildingId/inspections - ดึงข้อมูลการตรวจสภาพห้องของตึก', async () => {
      if (!testBuilding) return;

      const res = await request(app)
        .get(`/api/admin/buildings/${testBuilding.id}/inspections`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('Vendor & Contractor Directory API', () => {
    test('POST /api/admin/buildings/:buildingId/vendors - เพิ่มข้อมูลช่าง/ผู้รับเหมาสำเร็จ', async () => {
      if (!testBuilding) return;

      const res = await request(app)
        .post(`/api/admin/buildings/${testBuilding.id}/vendors`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'ช่างสมหมาย แอร์เซอร์วิส',
          category: 'ช่างแอร์',
          phone: '0812345678',
          lineId: 'sommai_air',
          note: 'บริการล้างแอร์ ซ่อมแอร์ เรียกได้ 24 ชม.'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('ช่างสมหมาย แอร์เซอร์วิส');
      createdVendorId = res.body.data.id;
    });

    test('GET /api/admin/buildings/:buildingId/vendors - ดึงรายชื่อช่างประจำตึก', async () => {
      if (!testBuilding) return;

      const res = await request(app)
        .get(`/api/admin/buildings/${testBuilding.id}/vendors`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    test('PUT /api/admin/vendors/:id - แก้ไขข้อมูลช่างสำเร็จ', async () => {
      if (!createdVendorId) return;

      const res = await request(app)
        .put(`/api/admin/vendors/${createdVendorId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          phone: '0899999999',
          note: 'อัปเดตเบอร์โทรใหม่'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.phone).toBe('0899999999');
    });

    test('DELETE /api/admin/vendors/:id - ลบข้อมูลช่างสำเร็จ', async () => {
      if (!createdVendorId) return;

      const res = await request(app)
        .delete(`/api/admin/vendors/${createdVendorId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  afterAll(async () => {
    if (grantedPermission) {
      await prisma.userBuildingPermission.deleteMany({ where: { userId: adminUser.id, buildingId: testBuilding.id } });
    }
    if (createdInspectionId) {
      await prisma.roomInspection.delete({ where: { id: createdInspectionId } }).catch(() => {});
    }
  });
});
