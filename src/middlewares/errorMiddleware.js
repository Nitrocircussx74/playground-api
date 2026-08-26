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
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

  res.status(statusCode).json({
    success: false,
    message: err.message || 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์ (Internal Server Error)',
    stack: config.nodeEnv === 'development' ? err.stack : undefined
  });
};

module.exports = {
  notFoundHandler,
  errorHandler
};
