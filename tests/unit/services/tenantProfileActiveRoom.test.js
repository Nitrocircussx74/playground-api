jest.mock('../../../src/config/prisma', () => ({
  tenant: { findUnique: jest.fn() },
  user: { findFirst: jest.fn().mockResolvedValue(null) }
}));
const prisma = require('../../../src/config/prisma');
const tenantService = require('../../../src/services/tenantService');

const room = (id, buildingId, themeColor) => ({ id, roomNumber: id, price: 0, buildingId, building: { name: buildingId, themeColor }, residents: [] });

describe('getTenantProfileForLiff - ห้องที่เลือกอยู่', () => {
  beforeEach(() => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 't1', firstName: 'A', lastName: 'B', lineUserId: 'U1',
      rooms: [room('101', 'bA', '#111111'), room('202', 'bB', '#222222')],
      roomResidents: [], leaseContracts: []
    });
  });

  test('ไม่ระบุห้อง ใช้ห้องแรก', async () => {
    const p = await tenantService.getTenantProfileForLiff({ lineUserId: 'U1' });
    expect(p.buildingId).toBe('bA');
  });

  test('X-Room-Id ชี้ห้องตึกอื่น ต้องได้ buildingId/ธีมของตึกนั้น', async () => {
    const p = await tenantService.getTenantProfileForLiff({ lineUserId: 'U1', activeRoomId: '202' });
    expect([p.buildingId, p.roomNumber, p.themeColor]).toEqual(['bB', '202', '#222222']);
  });

  test('มีแค่ X-Building-Id ก็เลือกตึกถูก, ห้องที่ไม่ใช่ของตัวเอง fallback ห้องแรก', async () => {
    expect((await tenantService.getTenantProfileForLiff({ lineUserId: 'U1', activeBuildingId: 'bB' })).buildingId).toBe('bB');
    expect((await tenantService.getTenantProfileForLiff({ lineUserId: 'U1', activeRoomId: 'x', activeBuildingId: 'x' })).buildingId).toBe('bA');
  });
});

describe('pickActiveRoom', () => {
  const pickActiveRoom = require('../../../src/utils/pickActiveRoom');
  const rooms = [{ id: '101', buildingId: 'bA' }, { id: '202', buildingId: 'bB' }];
  test('roomId ก่อน, แล้ว buildingId, ไม่งั้นห้องแรก, ไม่มีห้องคืน null', () => {
    expect(pickActiveRoom(rooms, { roomId: '202', buildingId: 'bA' }).id).toBe('202');
    expect(pickActiveRoom(rooms, { buildingId: 'bB' }).id).toBe('202');
    expect(pickActiveRoom(rooms, { roomId: 'other' }).id).toBe('101');
    expect(pickActiveRoom([], {})).toBeNull();
  });
});
