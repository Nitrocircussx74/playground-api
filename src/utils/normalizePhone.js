/**
 * สร้างรายการรูปแบบเบอร์โทรศัพท์ที่เป็นไปได้ทั้งหมด สำหรับค้นหาในฐานข้อมูล
 * รองรับเบอร์ที่เก็บแบบมี/ไม่มีเลข 0 นำหน้า และแบบมีรหัสประเทศ 66
 * @param {string} rawPhone
 * @returns {string[]}
 */
function getPhoneVariants(rawPhone) {
  const raw = String(rawPhone || '').trim();
  const cleanDigits = raw.replace(/\D/g, '');
  return [
    raw,
    cleanDigits,
    cleanDigits.startsWith('0') ? cleanDigits.slice(1) : `0${cleanDigits}`,
    cleanDigits.startsWith('66') ? `0${cleanDigits.slice(2)}` : cleanDigits
  ];
}

module.exports = { getPhoneVariants };
