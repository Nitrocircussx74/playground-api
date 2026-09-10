const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ตรวจสอบและสร้างโฟลเดอร์ public/uploads หากยังไม่มี
const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 1. ตั้งค่าการจัดเก็บไฟล์ (Disk Storage)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `file-${crypto.randomUUID()}${ext}`);
  }
});

// 2. ตัวกรองชนิดไฟล์ (File Filter) - รองรับเฉพาะ jpg, jpeg, png, webp
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('ชนิดไฟล์ไม่ถูกต้อง อนุญาตเฉพาะไฟล์รูปภาพ (jpg, jpeg, png, webp) เท่านั้น'), false);
  }
};

// 3. กำหนดข้อจำกัดขนาดไฟล์ ไม่เกิน 5MB (5 * 1024 * 1024 bytes)
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

module.exports = upload;
