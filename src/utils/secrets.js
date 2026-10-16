/**
 * ฟิลด์ลับที่ห้ามหลุดไปกับ JSON Response ใดๆ (ใช้เป็น `json replacer` ของ Express ใน app.js)
 * - hash ของรหัสผ่าน/PIN: ตัดทิ้งทั้งหมด (ไม่มี Client ไหนต้องใช้)
 * - LINE Channel Token/Secret: ส่งเป็น MASK ให้ UI รู้ว่าตั้งค่าไว้แล้ว โดยไม่เห็นค่าจริง
 *   (ตอนบันทึก ถ้าได้ MASK กลับมา = ผู้ใช้ไม่ได้แก้ ให้คงค่าเดิมใน DB)
 *
 * ponytail: กรองที่ปลาย Response เพราะหลาย Controller ใช้ include: true ส่งทั้ง Record ออกไป
 * ถ้าต้องกันตั้งแต่ Query (เช่น กัน Log/Service อื่น) ให้ย้ายไปใช้ Prisma omit (preview omitApi)
 */
const SECRET_MASK = '********';
const HIDDEN_KEYS = new Set(['pinHash', 'passwordHash']);
const MASKED_KEYS = new Set(['lineChannelAccessToken', 'lineChannelSecret']);

const jsonReplacer = (key, value) => {
  if (HIDDEN_KEYS.has(key)) return undefined;
  if (MASKED_KEYS.has(key) && value) return SECRET_MASK;
  return value;
};

module.exports = { SECRET_MASK, jsonReplacer };
