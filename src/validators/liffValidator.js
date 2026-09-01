const { z } = require('zod');

/**
 * Zod Schema สำหรับ POST /api/v1/liff/auth/link-account (ผูกบัญชี LINE เข้ากับผู้เช่าที่มีอยู่แล้ว)
 */
const linkAccountSchema = z.object({
  inviteCode: z
    .string({ required_error: 'กรุณาระบุรหัสเชิญ 6 หลัก' })
    .trim()
    .min(1, { message: 'กรุณาระบุรหัสเชิญ 6 หลัก' }),
  phoneLast4: z
    .string({ required_error: 'กรุณาระบุเบอร์โทรศัพท์ 4 ตัวท้าย' })
    .trim()
    .regex(/^\d{4}$/, { message: 'เบอร์โทรศัพท์ 4 ตัวท้ายต้องเป็นตัวเลข 4 หลัก' }),
  lineDisplayName: z.string().trim().max(200).nullish(),
  linePictureUrl: z.string().trim().url({ message: 'รูปแบบ URL รูปโปรไฟล์ไม่ถูกต้อง' }).nullish().or(z.literal('')),
  lineStatusMessage: z.string().trim().max(200).nullish()
});

/**
 * Zod Schema สำหรับ POST /api/v1/liff/register/invite (ลงทะเบียนผู้เช่าใหม่ด้วย Invite Code)
 */
const registerInviteSchema = z.object({
  inviteCode: z
    .string({ required_error: 'กรุณาระบุรหัสเชิญ' })
    .trim()
    .min(1, { message: 'กรุณาระบุรหัสเชิญ' }),
  firstName: z
    .string({ required_error: 'กรุณาระบุชื่อจริง' })
    .trim()
    .min(1, { message: 'กรุณาระบุชื่อจริง' }),
  lastName: z
    .string({ required_error: 'กรุณาระบุนามสกุล' })
    .trim()
    .min(1, { message: 'กรุณาระบุนามสกุล' }),
  phone: z
    .string({ required_error: 'กรุณาระบุเบอร์โทรศัพท์' })
    .trim()
    .regex(/^[0-9]{9,10}$/, { message: 'เบอร์โทรศัพท์ไม่ถูกต้อง ต้องเป็นตัวเลขความยาว 9-10 หลัก' }),
  idCard: z
    .string()
    .trim()
    .regex(/^\d{13}$/, { message: 'เลขบัตรประจำตัวประชาชนต้องเป็นตัวเลข 13 หลัก' })
    .nullish()
    .or(z.literal('')),
  lineDisplayName: z.string().trim().max(200).nullish(),
  linePictureUrl: z.string().trim().url({ message: 'รูปแบบ URL รูปโปรไฟล์ไม่ถูกต้อง' }).nullish().or(z.literal('')),
  lineStatusMessage: z.string().trim().max(200).nullish()
});

module.exports = {
  linkAccountSchema,
  registerInviteSchema
};
