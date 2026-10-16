const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Delete Building Feature Integration Tests (DELETE /api/v1/buildings/:id)', () => {
  let superAdminToken;
  let managerToken;
  let superAdminUser;
  let managerUser;

  beforeAll(async () => {
    superAdminUser = await billingService.prisma.user.findFirst({
      where: { role: { in: ['SUPERADMIN', 'OWNER', 'super_admin', 'owner'] } }
    });

    managerUser = await billingService.prisma.user.findFirst({
      where: { role: { in: ['MANAGER', 'manager', 'ADMIN', 'admin'] } }
    });

    superAdminToken = authService.generateAccessToken(superAdminUser);
    managerToken = authService.generateAccessToken(managerUser);
  });

  test('กรณีไม่แนบ Token ต้องถูกปฏิเสธด้วย 401 Unauthorized', async () => {
    const response = await request(app).delete('/api/v1/buildings/non-existent-id');
    expect(response.statusCode).toBe(401);
  });

  test('กรณีผู้ใช้มีบทบาทที่ไม่ใช่ OWNER/super_admin (เช่น Manager) ต้องถูกปฏิเสธด้วย 403 Forbidden', async () => {
    const response = await request(app)
      .delete('/api/v1/buildings/some-id')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(response.statusCode).toBe(403);
  });

  test('กรณีไม่พบอาคารตาม ID ต้องตอบกลับ 404 Not Found', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const response = await request(app)
      .delete(`/api/v1/buildings/${fakeId}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(response.statusCode).toBe(404);
    expect(response.body.success).toBe(false);
  });

  test('กรณีอาคารยังมีห้องพักผูกอยู่ ต้องปฏิเสธ 400 Bad Request ป้องกันข้อมูลสูญหาย', async () => {
    // หาอาคารที่มีห้องพักอยู่จริง
    const buildingWithRooms = await billingService.prisma.building.findFirst({
      where: { rooms: { some: {} } }
    });

    expect(buildingWithRooms).toBeDefined();

    const response = await request(app)
      .delete(`/api/v1/buildings/${buildingWithRooms.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain('ยังมีห้องพักผูกอยู่');
  });

  test('กรณีอาคารว่างเปล่า (ไม่มีห้องพัก) ต้องลบอาคารได้สำเร็จ (200 OK) พร้อมบันทึก AuditLog', async () => {
    // สร้างตึกจำลองสำหรับทดสอบการลบ
    const testBuilding = await billingService.prisma.building.create({
      data: {
        name: 'อาคารทดสอบสำหรับลบ',
        address: 'Test Address',
        themeColor: '#EF4444',
        setting: {
          create: {
            promptpayNum: '0819999999'
          }
        }
      }
    });

    const response = await request(app)
      .delete(`/api/v1/buildings/${testBuilding.id}`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain('ลบอาคาร');

    // ตรวจสอบว่าในฐานข้อมูลถูกลบจริง
    const checkDeleted = await billingService.prisma.building.findUnique({
      where: { id: testBuilding.id }
    });
    expect(checkDeleted).toBeNull();

    // ตรวจสอบว่า AuditLog ถูกสร้าง
    const audit = await billingService.prisma.auditLog.findFirst({
      where: {
        action: 'DELETE',
        entity: 'BUILDING',
        entityId: testBuilding.id
      }
    });
    expect(audit).toBeDefined();
  });
});
