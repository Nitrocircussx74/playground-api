const config = require('../config/env');

/**
 * Middleware สำหรับจัดการ Route ที่หาไม่พบ (404 Not Found)
 */
const notFoundHandler = (req, res, next) => {
  const error = new Error(`ไม่พบ Endpoint นี้ - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

/**
 * Middleware สำหรับจัดการ Error แบบรวมศูนย์ (Global Error Handler)
 */
const errorHandler = (err, req, res, next) => {
  // ⚠️ เดิมไม่เคยอ่าน err.statusCode เลย ทำให้ Error ที่ throw จาก Service พร้อม statusCode
  // ตั้งใจไว้ (เช่น 404/400/403 ใน tenantService, lineService) กลายเป็น 500 เสมอเวลาที่ Controller
  // ส่งต่อด้วย next(error) โดยไม่ได้ res.status() เองก่อน — แก้ให้ยึด err.statusCode เป็นหลัก
  const statusCode = err.statusCode || err.status || (res.statusCode === 200 ? 500 : res.statusCode);

  res.status(statusCode).json({
    success: false,
    message: err.message || 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ (Internal Server Error)',
    ...(err.code && { code: err.code }),
    ...(err.data !== undefined && { data: err.data }),
    stack: config.nodeEnv === 'development' ? err.stack : undefined
  });
};

module.exports = {
  notFoundHandler,
  errorHandler
};
