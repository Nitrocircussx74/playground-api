const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const { doubleCsrf } = require('csrf-csrf');

const config = require('./config/env');
const passport = require('./config/passport');
const swaggerSpec = require('./config/swagger');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/errorMiddleware');

// สร้าง Express Application
const app = express();

// 1. ตั้งค่า Logging ด้วย Morgan (โหมด dev / combined)
if (config.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}

// 2. ตั้งค่า Security Middlewares (Helmet & Rate Limiting)
app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 นาที
  max: 100, // 100 Requests ต่อ IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'มีการส่ง Request ถี่เกินไป กรุณารอ 15 นาทีแล้วลองใหม่อีกครั้ง (Rate limit exceeded)'
  }
});
app.use(limiter);

// 3. ตั้งค่า CORS ( credentials: true สำหรับ HTTP-Only Cookie )
app.use(
  cors({
    origin: config.clientUrl || 'http://localhost:5173',
    credentials: true
  })
);

// 4. Parsers (JSON, URL-Encoded และ Cookie Parser)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 5. ตั้งค่า CSRF Protection (Double CSRF Pattern)
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

// Endpoint แจก CSRF Token สำหรับ Frontend
app.get('/api/csrf-token', (req, res) => {
  const csrfToken = generateToken(req, res);
  res.json({ success: true, csrfToken });
});

// 6. API Documentation (Swagger UI)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 7. Initial setup สำหรับระบบ OAuth 2.0 (Passport.js)
app.use(passport.initialize());

// 8. ติดตั้ง Master Router
app.use('/', routes);

// 9. Global Error Handlers
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
