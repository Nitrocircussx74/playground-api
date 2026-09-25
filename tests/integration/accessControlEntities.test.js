const request = require('supertest');
const app = require('../../src/app');
const prisma = require('../../src/config/prisma');
const authService = require('../../src/services/authService');

// แอดมินที่มีสิทธิ์เฉพาะตึก A ต้องแตะเอนทิตีของตึก B ผ่าน route :id ไม่ได้ (403) แต่ owner ทำได้ และ id ที่ไม่มีต้องได้ 404
describe('Cross-building access control on :id routes (Phase 1b)', () => {
  const tag = `p1b_${Date.now()}`;
  const F = {}; // fixtures ของตึก B
  let adminA, ownerUser, buildingA, buildingB, adminToken, ownerToken;

  beforeAll(async () => {
    adminA = await prisma.user.create({ data: { email: `${tag}@dorm.com`, passwordHash: 'x', name: 'Admin A', role: 'admin' } });
    buildingA = await prisma.building.create({ data: { name: `${tag} A` } });
    buildingB = await prisma.building.create({ data: { name: `${tag} B` } });
    await prisma.userBuildingPermission.create({ data: { userId: adminA.id, buildingId: buildingA.id } });

    const b = buildingB.id;
    F.tenant = await prisma.tenant.create({ data: { firstName: 'B', lastName: 'Tenant', phone: '0800000002' } });
    F.room = await prisma.room.create({ data: { buildingId: b, roomNumber: 'B1', floor: 1, price: 1000, status: 'occupied', tenantId: F.tenant.id } });
    F.vendor = await prisma.vendor.create({ data: { buildingId: b, name: 'v', category: 'PLUMBER' } });
    F.parcel = await prisma.parcel.create({ data: { buildingId: b, roomId: F.room.id, courier: 'X' } });
    F.facility = await prisma.facility.create({ data: { buildingId: b, name: 'gym' } });
    F.poll = await prisma.poll.create({ data: { buildingId: b, question: 'q', options: ['a', 'b'] } });
    F.announcement = await prisma.announcement.create({ data: { title: 't', content: 'c', targetType: 'ALL' } }); // ไม่ผูกตึก = Global
    F.vehicle = await prisma.vehicle.create({ data: { buildingId: b, tenantId: F.tenant.id, licensePlate: 'กก1', vehicleType: 'CAR' } });
    F.lease = await prisma.leaseContract.create({
      data: { roomId: F.room.id, tenantId: F.tenant.id, buildingId: b, startDate: new Date(), expectedEndDate: new Date(Date.now() + 864e5) }
    });
    F.issue = await prisma.issueTicket.create({ data: { userId: F.tenant.id, roomId: F.room.id, buildingId: b, description: 'd' } });
    F.maintenance = await prisma.maintenanceRequest.create({ data: { roomId: F.room.id, title: 'm', description: 'd' } });
    F.invite = await prisma.roomInvite.create({ data: { roomId: F.room.id, code: tag.slice(-6).toUpperCase(), expiresAt: new Date(Date.now() + 864e5) } });

    adminToken = authService.generateAccessToken(adminA);
    ownerUser = await prisma.user.create({ data: { email: `${tag}_owner@dorm.com`, passwordHash: 'x', name: 'Owner', role: 'owner' } });
    ownerToken = authService.generateAccessToken(ownerUser);
  });

  afterAll(async () => {
    await prisma.roomInvite.deleteMany({ where: { roomId: F.room.id } });
    await prisma.maintenanceRequest.deleteMany({ where: { roomId: F.room.id } });
    await prisma.issueTicket.deleteMany({ where: { roomId: F.room.id } });
    await prisma.vehicle.deleteMany({ where: { buildingId: buildingB.id } });
    await prisma.leaseContract.deleteMany({ where: { roomId: F.room.id } });
    await prisma.parcel.deleteMany({ where: { buildingId: buildingB.id } });
    await prisma.poll.deleteMany({ where: { buildingId: buildingB.id } });
    await prisma.announcement.deleteMany({ where: { id: F.announcement.id } });
    await prisma.facility.deleteMany({ where: { buildingId: buildingB.id } });
    await prisma.vendor.deleteMany({ where: { buildingId: buildingB.id } });
    await prisma.room.deleteMany({ where: { id: F.room.id } });
    await prisma.tenant.delete({ where: { id: F.tenant.id } });
    await prisma.building.deleteMany({ where: { id: { in: [buildingA.id, buildingB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [adminA.id, ownerUser.id] } } });
  });

  const as = (token, method, url) => request(app)[method](url).set('Authorization', `Bearer ${token}`).send({});

  test('แอดมินตึก A แตะเอนทิตีของตึก B ผ่าน :id ไม่ได้ (403) ทุกกลุ่ม route', async () => {
    const cases = [
      ['put', `/api/admin/vendors/${F.vendor.id}`],
      ['delete', `/api/admin/vendors/${F.vendor.id}`],
      ['patch', `/api/v1/parcels/${F.parcel.id}/pickup`],
      ['delete', `/api/v1/parcels/${F.parcel.id}`],
      ['patch', `/api/admin/facilities/${F.facility.id}`],
      ['delete', `/api/admin/facilities/${F.facility.id}`],
      ['patch', `/api/v1/polls/${F.poll.id}`],
      ['get', `/api/v1/polls/${F.poll.id}/results`],
      ['patch', `/api/admin/vehicles/${F.vehicle.id}/approve`],
      ['get', `/api/admin/leases/${F.lease.id}/contract`],
      ['post', `/api/admin/leases/${F.lease.id}/terminate`],
      ['get', `/api/admin/leases/${F.lease.id}/move-out-calculation`],
      ['get', `/api/admin/leases/${F.lease.id}/inspections`],
      ['get', `/api/admin/rooms/${F.room.id}/history`],
      ['put', `/api/admin/issues/${F.issue.id}`],
      ['patch', `/api/admin/${F.maintenance.id}/status`],
      ['delete', `/api/v1/invites/${F.invite.id}`],
      ['get', `/api/v1/invites/room/${F.room.id}`],
      ['get', `/api/admin/tenants/${F.tenant.id}`],
      ['post', `/api/admin/tenants/${F.tenant.id}/reset-pin`],
      ['post', `/api/admin/tenants/${F.tenant.id}/unlink-line`],
      ['post', `/api/admin/tenants/${F.tenant.id}/generate-invite`],
      ['patch', `/api/admin/tenants/${F.tenant.id}/notes`]
    ];
    for (const [method, url] of cases) {
      const res = await as(adminToken, method, url);
      expect([method, url, res.statusCode]).toEqual([method, url, 403]);
    }
  });

  test('ประกาศแบบ Global (ไม่ผูกตึก) ลบได้เฉพาะ owner/super_admin', async () => {
    expect((await as(adminToken, 'delete', `/api/admin/broadcasts/${F.announcement.id}`)).statusCode).toBe(403);
  });

  test('POST ที่อ้างห้อง/ตึกของตึกอื่นผ่าน body ต้องถูกปฏิเสธ (403)', async () => {
    const asPost = (url, body) => request(app).post(url).set('Authorization', `Bearer ${adminToken}`).send(body);
    expect((await asPost('/api/admin/inspections', { leaseId: F.lease.id, buildingId: buildingA.id, type: 'MOVE_IN', items: [] })).statusCode).toBe(403);
    expect((await asPost('/api/v1/invites', { roomId: F.room.id })).statusCode).toBe(403);
    expect((await asPost('/api/admin/tenants/manual', { roomId: F.room.id, firstName: 'x', lastName: 'y', phone: '0811111111' })).statusCode).toBe(403);
  });

  test('List ฝั่งแอดมินต้องไม่เห็นข้อมูลตึก B และขอ buildingId=B ตรง ๆ ได้ 403', async () => {
    const leases = await as(adminToken, 'get', '/api/admin/leases');
    expect(leases.statusCode).toBe(200);
    expect(leases.body.data.some((l) => l.id === F.lease.id)).toBe(false);
    expect((await as(adminToken, 'get', `/api/admin/leases?buildingId=${buildingB.id}`)).statusCode).toBe(403);

    const issues = await as(adminToken, 'get', '/api/admin/issues');
    expect(issues.body.data.some((i) => i.id === F.issue.id)).toBe(false);
    expect((await as(adminToken, 'get', `/api/admin/issues?buildingId=${buildingB.id}`)).statusCode).toBe(403);

    const maint = await as(adminToken, 'get', '/api/v1/maintenance-requests');
    expect(maint.body.data.some((m) => m.id === F.maintenance.id)).toBe(false);
    expect((await as(adminToken, 'get', `/api/v1/maintenance-requests?buildingId=${buildingB.id}`)).statusCode).toBe(403);
  });

  test('owner เข้าถึงได้ และ id ที่ไม่มีอยู่ต้องได้ 404 (ไม่ใช่ 403/500)', async () => {
    expect((await as(ownerToken, 'get', `/api/admin/tenants/${F.tenant.id}`)).statusCode).toBe(200);
    expect((await as(ownerToken, 'get', `/api/admin/leases/${F.lease.id}/contract`)).statusCode).toBe(200);
    const missing = '00000000-0000-4000-8000-00000000dead';
    expect((await as(adminToken, 'get', `/api/admin/leases/${missing}/contract`)).statusCode).toBe(404);
  });
});
