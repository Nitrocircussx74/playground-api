const billingService = require('../../../src/services/billingService');

const d = (c, day, now = new Date(2020, 0, 1)) => billingService.dueDateForCycle(c, day, now);
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
test('ออกบิลย้อนหลังหลังพ้นวันครบกำหนดของรอบนั้นแล้ว: ครบกำหนดวันนี้ ไม่ย้อนเป็นอดีต', () => {
  expect(ymd(d('03-2026', 5, new Date(2026, 8, 25, 14, 30)))).toEqual([2026, 9, 25]);
  expect(ymd(d('08-2026', 5, new Date(2026, 8, 25)))).toEqual([2026, 9, 25]);
  // ยังไม่พ้นกำหนด: ใช้วันตามรอบเหมือนเดิม
  expect(ymd(d('09-2026', 5, new Date(2026, 8, 25)))).toEqual([2026, 10, 5]);
});
