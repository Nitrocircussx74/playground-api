const dotenv = require('dotenv');

// โหลด Environment Variables จากไฟล์ .env
dotenv.config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
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
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback'
  },
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
