const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('In-App Notification Bell Integration Tests', () => {
  let adminToken;
  let testBuilding;
  let testTenant;
  let testRoom;
  let vehicleId;

  beforeAll(async () => {
    const adminUser = await billingService.prisma.user.findFirst({
      where: { role: { in: ['SUPERADMIN', 'OWNER', 'ADMIN', 'super_admin', 'owner', 'admin'] } }
    });
    adminToken = authService.generateAccessToken(adminUser);

    testBuilding = await billingService.prisma.building.findFirst();

    testTenant = await billingService.prisma.tenant.create({
      data: { firstName: 'ทดสอบ', lastName: 'กระดิ่ง', phone: '0899988301', lineUserId: 'U_TEST_BELL_TENANT_999' }
    });
    testRoom = await billingService.prisma.room.create({
      data: { roomNumber: 'BELL_901', floor: 9, price: 5000, status: 'occupied', buildingId: testBuilding.id, tenantId: testTenant.id }
    });
  });

  afterAll(async () => {
    await billingService.prisma.notificationLog.deleteMany({ where: { tenantId: testTenant.id } }).catch(() => {});
    await billingService.prisma.vehicle.deleteMany({ where: { tenantId: testTenant.id } }).catch(() => {});
    await billingService.prisma.room.delete({ where: { id: testRoom.id } }).catch(() => {});
    await billingService.prisma.tenant.delete({ where: { id: testTenant.id } }).catch(() => {});
  });

  test('ลูกบ้านจดทะเบียนรถใหม่ ต้องสร้าง NotificationLog ชนิด VEHICLE_NEW ให้แอดมิน', async () => {
    const response = await request(app)
      .post('/api/v1/liff/vehicles')
      .set('X-Line-Id-Token', 'U_TEST_BELL_TENANT_999')
      .send({ licensePlate: 'กก-9999', vehicleType: 'car' });

    expect(response.statusCode).toBe(201);
    vehicleId = response.body.data.id;

    const log = await billingService.prisma.notificationLog.findFirst({
      where: { notificationType: 'VEHICLE_NEW', tenantId: testTenant.id }
    });
    expect(log).not.toBeNull();
    expect(log.readAt).toBeNull();
  });

  test('กระดิ่งแอดมินต้องเห็นแจ้งเตือนที่ยังไม่อ่าน และนับ unreadCount ได้', async () => {
    const response = await request(app)
      .get(`/api/admin/buildings/${testBuilding.id}/notifications?unread=1`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.unreadCount).toBeGreaterThanOrEqual(1);
    expect(response.body.data.some((n) => n.notificationType === 'VEHICLE_NEW' && n.tenantId === testTenant.id)).toBe(true);
  });

  test('กระดิ่งลูกบ้านต้องไม่เห็นแจ้งเตือนที่เป็นของแอดมิน (VEHICLE_NEW)', async () => {
    const response = await request(app)
      .get('/api/v1/liff/notifications')
      .set('X-Line-Id-Token', 'U_TEST_BELL_TENANT_999');

    expect(response.statusCode).toBe(200);
    expect(response.body.data.some((n) => n.notificationType === 'VEHICLE_NEW')).toBe(false);
  });

  test('แอดมินอ่านทั้งหมดแล้ว ต้องหายไปจากรายการที่ยังไม่อ่าน', async () => {
    const markRead = await request(app)
      .post(`/api/admin/buildings/${testBuilding.id}/notifications/read-all`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(markRead.statusCode).toBe(200);
    expect(markRead.body.count).toBeGreaterThanOrEqual(1);

    const response = await request(app)
      .get(`/api/admin/buildings/${testBuilding.id}/notifications?unread=1`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(response.body.data.some((n) => n.notificationType === 'VEHICLE_NEW' && n.tenantId === testTenant.id)).toBe(false);
  });
});
