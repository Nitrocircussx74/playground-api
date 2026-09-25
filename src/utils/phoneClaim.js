const prisma = require('../config/prisma');
const { getPhoneVariants } = require('./normalizePhone');

const ADMIN_ROLES = ['owner', 'admin', 'super_admin', 'superadmin', 'manager'];

/** ผู้ดูแลระบบ (ตาราง users) ที่ใช้เบอร์โทรนี้ — ใช้ทั้งตัดสินสิทธิ์ owner ใน LIFF และกันการยึดบัญชีของผู้ดูแล */
async function findAdminUserByPhone(phone) {
  if (!phone) return null;
  const users = await prisma.user.findMany({ where: { phone: { in: getPhoneVariants(phone) } } });
  return users.find((u) => ADMIN_ROLES.includes(u.role?.toLowerCase())) || null;
}

const reject = (statusCode, code, message) => Object.assign(new Error(message), { statusCode, code });

/**
 * กฎเดียวสำหรับทุกเส้นทางที่ "ผูก/ยึดบัญชีผู้เช่าด้วยเบอร์โทร" (ยังไม่มี OTP จึงต้องจำกัดความเสี่ยงที่ตัวบัญชี)
 *  1. ต้องมี LINE ที่ยืนยันกับ LINE Platform แล้วเสมอ (ไม่ยอมให้ผูกโดยไม่มีตัวตนที่พิสูจน์ได้)
 *  2. LINE ที่ผูกกับบัญชีนี้อยู่แล้ว (Tenant.lineUserId หรือ UserLineAccount) ทำได้เสมอ
 *  3. บัญชีที่มีคนใช้แล้ว (ตั้ง PIN หรือผูก LINE ไว้) คนอื่นยึดด้วยเบอร์โทรไม่ได้ ต้องให้แอดมินรีเซ็ต/ยกเลิกการผูก
 *  4. บัญชีที่ยังไม่มีใครใช้ ยึดด้วยเบอร์โทรได้ (การสมัครครั้งแรกของผู้เช่าที่แอดมินลงทะเบียนไว้)
 *     ยกเว้นเบอร์ที่ตรงกับผู้ดูแลระบบ ต้องผูกผ่านรหัสเชิญเท่านั้น (เบอร์นี้ให้สิทธิ์ owner ใน LIFF)
 * throw Error พร้อม statusCode/code เมื่อไม่ผ่าน
 */
async function assertCanClaimByPhone(tenant, lineUserId) {
  if (!lineUserId) {
    throw reject(401, 'LINE_LOGIN_REQUIRED', 'กรุณาเข้าสู่ระบบผ่าน LINE ก่อนผูกบัญชีด้วยเบอร์โทรศัพท์');
  }

  const alreadyLinked =
    tenant.lineUserId === lineUserId ||
    (await prisma.userLineAccount.count({ where: { tenantId: tenant.id, lineUserId } })) > 0;
  if (alreadyLinked) return;

  // รหัสข้อผิดพลาด ACCOUNT_ALREADY_LINKED คงไว้ตามสัญญา API เดิม (ผูก LINE อื่นอยู่แล้ว)
  if (tenant.lineUserId) {
    throw reject(403, 'ACCOUNT_ALREADY_LINKED', 'บัญชีนี้ผูกกับ LINE อื่นไว้แล้ว กรุณาติดต่อนิติบุคคลประจำหอพักเพื่อยกเลิกการผูกก่อน');
  }
  if (tenant.pinHash) {
    throw reject(
      403,
      'ACCOUNT_ALREADY_CLAIMED',
      'บัญชีนี้มีผู้ใช้งานแล้ว กรุณาเข้าสู่ระบบด้วยรหัส PIN เดิม หรือติดต่อนิติบุคคลประจำหอพักเพื่อรีเซ็ต'
    );
  }

  if (await findAdminUserByPhone(tenant.phone)) {
    throw reject(
      403,
      'ADMIN_ACCOUNT_REQUIRES_INVITE',
      'เบอร์โทรนี้เป็นบัญชีผู้ดูแลระบบ กรุณาผูกบัญชีด้วยรหัสเชิญที่ผู้ดูแลออกให้'
    );
  }
}

module.exports = { findAdminUserByPhone, assertCanClaimByPhone };
