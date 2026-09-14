const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const prisma = require('../../src/config/prisma');

describe('Developer Feedback System Integration Tests', () => {
  let superAdminToken;
  let tenantToken;
  let superAdminUser;
  let testTenant;
  let createdFeedbackId;

  beforeAll(async () => {
    superAdminUser = await prisma.user.findUnique({
      where: { email: 'superadmin@dorm.com' }
    });
    testTenant = await prisma.tenant.findFirst();

    superAdminToken = authService.generateAccessToken(superAdminUser);
    if (testTenant) {
      tenantToken = authService.generateAccessToken({
        id: testTenant.id,
        tenantId: testTenant.id,
        role: 'tenant',
        name: `${testTenant.firstName} ${testTenant.lastName}`,
        phone: testTenant.phone
      });
    }
  });

  describe('POST /api/v1/feedback (Submit Feedback)', () => {
    test('กรณีไม่ส่ง content ต้องถูกปฏิเสธด้วย HTTP 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/v1/feedback')
        .send({
          category: 'BUG',
          title: 'ทดสอบ'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('ส่ง Feedback จาก Client แบบไม่ล็อกอิน (Guest/Anonymous) สำเร็จ (201 Created)', async () => {
      const res = await request(app)
        .post('/api/v1/feedback')
        .send({
          platform: 'CMS_ADMIN',
          category: 'BUG',
          title: 'ปุ่มบันทึกกดไม่ติด',
          content: 'พอกดปุ่มบันทึกในหน้าจัดการห้องแล้วไม่มีอะไรเกิดขึ้น',
          rating: 4,
          currentRoute: '/admin/rooms',
          deviceContext: {
            browser: 'Chrome 128',
            os: 'macOS',
            screenResolution: '1440x900'
          },
          senderName: 'สมชาย ผู้ทดสอบ'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.category).toBe('BUG');
      expect(res.body.data.status).toBe('NEW');
      createdFeedbackId = res.body.data.id;
    });

    test('ส่ง Feedback พร้อม Bearer Token (Authenticated) สำเร็จ', async () => {
      const res = await request(app)
        .post('/api/v1/feedback')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          platform: 'CMS_ADMIN',
          category: 'FEATURE_REQUEST',
          title: 'ขอระบบออกใบเสนอราคา',
          content: 'อยากให้ออกใบเสนอราคา (Quotation) ได้ก่อนทำสัญญา',
          rating: 5,
          currentRoute: '/admin/leases'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.senderRole).toBe(superAdminUser.role);
    });
  });

  describe('GET /api/admin/feedbacks (List Feedbacks)', () => {
    test('ดึงรายการ Feedback สำหรับ Admin สำเร็จ (200 OK)', async () => {
      const res = await request(app)
        .get('/api/admin/feedbacks')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('feedbacks');
      expect(Array.isArray(res.body.data.feedbacks)).toBe(true);
      expect(res.body.data).toHaveProperty('pagination');
    });

    test('กรอง Feedback ตาม category และ status สำเร็จ', async () => {
      const res = await request(app)
        .get('/api/admin/feedbacks?category=BUG&status=NEW')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.feedbacks.every((f) => f.category === 'BUG')).toBe(true);
    });
  });

  describe('PATCH /api/admin/feedbacks/:id/status (Update Status)', () => {
    test('อัปเดตสถานะเป็น IN_REVIEW และบันทึก devNotes สำเร็จ', async () => {
      if (!createdFeedbackId) return;

      const res = await request(app)
        .patch(`/api/admin/feedbacks/${createdFeedbackId}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          status: 'IN_REVIEW',
          devNotes: 'กำลังตรวจสอบ log จาก Cloudflare'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('IN_REVIEW');
      expect(res.body.data.devNotes).toBe('กำลังตรวจสอบ log จาก Cloudflare');
    });
  });

  describe('DELETE /api/admin/feedbacks/:id (Delete Feedback)', () => {
    test('ลบรายการ Feedback สำเร็จ (200 OK)', async () => {
      if (!createdFeedbackId) return;

      const res = await request(app)
        .delete(`/api/admin/feedbacks/${createdFeedbackId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
