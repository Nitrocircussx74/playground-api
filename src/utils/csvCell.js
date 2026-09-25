/**
 * ค่าใน CSV: ครอบ "" และ escape ", พร้อมกัน Formula Injection (ค่าที่ขึ้นต้นด้วย = + - @ tab CR จะถูก Excel/Sheets ตีเป็นสูตร
 * ชื่อผู้เช่ากรอกเองตอนลงทะเบียน จึงต้องนำหน้าด้วย ' ก่อนส่งให้แอดมินเปิดไฟล์)
 */
module.exports = (value) => {
  const text = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};
