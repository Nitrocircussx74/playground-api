const express = require('express');
const router = express.Router();
const passport = require('passport');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const authenticateJWT = require('../middlewares/authMiddleware');
const validate = require('../middlewares/validateMiddleware');
const { loginSchema } = require('../validators/authValidator');
const config = require('../config/env');

// จำกัดจำนวนครั้งการลอง PIN ต่อ IP เพื่อป้องกัน Brute Force รหัส PIN 6 หลัก (เหมือน linkAccountLimiter ใน liffRoutes.js)
// ปิดใน Test Env เพื่อไม่ให้ Integration Test ที่ยิงซ้ำๆ ติด 429 เอง
const pinAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.nodeEnv === 'test',
  message: {
    success: false,
    message: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณาลองใหม่อีกครั้งใน 15 นาที'
  }
});

/**
 * @route   GET /auth/google
 * @desc    เริ่มต้นกระบวนการยืนยันตัวตนด้วย Google OAuth 2.0
 */
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

/**
 * @route   GET /auth/google/callback
 * @desc    Google OAuth Callback เมื่อผู้ใช้ยืนยันตัวตนสำเร็จ ออก Access Token และ Refresh Token Cookie
 */
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/login', session: false }),
  authController.googleCallback
);

/**
 * @route   POST /auth/login
 * @desc    เข้าสู่ระบบ (Zod Validation) -> ส่งคืน Access Token ใน Body และฝัง Refresh Token ใน HttpOnly Cookie
 */
router.post('/login', validate(loginSchema), authController.login);

/**
 * @route   POST /auth/login/line
 * @desc    เข้าสู่ระบบด้วย LINE SSO ID Token สำหรับลูกบ้านและผู้ใช้งาน LIFF
 */
router.post('/login/line', authController.loginLine);

/**
 * @route   POST /auth/liff/pin-login (and alias /auth/pin-login)
 * @desc    เข้าสู่ระบบด้วย LIFF Seamless PIN 6 หลัก
 */
router.post('/liff/pin-login', pinAttemptLimiter, authController.pinLogin);
router.post('/pin-login', pinAttemptLimiter, authController.pinLogin);

/**
 * @route   POST /auth/liff/setup-pin (and alias /auth/setup-pin)
 * @desc    ตั้งค่าหรือเปลี่ยนรหัส PIN 6 หลักสำหรับลูกบ้าน
 */
router.post('/liff/setup-pin', pinAttemptLimiter, authController.setupPin);
router.post('/setup-pin', pinAttemptLimiter, authController.setupPin);
router.post('/liff/reset-pin', pinAttemptLimiter, authController.setupPin);
router.post('/reset-pin', pinAttemptLimiter, authController.setupPin);

/**
 * @route   POST /auth/liff/verify-phone-status
 * @desc    ตรวจสอบเบอร์โทรศัพท์ว่ามีในระบบแล้วหรือไม่สำหรับ Multi-Building Centralized Identity
 */
router.post('/liff/verify-phone-status', pinAttemptLimiter, authController.verifyPhoneStatus);

/**
 * @route   POST /auth/liff/link-and-login
 * @desc    ยืนยัน PIN เพื่อผูก LINE OA ใหม่กับ User เดิม และเข้าสู่ระบบทันที
 */
router.post('/liff/link-and-login', pinAttemptLimiter, authController.linkAndLogin);

/**
 * @route   POST /auth/login/local
 * @desc    เข้าสู่ระบบด้วยเบอร์โทรศัพท์และรหัสผ่าน (Local Password Authentication)
 */
router.post('/login/local', pinAttemptLimiter, authController.loginLocal);

/**
 * @route   POST /auth/web/login (and alias /api/auth/web/login, /api/v1/auth/web/login)
 * @desc    เข้าสู่ระบบสำหรับลูกบ้านบน Web Browser ปกติด้วยเบอร์โทรศัพท์ + รหัส PIN 6 หลัก (Dual-Mode Login)
 */
router.post('/web/login', pinAttemptLimiter, authController.loginWeb);

/**
 * @route   POST /auth/setup-password
 * @desc    ตั้งค่ารหัสผ่านใหม่หรือเปลี่ยนรหัสผ่านสำหรับลูกบ้าน
 */
router.post('/setup-password', authenticateJWT, authController.setupPassword);

/**
 * @route   POST /auth/refresh
 * @desc    ขอ Access Token ชุดใหม่โดยใช้อ่าน Refresh Token จาก HTTP-Only Cookie (Token Rotation)
 */
router.post('/refresh', authController.refresh);

/**
 * @route   POST /auth/logout
 * @desc    ออกจากระบบ -> ลบ Refresh Token ใน Database และลบ Cookie ออกจากเบราว์เซอร์
 */
router.post('/logout', authController.logout);

/**
 * @route   GET /auth/me
 * @desc    เรียกดูข้อมูล Profile ของตัวเอง (ต้องผ่าน JWT Access Token Verification)
 */
router.get('/me', authenticateJWT, authController.getProfile);

module.exports = router;
