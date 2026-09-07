const path = require('path');
const fs = require('fs');

/**
 * ลงทะเบียนฟอนต์ภาษาไทย (Sarabun) ให้กับเอกสาร PDFKit
 * เพื่อแก้ปัญหาฟอนต์ภาษาไทยแสดงผลเป็นภาษาต่างดาว (Mojibake)
 */
function setupThaiFonts(doc) {
  const regularPath = path.join(__dirname, '../assets/fonts/Sarabun-Regular.ttf');
  const boldPath = path.join(__dirname, '../assets/fonts/Sarabun-Bold.ttf');

  if (fs.existsSync(regularPath) && fs.existsSync(boldPath)) {
    doc.registerFont('ThaiRegular', regularPath);
    doc.registerFont('ThaiBold', boldPath);
    return { regular: 'ThaiRegular', bold: 'ThaiBold' };
  }

  // Fallback กรณีหาไฟล์ฟอนต์ไม่พบ
  return { regular: 'Helvetica', bold: 'Helvetica-Bold' };
}

module.exports = {
  setupThaiFonts
};
