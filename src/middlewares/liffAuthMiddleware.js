const config = require('../config/env');

/**
 * ตรวจสอบ LINE ID Token กับ LINE Platform จริง (Server-Side Token Verification)
 * ป้องกันไม่ให้ Client ปลอมแปลง lineUserId ส่งมาเองทาง Query/Body ได้ตรง ๆ
 *
 * Mock Mode (Test/Local): เพื่อไม่ให้ Integration Test ต้องยิง Network Request ไปหา LINE จริง
 * จะถือว่า Token ที่ส่งมาคือ lineUserId ดิบ ๆ เลย (สอดคล้องกับแนวทาง Mock ของ lineService.js)
 *
 * @param {string} idToken LINE ID Token จาก liff.getIDToken() ฝั่ง Client
 * @returns {Promise<{ sub: string, aud?: string }>} Payload ที่ verify แล้ว (sub คือ lineUserId ที่เชื่อถือได้)
 */
async function verifyLineIdToken(idToken) {
  if (config.nodeEnv === 'test' || config.line.mockMode) {
    return { sub: idToken, aud: config.line.liffChannelId || 'mock_channel_id' };
  }

  const params = new URLSearchParams();
  params.append('id_token', idToken);
  params.append('client_id', config.line.liffChannelId || '');

  const response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });

  if (!response.ok) {
    throw new Error('LINE ID Token ไม่ถูกต้องหรือหมดอายุแล้ว');
  }

  const payload = await response.json();

  if (config.line.liffChannelId && payload.aud !== config.line.liffChannelId) {
    throw new Error('LINE ID Token นี้ไม่ได้ออกให้กับแอปพลิเคชันนี้');
  }

  return payload;
}

/**
 * Middleware สำหรับยืนยันตัวตนผู้เช่าที่เข้าใช้งานผ่าน LINE LIFF
 * แนบ req.lineUserId ที่ verify แล้วให้ Controller ใช้แทนค่าที่ Client ส่งมาเอง
 */
const liffAuthMiddleware = async (req, res, next) => {
  try {
    const idToken = req.headers['x-line-id-token'];

    if (!idToken) {
      return res.status(401).json({
        success: false,
        message: 'กรุณาเข้าสู่ระบบผ่าน LINE ก่อนใช้งาน (ไม่พบ LINE ID Token)'
      });
    }

    const payload = await verifyLineIdToken(idToken);
    req.lineUserId = payload.sub;
    req.lineUser = {
      lineUserId: payload.sub,
      displayName: payload.name || null,
      pictureUrl: payload.picture || null,
      email: payload.email || null
    };
    next();
  } catch (error) {
    console.warn(`⚠️ LINE ID Token verification failed: ${error.message}`);
    return res.status(401).json({
      success: false,
      message: 'กรุณาเข้าสู่ระบบผ่าน LINE ใหม่อีกครั้ง (LINE ID Token ไม่ถูกต้องหรือหมดอายุ)'
    });
  }
};

module.exports = liffAuthMiddleware;
module.exports.verifyLineIdToken = verifyLineIdToken;
