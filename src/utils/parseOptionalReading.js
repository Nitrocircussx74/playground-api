/** เลขมิเตอร์ที่ไม่บังคับกรอก: ว่าง = null, ต้องเป็นตัวเลข >= 0 (ผิดรูปแบบ = 400) */
module.exports = function parseOptionalReading(raw, label) {
  if (raw === undefined || raw === null || raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw Object.assign(new Error(`เลขมิเตอร์${label}ไม่ถูกต้อง`), { statusCode: 400 });
  }
  return value;
};
