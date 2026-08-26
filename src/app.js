const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const config = require('./config/env');
const passport = require('./config/passport');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/errorMiddleware');

// สร้าง Express Application
const app = express();

// 1. ตั้งค่า Security Middlewares (Helmet & Rate Limiting)
app.use(helmet());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // ช่วงเวลา 15 นาที
  max: 100, // จำกัดสูงสุด 100 Requests ต่อ 1 IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'มีการส่ง Request ถี่เกินไป กรุณารอ 15 นาทีแล้วลองใหม่อีกครั้ง (Rate limit exceeded)'
  }
});

app.use(limiter);

// 2. ตั้งค่า CORS (ต้องเปิด credentials: true เพื่อให้ส่ง HTTP-Only Cookies ได้)
app.use(
  cors({
    origin: config.clientUrl,
    credentials: true
  })
);

// 3. ตั้งค่า Parsers (JSON, URL-Encoded และ Cookie Parser)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // Cookie Parser สำหรับอ่าน req.cookies.refreshToken

// 4. Initial setup สำหรับระบบ OAuth 2.0 (Passport.js)
app.use(passport.initialize());

// 5. ติดตั้ง Master Router
app.use('/', routes);

// 6. ติดตั้ง Middlewares สำหรับจัดการ Error
app.use(notFoundHandler); // 404 Handler
app.use(errorHandler); // Global Error Handler

module.exports = app;
