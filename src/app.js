const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const passport = require('./config/passport');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/errorMiddleware');

// สร้าง Express Application
const app = express();

// 1. ตั้งค่า Security Middlewares (Helmet & Rate Limiting)
app.use(helmet()); // ป้องกัน HTTP Headers จากการโจมตีทางเว็บ

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // กำหนดช่วงเวลา 15 นาที
  max: 100, // จำกัดจำนวนสูงสุด 100 Requests ต่อ 1 IP ในช่วงเวลาที่กำหนด
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'มีการส่ง Request ถี่เกินไป กรุณารอ 15 นาทีแล้วลองใหม่อีกครั้ง (Rate limit exceeded)'
  }
});

app.use(limiter); // ติดตั้ง Rate Limiter ป้องกัน Brute-force & DoS Attacks

// 2. ตั้งค่า Parser และ CORS
app.use(cors()); // อนุญาต Cross-Origin Resource Sharing
app.use(express.json()); // JSON Body Parser สำหรับรับข้อมูลแบบ application/json
app.use(express.urlencoded({ extended: true })); // URL-encoded Body Parser

// 3. Initial setup สำหรับระบบ OAuth 2.0 (Passport.js)
app.use(passport.initialize());

// 4. ติดตั้ง Master Router
app.use('/', routes);

// 5. ติดตั้ง Middlewares สำหรับจัดการ Error
app.use(notFoundHandler); // 404 Handler
app.use(errorHandler); // Global Error Handler

module.exports = app;
