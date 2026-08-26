const { ZodError } = require('zod');

/**
 * Middleware สำหรับนำ Zod Schema มาตรวจสอบข้อมูล Request (Body, Query, Params)
 * @param {import('zod').ZodSchema} schema - Zod Schema ที่ต้องการใช้ตรวจสอบ
 */
const validate = (schema) => (req, res, next) => {
  try {
    // ดำเนินการ Parse และ Validate ข้อมูลใน req.body
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof ZodError) {
      // จัดรูปแบบข้อผิดพลาดจาก Zod ให้เข้าใจง่าย
      const formattedErrors = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message
      }));

      return res.status(400).json({
        success: false,
        message: 'ข้อมูลที่ส่งมาไม่ถูกต้องตามข้อกำหนด (Validation Failed)',
        errors: formattedErrors
      });
    }

    next(error);
  }
};

module.exports = validate;
