const dotenv = require('dotenv');

// โหลด Environment Variables จากไฟล์ .env
dotenv.config();

const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  // จำนวน Proxy ที่เชื่อถือหน้า API (ใช้หา IP จริงของ Client สำหรับ Rate Limit) — ตั้งให้ตรงกับโครงสร้างจริง:
  // 0 = ไม่มี Proxy (Client ต่อตรง: กัน Client ปลอม X-Forwarded-For), 1 = Proxy/Tunnel ชั้นเดียว (ค่าเริ่มต้น), 2 = Cloudflare + Nginx
  trustProxy: Number.isInteger(Number(process.env.TRUST_PROXY)) && process.env.TRUST_PROXY !== '' && process.env.TRUST_PROXY !== undefined
    ? Number(process.env.TRUST_PROXY)
    : 1,
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    name: process.env.DB_NAME || 'playground_db',
    ssl: process.env.DB_SSL === 'true'
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'default_access_secret_key',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default_refresh_secret_key',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  },
  // Base URL สาธารณะของ API สำหรับสร้างลิงก์ไฟล์อัปโหลด (เช่น https://api.example.com) ดู utils/publicUrl.js
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  // รายชื่อ Origin ที่อนุญาตให้เรียก API ได้ตอน Production (คั่นด้วย , เช่น "https://myapp.com,https://liff.line.me")
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  line: {
    // Channel Access Token สำหรับส่ง Push Message และดึง Profile
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    // LIFF ID เต็ม (เช่น 2011289517-SB8YziXL)
    liffId: process.env.LINE_LIFF_ID || '',
    // Channel ID ของ LIFF App (ตัวเลขส่วนหน้าของ LIFF ID ก่อนขีด) ใช้ตรวจสอบ aud ของ LINE ID Token
    liffChannelId: process.env.LINE_LIFF_CHANNEL_ID || '',
    // เปิดโหมด Mock การตรวจสอบ LINE ID Token สำหรับ Local Dev
    mockMode: process.env.LINE_AUTH_MOCK_MODE === 'true'
  }
};

// ค่าตัวอย่าง/ค่าเริ่มต้นที่รู้กันทั่วไป (อยู่ใน .env.example, docker-compose, และค่า fallback ด้านบน) ห้ามใช้จริง
const PLACEHOLDER_SECRET = /change_in_production|default_|your_|changeme|example/i;

/**
 * ตรวจค่าตั้งที่ทำให้ระบบถูกเจาะได้ทั้งระบบถ้าหลุดขึ้น Production (เรียกตอน boot ใน server.js)
 * - JWT secret เป็นค่าตัวอย่าง/สั้น/ซ้ำกัน = ใครก็ปลอม Token ของ owner ได้
 * - LINE_AUTH_MOCK_MODE เปิด = ใครก็ส่ง lineUserId ของผู้เช่าคนอื่นมาสวมรอยได้
 */
config.assertProductionConfig = (cfg = config) => {
  if (cfg.nodeEnv !== 'production') return;

  const problems = [];
  for (const [name, value] of [['JWT_ACCESS_SECRET', cfg.jwt.accessSecret], ['JWT_REFRESH_SECRET', cfg.jwt.refreshSecret]]) {
    if (!value || value.length < 32 || PLACEHOLDER_SECRET.test(value)) {
      problems.push(`${name} ต้องเป็นค่าสุ่มยาวอย่างน้อย 32 ตัวอักษร และห้ามเป็นค่าตัวอย่าง/ค่าเริ่มต้น`);
    }
  }
  if (cfg.jwt.accessSecret === cfg.jwt.refreshSecret) {
    problems.push('JWT_ACCESS_SECRET และ JWT_REFRESH_SECRET ต้องเป็นคนละค่ากัน');
  }
  if (cfg.line.mockMode) {
    problems.push('LINE_AUTH_MOCK_MODE ต้องเป็น false บน Production (โหมดนี้ให้ใครก็สวมรอยเป็นผู้เช่าคนอื่นได้)');
  }

  if (problems.length > 0) {
    throw new Error(`ค่าตั้งของ Production ไม่ปลอดภัย:\n - ${problems.join('\n - ')}`);
  }
};

module.exports = config;
