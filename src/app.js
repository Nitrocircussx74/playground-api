const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

const config = require('./config/env');
const routes = require('./routes');
const { jsonReplacer } = require('./utils/secrets');
const { notFoundHandler, errorHandler } = require('./middlewares/errorMiddleware');

const app = express();

// จำนวน Proxy หน้า API ตั้งผ่าน TRUST_PROXY (ดู config/env.js) — ตั้งผิดแล้ว Rate Limit จะเพี้ยน:
// น้อยเกินไป = ทุกคนใช้ IP เดียวกัน (ล็อกกันทั้งระบบ), มากเกินไป = Client ปลอม X-Forwarded-For หลบ Limit ได้
app.set('trust proxy', config.trustProxy);

if (config.nodeEnv !== 'test') {
  // ลิงก์ดาวน์โหลด PDF/QR ของ LIFF แนบ JWT ใน ?token= ต้องไม่ให้ค่านี้ไปอยู่ใน Log
  morgan.token('safe-url', (req) => req.originalUrl.replace(/([?&](?:token|t)=)[^&]*/g, '$1[redacted]'));
  app.use(morgan(':method :safe-url :status :response-time ms - :res[content-length]'));
}

// Disable restrictive Content Security Policy and enable Cross-Origin Access for Development & Cloudflare Tunnels
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false
  })
);

// 1. CORS: Production ต้องระบุ Whitelist Origin ชัดเจนใน ALLOWED_ORIGINS (เช่น Frontend Domain จริง + https://liff.line.me)
// ส่วน Dev/Test ยัง Reflect ทุก Origin ได้ตามเดิม เพื่อรองรับ Cloudflare Tunnel ที่ Subdomain เปลี่ยนทุกครั้งตอนทดสอบ LIFF จริง
const corsOptions = {
  origin:
    config.nodeEnv === 'production'
      ? (origin, callback) => {
          // อนุญาต request ที่ไม่มี Origin (เช่น server-to-server, curl, mobile app) และ Origin ที่อยู่ใน Whitelist เท่านั้น
          if (!origin || config.allowedOrigins.includes(origin)) {
            return callback(null, true);
          }
          return callback(new Error(`CORS: Origin '${origin}' ไม่ได้รับอนุญาต`));
        }
      : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'x-csrf-token', 'Origin', 'X-Line-Id-Token', 'X-Building-Id', 'X-Room-Id', 'X-Line-User-Id']
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.nodeEnv === 'production' ? 500 : 10000, // Unrestricted requests during development & Cloudflare Tunnels
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Rate limit exceeded, please try again after 15 minutes'
  }
});
app.use(limiter);

// กัน hash/ความลับของตึกหลุดไปกับ res.json ทุก Endpoint (ดู utils/secrets.js)
app.set('json replacer', jsonReplacer);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static Uploads Folder with Cache-Control
app.use(
  '/uploads',
  express.static(path.join(__dirname, '../public/uploads'), {
    maxAge: config.nodeEnv === 'production' ? '7d' : 0,
    etag: true
  })
);

app.use('/', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
