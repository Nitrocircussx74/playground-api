const { z } = require('zod');

/**
 * Zod Schema สำหรับตรวจสอบความถูกต้องของ Request Body ใน Endpoint POST /auth/login
 */
const loginSchema = z.object({
  email: z
    .string({ required_error: 'กรุณาระบุ Email' })
    .email({ message: 'รูปแบบ Email ไม่ถูกต้อง' }),
  password: z
    .string({ required_error: 'กรุณาระบุ Password' })
    .min(6, { message: 'Password ต้องมีความยาวอย่างน้อย 6 ตัวอักษร' })
});

module.exports = {
  loginSchema
};
