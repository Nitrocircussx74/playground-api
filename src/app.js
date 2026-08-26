const express = require('express');
const cors = require('cors');
const passport = require('./config/passport');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/errorMiddleware');

// สร้าง Express Application
const app = express();

// 1. ตั้งค่า Middleware พื้นฐาน
app.use(cors()); // อนุญาต Cross-Origin Resource Sharing
app.use(express.json()); // JSON Body Parser สำหรับรับข้อมูลแบบ application/json
app.use(express.urlencoded({ extended: true })); // URL-encoded Body Parser

// 2. Initial setup สำหรับระบบ OAuth 2.0 (Passport.js)
app.use(passport.initialize());

// 3. ติดตั้ง Master Router
app.use('/', routes);

// 4. ติดตั้ง Middlewares สำหรับจัดการ Error
app.use(notFoundHandler); // 404 Handler
app.use(errorHandler); // Global Error Handler

module.exports = app;
