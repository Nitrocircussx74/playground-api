const fs = require('fs');

/**
 * ตรวจ Magic Bytes (File Signature) ของไฟล์รูปภาพที่แนบมาจริง ๆ
 * ป้องกัน Client ปลอม Content-Type Header (multer fileFilter เช็คแค่ Header ที่ Client ส่งมา ปลอมได้ง่าย)
 */
function isAllowedImageBuffer(buffer) {
  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buffer.length >= pngSignature.length && pngSignature.every((byte, i) => buffer[i] === byte)) {
    return true;
  }
  // WEBP: "RIFF" (byte 0-3) ... "WEBP" (byte 8-11)
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return true;
  }
  return false;
}

/**
 * Middleware ที่ต้องต่อจาก multer `upload.single('file')` เสมอ (ทำงานหลัง req.file ถูกเขียนลงดิสก์แล้ว)
 * อ่านแค่ 12 byte แรกของไฟล์มาตรวจ Signature จริง ถ้าไม่ใช่รูปภาพที่อนุญาต จะลบไฟล์ทิ้งแล้วปฏิเสธ 400
 */
const verifyImageMagicBytes = (req, res, next) => {
  if (!req.file) {
    return next();
  }

  let fd;
  try {
    const header = Buffer.alloc(12);
    fd = fs.openSync(req.file.path, 'r');
    fs.readSync(fd, header, 0, 12, 0);
    fs.closeSync(fd);
    fd = undefined;

    if (!isAllowedImageBuffer(header)) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({
        success: false,
        message: 'ไฟล์ที่แนบมาไม่ใช่รูปภาพที่ถูกต้อง (jpg, jpeg, png, webp) กรุณาแนบไฟล์รูปภาพจริง'
      });
    }

    next();
  } catch (error) {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore
      }
    }
    next(error);
  }
};

module.exports = verifyImageMagicBytes;
