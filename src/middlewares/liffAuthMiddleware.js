const config = require('../config/env');
const lineService = require('../services/lineService');

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

  let response;
  try {
    response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
  } catch (networkError) {
    // เข้าถึง LINE Platform ไม่ได้เลย (Network/DNS/Timeout) — เป็นปัญหาฝั่ง Infra ไม่ใช่ Token ผิด
    // ต้อง Log ไว้แยกจากกรณี Token หมดอายุปกติ เพื่อ Query ดู LINE API Outage ได้จากที่เดียว
    await lineService.logDelivery({
      notificationType: 'AUTH_VERIFY',
      messagePreview: 'เชื่อมต่อ LINE ID Token Verify API ไม่ได้ (Network Error)',
      status: 'FAILED',
      errorReason: networkError.message
    });
    throw new Error('ไม่สามารถเชื่อมต่อ LINE Platform เพื่อยืนยันตัวตนได้ กรุณาลองใหม่อีกครั้ง');
  }

  if (!response.ok) {
    // เฉพาะ 5xx/429 เท่านั้นที่ถือเป็นปัญหาฝั่ง LINE API (Outage/Rate Limit) ที่ควร Log ไว้เพื่อสังเกตการณ์
    // ส่วน Token หมดอายุ/ไม่ถูกต้องปกติ (4xx ทั่วไป) เป็นพฤติกรรมผู้ใช้งานปกติ ไม่ log กันรก Log
    if (response.status >= 500 || response.status === 429) {
      await lineService.logDelivery({
        notificationType: 'AUTH_VERIFY',
        messagePreview: `LINE ID Token Verify API ตอบกลับผิดปกติ (HTTP ${response.status})`,
        status: 'FAILED',
        errorReason: `HTTP ${response.status} ${response.statusText || ''}`.trim()
      });
    }
    throw new Error('LINE ID Token ไม่ถูกต้องหรือหมดอายุแล้ว');
  }

  const payload = await response.json();

  if (config.line.liffChannelId && payload.aud !== config.line.liffChannelId) {
    throw new Error('LINE ID Token นี้ไม่ได้ออกให้กับแอปพลิเคชันนี้');
  }

  return payload;
}

const authService = require('../services/authService');

/**
 * Middleware สำหรับยืนยันตัวตนผู้เช่าที่เข้าใช้งานผ่าน LINE LIFF
 * รองรับทั้ง:
 * 1. Backend JWT Bearer Token (Authorization: Bearer <jwt>) ที่ออกให้หลัง Silent Login
 * 2. LINE ID Token (X-Line-Id-Token) จาก liff.getIDToken()
 */
const liffAuthMiddleware = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const idToken = req.headers['x-line-id-token'];
  const queryToken = req.query?.token || req.query?.t;

  // 1. ตรวจสอบว่ามี Backend JWT Bearer Token หรือ Query Token หรือไม่
  const rawToken = (authHeader && authHeader.startsWith('Bearer '))
    ? authHeader.split(' ')[1]
    : queryToken;

  if (rawToken) {
    try {
      const decoded = authService.verifyAccessToken(rawToken);
      req.user = decoded;
      req.tenantId = decoded.tenantId || decoded.id;
      req.lineUserId = decoded.lineUserId || req.lineUserId;
      req.lineUser = {
        lineUserId: decoded.lineUserId || req.lineUserId,
        displayName: decoded.name || decoded.displayName,
        email: decoded.email
      };
      return next();
    } catch (jwtError) {
      // หาก JWT หมดอายุ และไม่มี X-Line-Id-Token แนบมา ให้ส่ง 401 เพื่อให้ Client Interceptor ทำ Silent Re-Auth
      if (!idToken) {
        return res.status(401).json({
          success: false,
          code: 'TOKEN_EXPIRED',
          message: 'เซสชันการใช้งานหมดอายุ กรุณาต่ออายุเซสชัน (Token Expired)'
        });
      }
    }
  }

  // 2. ตรวจสอบ LINE ID Token
  try {
    if (!idToken) {
      // ⚠️ เจตนาใช้แค่ nodeEnv==='development' เท่านั้น (ไม่รวม mockMode) — จุดนี้คือ "ไม่มี Token
      // แนบมาเลย ปล่อยผ่านแบบ Anonymous" ซึ่งเป็นความสะดวกตอน Dev เท่านั้น คนละเรื่องกับ mockMode ที่มีไว้
      // "ข้ามการยิง Network ไปตรวจ Token ที่ส่งมาจริง" (อยู่ใน verifyLineIdToken() ด้านบนแล้ว) — เดิมรวมกัน
      // ทำให้เปิด LINE_AUTH_MOCK_MODE=true ไว้ทดสอบผ่าน Browser แล้ว Integration Test (NODE_ENV=test)
      // ที่ตั้งใจยิง Request แบบไม่มี Token เพื่อเช็คว่าต้องโดน 401 กลับพังไปด้วย เพราะเข้าเงื่อนไขนี้ผ่าน
      if (config.nodeEnv === 'development') {
        const devLineUserId = req.headers['x-line-user-id'] || req.query?.lineUserId || req.body?.lineUserId;
        if (devLineUserId) {
          req.lineUserId = devLineUserId;
          req.lineUser = {
            lineUserId: devLineUserId,
            displayName: req.headers['x-line-display-name'] || 'Dev User'
          };
          return next();
        }

        // กรณีไม่ส่ง lineUserId มาใน dev mode ให้ปล่อยผ่านพร้อม req.lineUserId = null ให้ controller จัดการต่อ
        req.lineUserId = null;
        req.lineUser = null;
        return next();
      }

      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
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
    // ⚠️ เจตนาใช้แค่ nodeEnv==='development' เท่านั้น (เหตุผลเดียวกับจุดข้างบน) — ถ้า mockMode เปิดอยู่จริง
    // verifyLineIdToken() ด้านบนจะ Short-circuit สำเร็จไปแล้วตั้งแต่ต้น ไม่มีทางโยน Error มาเข้า catch นี้
    // ได้เลย จุดนี้จึงเป็น Fallback สำหรับ "verify ล้มเหลวจริง" ซึ่งควรอิง nodeEnv อย่างเดียว
    if (config.nodeEnv === 'development') {
      let fallbackUserId = req.headers['x-line-user-id'] || req.query?.lineUserId;
      if (!fallbackUserId && idToken && typeof idToken === 'string' && idToken.startsWith('eyJ')) {
        try {
          const decoded = jwt.decode(idToken);
          if (decoded?.sub) {
            fallbackUserId = decoded.sub;
          }
        } catch (_) {}
      }
      fallbackUserId = fallbackUserId || (typeof idToken === 'string' && !idToken.startsWith('eyJ') ? idToken : 'dev_line_user');
      req.lineUserId = fallbackUserId;
      req.lineUser = { lineUserId: fallbackUserId, displayName: 'Dev LINE User' };
      return next();
    }
    return res.status(401).json({
      success: false,
      code: 'TOKEN_INVALID',
      message: 'กรุณาเข้าสู่ระบบผ่าน LINE ใหม่อีกครั้ง (LINE ID Token ไม่ถูกต้องหรือหมดอายุ)'
    });
  }
};

module.exports = liffAuthMiddleware;
module.exports.verifyLineIdToken = verifyLineIdToken;
