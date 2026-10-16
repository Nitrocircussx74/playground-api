const config = require('../config/env');

/**
 * URL เต็มของไฟล์ใน /uploads ที่จะเก็บลง DB: ใช้ PUBLIC_BASE_URL ที่ตั้งไว้ ไม่เชื่อ Host header ของ Client
 * (ส่ง Host: evil.example มาแล้ว URL ที่เก็บ/แสดงให้แอดมินคลิกจะพาไปโดเมนอื่น) ไม่ได้ตั้ง = fallback ตาม Request (เหมาะกับ Dev)
 */
module.exports = (req, filename) =>
  `${config.publicBaseUrl || `${req.protocol}://${req.get('host')}`}/uploads/${filename}`;
