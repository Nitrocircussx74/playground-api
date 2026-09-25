jest.mock('../../../src/services/billingService', () => ({ prisma: { featureToggle: { findMany: jest.fn() } } }));
const { prisma } = require('../../../src/services/billingService');
const { isFeatureEnabled } = require('../../../src/middlewares/requireFeatureMiddleware');

const rows = (list) => prisma.featureToggle.findMany.mockResolvedValue(list);

describe('isFeatureEnabled: ค่าเฉพาะตึก > Global > เปิด', () => {
  test('ไม่มี Record เลย = เปิด', async () => {
    rows([]);
    expect(await isFeatureEnabled('K', 'bA')).toBe(true);
  });
  test('ปิด Global แล้วตึกไม่มี Override = ปิด (เดิมหลุด)', async () => {
    rows([{ buildingId: null, isActive: false }]);
    expect(await isFeatureEnabled('K', 'bA')).toBe(false);
  });
  test('Override ตึกชนะ Global', async () => {
    rows([{ buildingId: null, isActive: false }, { buildingId: 'bA', isActive: true }]);
    expect(await isFeatureEnabled('K', 'bA')).toBe(true);
    rows([{ buildingId: null, isActive: true }, { buildingId: 'bA', isActive: false }]);
    expect(await isFeatureEnabled('K', 'bA')).toBe(false);
  });
});
