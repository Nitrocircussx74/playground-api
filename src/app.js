const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const { doubleCsrf } = require('csrf-csrf');
const path = require('path');

const config = require('./config/env');
const passport = require('./config/passport');
const swaggerSpec = require('./config/swagger');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/errorMiddleware');

const app = express();

// Enable trust proxy for Cloudflare Tunnel & reverse proxies to correctly detect HTTPS / Client IP
app.set('trust proxy', 1);

if (config.nodeEnv !== 'test') {
  app.use(morgan('dev'));
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'x-csrf-token', 'Origin', 'X-Line-Id-Token']
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static Uploads Folder
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => config.jwtAccessSecret || 'super_secret_csrf_key',
  cookieName: 'x-csrf-token',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production'
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS']
});

app.get('/api/csrf-token', (req, res) => {
  const csrfToken = generateToken(req, res);
  res.json({ success: true, csrfToken });
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use(passport.initialize());

app.use('/', routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
