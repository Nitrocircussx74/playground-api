/**
 * จำกัดจำนวนครั้งที่กรอกรหัสผิด "ต่อบัญชี" (ไม่ผูกกับ IP) — เสริม rate limit ต่อ IP ที่หลบได้ด้วยการเปลี่ยน IP
 * PIN มีแค่ 6 หลัก (1 ล้านแบบ) จึงต้องจำกัดที่ตัวบัญชีด้วย: ผิดครบ MAX_FAILS ครั้งภายใน WINDOW_MS ล็อกจนหมดช่วงเวลา
 * กรอกถูกแล้วเคลียร์ตัวนับ (ผู้โจมตีที่รู้แค่เบอร์โทรจึงล็อกเจ้าของบัญชีได้ชั่วคราว: ยอมรับเป็นข้อแลกเปลี่ยน)
 *
 * ponytail: เก็บใน Memory ของ Process เดียว (รีสตาร์ท/หลาย Instance แล้วตัวนับแยกกัน)
 * ถ้าต้อง Scale หลาย Instance ให้ย้ายตัวนับไปที่ DB/Redis
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 10;
const MAX_KEYS = 10000; // กัน Map โตไม่จำกัดจากการยิงมั่ว key

const failures = new Map(); // key -> { count, resetAt }

function live(key, now) {
  const entry = failures.get(key);
  if (entry && entry.resetAt <= now) {
    failures.delete(key);
    return null;
  }
  return entry || null;
}

function isLocked(key, now = Date.now()) {
  const entry = live(key, now);
  return Boolean(entry && entry.count >= MAX_FAILS);
}

function recordFailure(key, now = Date.now()) {
  const entry = live(key, now);
  if (entry) {
    entry.count += 1;
    return;
  }
  if (failures.size >= MAX_KEYS) {
    for (const [k, v] of failures) if (v.resetAt <= now) failures.delete(k);
    if (failures.size >= MAX_KEYS) failures.delete(failures.keys().next().value);
  }
  failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
}

function clear(key) {
  failures.delete(key);
}

module.exports = { isLocked, recordFailure, clear, MAX_FAILS, WINDOW_MS };
