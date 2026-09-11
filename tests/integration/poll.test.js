const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Voting/Polls Integration Tests', () => {
  let adminToken;
  let testBuilding;
  let testTenant;
  let testRoom;
  let createdPollId;

  beforeAll(async () => {
    const adminUser = await billingService.prisma.user.findFirst({
      where: { role: { in: ['SUPERADMIN', 'OWNER', 'ADMIN', 'super_admin', 'owner', 'admin'] } }
    });
    adminToken = authService.generateAccessToken(adminUser);

    testBuilding = await billingService.prisma.building.findFirst();

    testTenant = await billingService.prisma.tenant.create({
      data: {
        firstName: 'ทดสอบ',
        lastName: 'โหวต',
        phone: '0899988001',
        lineUserId: 'U_TEST_POLL_TENANT_999'
      }
    });

    testRoom = await billingService.prisma.room.create({
      data: {
        roomNumber: 'POLL_909',
        floor: 9,
        price: 5000,
        status: 'occupied',
        buildingId: testBuilding.id,
        tenantId: testTenant.id
      }
    });
  });

  afterAll(async () => {
    if (createdPollId) {
      await billingService.prisma.pollVote.deleteMany({ where: { pollId: createdPollId } }).catch(() => {});
      await billingService.prisma.poll.delete({ where: { id: createdPollId } }).catch(() => {});
    }
    if (testRoom) {
      await billingService.prisma.room.delete({ where: { id: testRoom.id } }).catch(() => {});
    }
    if (testTenant) {
      await billingService.prisma.tenant.delete({ where: { id: testTenant.id } }).catch(() => {});
    }
  });

  describe('POST /api/admin/buildings/:buildingId/polls', () => {
    test('แอดมินควรสร้างโพลใหม่สำเร็จ (201 Created)', async () => {
      const response = await request(app)
        .post(`/api/admin/buildings/${testBuilding.id}/polls`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ question: 'เห็นด้วยกับการปรับปรุงสระว่ายน้ำหรือไม่?', options: ['เห็นด้วย', 'ไม่เห็นด้วย'] });

      expect(response.statusCode).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.options).toEqual(['เห็นด้วย', 'ไม่เห็นด้วย']);

      createdPollId = response.body.data.id;
    });

    test('กรณีระบุ options น้อยกว่า 2 ตัวเลือก ต้องตอบกลับ HTTP 400', async () => {
      const response = await request(app)
        .post(`/api/admin/buildings/${testBuilding.id}/polls`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ question: 'คำถามไม่สมบูรณ์', options: ['ตัวเลือกเดียว'] });

      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/liff/polls', () => {
    test('ลูกบ้านควรเห็นโพลที่ active พร้อม hasVoted: false ก่อนโหวต (200 OK)', async () => {
      const response = await request(app)
        .get('/api/v1/liff/polls')
        .set('X-Line-Id-Token', 'U_TEST_POLL_TENANT_999');

      expect(response.statusCode).toBe(200);
      const poll = response.body.data.find((p) => p.id === createdPollId);
      expect(poll).toBeDefined();
      expect(poll.hasVoted).toBe(false);
    });
  });

  describe('POST /api/v1/liff/polls/:id/vote', () => {
    test('ลูกบ้านควรโหวตสำเร็จ และบันทึกด้วย tenantId จาก Token เท่านั้น (IDOR) (201 Created)', async () => {
      const response = await request(app)
        .post(`/api/v1/liff/polls/${createdPollId}/vote`)
        .set('X-Line-Id-Token', 'U_TEST_POLL_TENANT_999')
        .send({ optionIndex: 0, tenantId: 'forged-other-tenant-id' });

      expect(response.statusCode).toBe(201);
      expect(response.body.data.tenantId).toBe(testTenant.id);
      expect(response.body.data.optionIndex).toBe(0);
    });

    test('โหวตซ้ำโพลเดิมอีกครั้งต้องตอบกลับ HTTP 409 Conflict', async () => {
      const response = await request(app)
        .post(`/api/v1/liff/polls/${createdPollId}/vote`)
        .set('X-Line-Id-Token', 'U_TEST_POLL_TENANT_999')
        .send({ optionIndex: 1 });

      expect(response.statusCode).toBe(409);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/admin/polls/:id/results', () => {
    test('แอดมินควรเห็นผลโหวตตรงกับจำนวนที่โหวตจริง (200 OK)', async () => {
      const response = await request(app)
        .get(`/api/admin/polls/${createdPollId}/results`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.statusCode).toBe(200);
      expect(response.body.data.totalVotes).toBe(1);
      expect(response.body.data.results[0].votes).toBe(1);
      expect(response.body.data.results[1].votes).toBe(0);
    });
  });

  describe('PATCH /api/admin/polls/:id (ปิดโพล)', () => {
    test('แอดมินปิดโพลแล้ว ลูกบ้านคนอื่นต้องโหวตไม่ได้ (400)', async () => {
      const closeResponse = await request(app)
        .patch(`/api/admin/polls/${createdPollId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });
      expect(closeResponse.statusCode).toBe(200);
      expect(closeResponse.body.data.isActive).toBe(false);

      const otherTenant = await billingService.prisma.tenant.create({
        data: { firstName: 'อีกคน', lastName: 'โหวต', phone: '0899988002', lineUserId: 'U_TEST_POLL_TENANT_OTHER' }
      });

      const voteResponse = await request(app)
        .post(`/api/v1/liff/polls/${createdPollId}/vote`)
        .set('X-Line-Id-Token', 'U_TEST_POLL_TENANT_OTHER')
        .send({ optionIndex: 0 });

      expect(voteResponse.statusCode).toBe(400);

      await billingService.prisma.tenant.delete({ where: { id: otherTenant.id } }).catch(() => {});
    });
  });
});
