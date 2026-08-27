const request = require('supertest');
const app = require('../../src/app');
const authService = require('../../src/services/authService');
const billingService = require('../../src/services/billingService');

describe('Bulk Room Import Integration Tests (POST /api/v1/rooms/import)', () => {
  let superAdminToken;
  let targetBuilding;

  beforeAll(async () => {
    const superAdminUser = await billingService.prisma.user.findUnique({
      where: { email: 'superadmin@dorm.com' }
    });
    superAdminToken = authService.generateAccessToken(superAdminUser);

    targetBuilding = await billingService.prisma.building.findFirst();
  });

  test('POST /api/v1/rooms/import - ควรนำเข้าห้องใหม่แบบ Batch สำเร็จ (201 Created)', async () => {
    const importData = {
      buildingId: targetBuilding.id,
      rooms: [
        { roomNumber: 'IMP101', floor: 1, price: 4200, status: 'available' },
        { roomNumber: 'IMP102', floor: 1, price: 4200, status: 'available' },
        { roomNumber: 'IMP201', floor: 2, price: 4500, status: 'available' }
      ]
    };

    // Clean up if exist
    await billingService.prisma.room.deleteMany({
      where: { roomNumber: { in: ['IMP101', 'IMP102', 'IMP201'] } }
    });

    const response = await request(app)
      .post('/api/v1/rooms/import')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send(importData);

    expect(response.statusCode).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.createdCount).toBe(3);
    expect(response.body.data.skippedCount).toBe(0);

    // Clean up after test
    await billingService.prisma.room.deleteMany({
      where: { roomNumber: { in: ['IMP101', 'IMP102', 'IMP201'] } }
    });
  });

  test('POST /api/v1/rooms/import - กรณีมีห้องซ้ำ ควรข้ามห้องซ้ำและนำเข้าเฉพาะห้องใหม่ (Skip Duplicates)', async () => {
    const roomNumExist = 'IMP_EX101';
    const roomNumNew = 'IMP_NEW102';

    // Clean up
    await billingService.prisma.room.deleteMany({
      where: { roomNumber: { in: [roomNumExist, roomNumNew] } }
    });

    // Create existing room beforehand
    await billingService.prisma.room.create({
      data: {
        roomNumber: roomNumExist,
        floor: 1,
        price: 4000,
        buildingId: targetBuilding.id
      }
    });

    const response = await request(app)
      .post('/api/v1/rooms/import')
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({
        buildingId: targetBuilding.id,
        rooms: [
          { roomNumber: roomNumExist, floor: 1, price: 4000 },
          { roomNumber: roomNumNew, floor: 1, price: 4500 }
        ]
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.data.createdCount).toBe(1);
    expect(response.body.data.skippedCount).toBe(1);

    // Clean up after test
    await billingService.prisma.room.deleteMany({
      where: { roomNumber: { in: [roomNumExist, roomNumNew] } }
    });
  });
});
