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

  // 1. ตรวจสอบว่ามี Backend JWT Bearer Token หรือไม่
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = authService.verifyAccessToken(token);
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
      // ในโหมด Development หรือ Mock Mode อนุญาตให้ใช้ x-line-user-id / query lineUserId หรือ dev fallback
      // เพื่อให้สามารถเปิดทดสอบ UI ใน Standalone Browser หรือ Dev Tunnel ได้โดยไม่ติด 401
      if (config.nodeEnv === 'development' || config.line.mockMode) {
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
    // ใน dev mode หาก verify กับ LINE ล้มเหลว (เช่น รันออฟไลน์ หรือใช้ mock token) ให้ fallback ได้
    if (config.nodeEnv === 'development' || config.line.mockMode) {
      const fallbackUserId = req.headers['x-line-user-id'] || req.query?.lineUserId || idToken || 'dev_line_user';
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
