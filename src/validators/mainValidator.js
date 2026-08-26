const { z } = require('zod');

/**
 * Zod Schema สำหรับตรวจสอบความถูกต้องของ Request Body ใน Endpoint POST /api
 */
const createApiDataSchema = z.object({
  title: z
    .string({
      required_error: 'กรุณาระบุหัวข้อ (title)',
      invalid_type_error: 'หัวข้อ (title) ต้องเป็นข้อความ ตัวอักษรเท่านั้น'
    })
    .min(3, { message: 'หัวข้อ (title) ต้องมีความยาวอย่างน้อย 3 ตัวอักษร' })
    .max(100, { message: 'หัวข้อ (title) ต้องมีความยาวไม่เกิน 100 ตัวอักษร' }),

  description: z
    .string({
      required_error: 'กรุณาระบุรายละเอียด (description)',
      invalid_type_error: 'รายละเอียด (description) ต้องเป็นข้อความ'
    })
    .min(5, { message: 'รายละเอียด (description) ต้องมีความยาวอย่างน้อย 5 ตัวอักษร' }),

  category: z
    .enum(['general', 'technology', 'finance', 'health'], {
      errorMap: () => ({
        message: 'หมวดหมู่ (category) ต้องเป็นหนึ่งใน: general, technology, finance, health'
      })
    })
    .default('general')
});

module.exports = {
  createApiDataSchema
};
