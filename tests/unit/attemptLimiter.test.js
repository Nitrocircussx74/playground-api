const limiter = require('../../src/utils/attemptLimiter');

describe('attemptLimiter (จำกัดรหัสผิดต่อบัญชี)', () => {
  const { MAX_FAILS, WINDOW_MS } = limiter;
  const t0 = 1_000_000;

  test('ล็อกเมื่อผิดครบ MAX_FAILS ครั้ง และไม่กระทบบัญชีอื่น', () => {
    for (let i = 0; i < MAX_FAILS - 1; i++) limiter.recordFailure('acct-a', t0);
    expect(limiter.isLocked('acct-a', t0)).toBe(false);

    limiter.recordFailure('acct-a', t0);
    expect(limiter.isLocked('acct-a', t0)).toBe(true);
    expect(limiter.isLocked('acct-b', t0)).toBe(false);
  });

  test('พ้นช่วงเวลาแล้วปลดล็อกอัตโนมัติ และนับใหม่จาก 0', () => {
    expect(limiter.isLocked('acct-a', t0 + WINDOW_MS - 1)).toBe(true);
    expect(limiter.isLocked('acct-a', t0 + WINDOW_MS)).toBe(false);

    limiter.recordFailure('acct-a', t0 + WINDOW_MS);
    expect(limiter.isLocked('acct-a', t0 + WINDOW_MS)).toBe(false);
  });

  test('clear เคลียร์ตัวนับ (กรอกถูกแล้วเริ่มใหม่)', () => {
    for (let i = 0; i < MAX_FAILS; i++) limiter.recordFailure('acct-c', t0);
    expect(limiter.isLocked('acct-c', t0)).toBe(true);
    limiter.clear('acct-c');
    expect(limiter.isLocked('acct-c', t0)).toBe(false);
  });
});
