jest.mock('../../../src/config/prisma', () => ({ tenant: { findUnique: jest.fn() }, invoice: { findUnique: jest.fn() } }));
const prisma = require('../../../src/config/prisma');
const { scopeTenantRooms, requireOwnInvoice } = require('../../../src/middlewares/liffAuthMiddleware');

const room = (id, buildingId) => ({ id, buildingId });
const run = async (mw, req) => {
  const res = { status: jest.fn(function () { return this; }), json: jest.fn() };
  const next = jest.fn();
  await mw(req, res, next);
  return { res, next };
};

beforeEach(() => {
  // ผู้เช่าถือครอง 101 (ตึก A), เป็นผู้อยู่ร่วม 202 (ตึก B), มีสัญญา ACTIVE ห้อง 303 (ตึก B)
  prisma.tenant.findUnique.mockResolvedValue({
    id: 't1',
    rooms: [room('101', 'bA')],
    roomResidents: [{ room: room('202', 'bB') }],
    leaseContracts: [{ room: room('303', 'bB') }]
  });
});

describe('scopeTenantRooms', () => {
  test('ห้องที่มีสิทธิ์ (ผู้อยู่ร่วม) ใช้ได้ และได้ตึกของห้องนั้น', async () => {
    const req = { lineUserId: 'U1', roomId: '202', buildingId: 'bA', query: {}, body: {} };
    await run(scopeTenantRooms, req);
    expect([req.roomId, req.buildingId, req.scope.roomIds]).toEqual(['202', 'bB', ['101', '202', '303']]);
  });

  test('แก้ X-Room-Id/X-Building-Id เป็นของคนอื่น ต้องไม่ถูกใช้', async () => {
    const req = { lineUserId: 'U1', roomId: 'victim-room', buildingId: 'victim-building', query: {}, body: {} };
    await run(scopeTenantRooms, req);
    expect([req.roomId, req.buildingId]).toEqual(['101', 'bA']);
  });

  test('ตัด tenantId/lineUserId/roomNumber ที่ Client ส่งมาเองทิ้ง', async () => {
    const req = { lineUserId: 'U1', query: { tenantId: 'x', lineUserId: 'x', roomNumber: '1', keep: 'y' }, body: { tenantId: 'x', lineUserId: 'x' } };
    await run(scopeTenantRooms, req);
    expect([req.query, req.body]).toEqual([{ keep: 'y' }, {}]);
  });

  test('ยังไม่มี Record ผู้เช่า (Onboarding) ไม่แตะ buildingId', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);
    const req = { lineUserId: 'U9', roomId: null, buildingId: 'bNew', query: {}, body: {} };
    await run(scopeTenantRooms, req);
    expect([req.buildingId, req.scope.tenantId]).toEqual(['bNew', null]);
  });
});

describe('requireOwnInvoice', () => {
  const scope = { tenantId: 't1', roomIds: ['101', '202'] };
  test('บิลของห้องที่มีสิทธิ์ผ่าน, ของคนอื่นโดน 403', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ roomId: '202', tenantId: 'primary' });
    expect((await run(requireOwnInvoice, { params: { id: 'i1' }, scope })).next).toHaveBeenCalled();

    prisma.invoice.findUnique.mockResolvedValue({ roomId: 'other', tenantId: 'other' });
    const { res, next } = await run(requireOwnInvoice, { params: { id: 'i2' }, scope });
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('Web Tenant ที่ไม่มี Record ผู้เช่าและไม่ใช่ Staff ต้องโดน 403', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ roomId: '101', tenantId: 't1' });
    const { res } = await run(requireOwnInvoice, { params: { id: 'i1' }, scope: { tenantId: null, roomIds: [] }, user: { role: 'tenant' } });
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
