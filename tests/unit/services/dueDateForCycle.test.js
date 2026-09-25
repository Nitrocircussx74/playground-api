const billingService = require('../../../src/services/billingService');

const d = (c, day) => billingService.dueDateForCycle(c, day);
const ymd = (x) => [x.getFullYear(), x.getMonth() + 1, x.getDate()];

test('due date is dueDateDay of the month after the cycle', () => {
  expect(ymd(d('03-2026', 5))).toEqual([2026, 4, 5]);
});
test('December cycle rolls into next year', () => {
  expect(ymd(d('12-2026', 5))).toEqual([2027, 1, 5]);
});
test('day is clamped to month length', () => {
  expect(ymd(d('01-2026', 31))).toEqual([2026, 2, 28]);
  expect(ymd(d('01-2028', 31))).toEqual([2028, 2, 29]);
});
