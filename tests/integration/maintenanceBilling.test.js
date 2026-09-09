const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Maintenance Repair Cost Payer & Auto-Billing Integration Tests', () => {
  let adminToken;
  let testTenant;
  let testRoom;
  const createdInvoiceIds = [];
  const createdMaintenanceIds = [];

  beforeAll(async () => {
    const superAdmin = await billingService.prisma.user.findFirst({
      where: { role: { in: ['SUPERADMIN', 'OWNER', 'ADMIN', 'super_admin', 'owner', 'admin'] } }
    });
    adminToken = authService.generateAccessToken(superAdmin);

    testTenant = await billingService.prisma.tenant.create({
      data: {
        firstName: 'มานพ',
        lastName: 'แจ้งซ่อม',
        phone: '0861234567'
      }
    });

    testRoom = await billingService.prisma.room.create({
      data: {
        roomNumber: 'REPAIR101',
        floor: 1,
        price: 4000,
        status: 'occupied',
        tenantId: testTenant.id
      }
    });
  });

  afterAll(async () => {
    for (const id of createdInvoiceIds) {
      await billingService.prisma.invoice.delete({ where: { id } }).catch(() => {});
    }
    for (const id of createdMaintenanceIds) {
      await billingService.prisma.maintenanceRequest.delete({ where: { id } }).catch(() => {});
    }
    if (testRoom) {
      await billingService.prisma.room.delete({ where: { id: testRoom.id } }).catch(() => {});
    }
    if (testTenant) {
      await billingService.prisma.tenant.delete({ where: { id: testTenant.id } }).catch(() => {});
    }
  });

  describe('POST /api/v1/maintenance-requests - ตั้งค่าผู้รับผิดชอบค่าใช้จ่าย (payer)', () => {
    test('กรณีระบุ payer ผิดรูปแบบ ต้องปฏิเสธ 400 Bad Request', async () => {
      const response = await request(app)
        .post('/api/v1/maintenance-requests')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'ทดสอบ payer ผิด',
          description: 'ทดสอบ',
          roomId: testRoom.id,
          payer: 'SOMEONE_ELSE'
        });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('ไม่ระบุ payer ต้องได้ค่าเริ่มต้นเป็น MANAGEMENT (นิติออกให้)', async () => {
      const response = await request(app)
        .post('/api/v1/maintenance-requests')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'หลอดไฟขาด',
          description: 'หลอดไฟห้องน้ำขาด',
          roomId: testRoom.id
        });

      expect(response.statusCode).toBe(201);
      expect(response.body.data.payer).toBe('MANAGEMENT');
      createdMaintenanceIds.push(response.body.data.id);
    });
  });

  describe('การรวมค่าซ่อม payer=TENANT เข้าบิลค่าเช่ารอบถัดไปอัตโนมัติ', () => {
    let managementRequest;
    let tenantRequest;

    beforeAll(async () => {
      // ค่าซ่อมที่นิติออกให้ (MANAGEMENT) - ต้องไม่ถูกรวมเข้าบิล
      managementRequest = await billingService.prisma.maintenanceRequest.create({
        data: {
          roomId: testRoom.id,
          tenantId: testTenant.id,
          title: 'ซ่อมท่อประปารั่วส่วนกลาง',
          description: 'ท่อประปารั่วบริเวณหน้าห้อง',
          repairCost: 1200,
          payer: 'MANAGEMENT',
          status: 'resolved'
        }
      });
      createdMaintenanceIds.push(managementRequest.id);

      // ค่าซ่อมที่ลูกบ้านต้องจ่ายเอง (TENANT) และซ่อมเสร็จแล้ว - ต้องถูกรวมเข้าบิลอัตโนมัติ
      tenantRequest = await billingService.prisma.maintenanceRequest.create({
        data: {
          roomId: testRoom.id,
          tenantId: testTenant.id,
          title: 'กระจกหน้าต่างแตกจากการใช้งานของผู้เช่า',
          description: 'ลูกบ้านทำกระจกแตกเอง',
          repairCost: 800,
          payer: 'TENANT',
          status: 'resolved'
        }
      });
      createdMaintenanceIds.push(tenantRequest.id);
    });

    test('สร้างบิลรอบแรก ต้องรวมเฉพาะค่าซ่อม payer=TENANT เข้า otherFee อัตโนมัติ (ไม่รวมของ MANAGEMENT)', async () => {
      const response = await request(app)
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: testRoom.id,
          billingCycle: '10-2026',
          customWaterTotal: 0,
          customElectricTotal: 0,
          waiveCommonFee: true
        });

      expect(response.statusCode).toBe(201);
      expect(Number(response.body.data.otherFee)).toBe(800);
      expect(response.body.data.otherFeeNote).toContain('กระจกหน้าต่างแตก');
      expect(response.body.data.otherFeeNote).not.toContain('ท่อประปารั่ว');
      createdInvoiceIds.push(response.body.data.id);

      // ค่าซ่อมของลูกบ้านต้องถูก mark ว่ารวมบิลแล้ว
      const updatedTenantRequest = await billingService.prisma.maintenanceRequest.findUnique({
        where: { id: tenantRequest.id }
      });
      expect(updatedTenantRequest.billedInvoiceId).toBe(response.body.data.id);

      // ค่าซ่อมของนิติต้องไม่ถูกแตะต้อง
      const updatedManagementRequest = await billingService.prisma.maintenanceRequest.findUnique({
        where: { id: managementRequest.id }
      });
      expect(updatedManagementRequest.billedInvoiceId).toBeNull();
    });

    test('สร้างบิลรอบถัดไปของห้องเดียวกัน ต้องไม่ถูกเรียกเก็บค่าซ่อมเดิมซ้ำอีก (ป้องกัน Double Billing)', async () => {
      const response = await request(app)
        .post('/api/v1/invoices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          roomId: testRoom.id,
          billingCycle: '11-2026',
          customWaterTotal: 0,
          customElectricTotal: 0,
          waiveCommonFee: true
        });

      expect(response.statusCode).toBe(201);
      expect(Number(response.body.data.otherFee)).toBe(0);
      createdInvoiceIds.push(response.body.data.id);
    });

    test('ห้ามแก้ไขค่าซ่อม/ผู้รับผิดชอบของรายการที่ถูกรวมเข้าบิลไปแล้ว (400 Bad Request)', async () => {
      const response = await request(app)
        .patch(`/api/v1/maintenance-requests/${tenantRequest.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ repairCost: 999 });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('ยังแก้ไขฟิลด์อื่น (เช่น adminNote) ของรายการที่ถูกรวมเข้าบิลแล้วได้ตามปกติ', async () => {
      const response = await request(app)
        .patch(`/api/v1/maintenance-requests/${tenantRequest.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ adminNote: 'แจ้งลูกบ้านแล้วว่ารวมในบิลเดือนนี้' });

      expect(response.statusCode).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
