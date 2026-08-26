const express = require('express');
const router = express.Router();
const passport = require('passport');
const authController = require('../controllers/authController');
const authenticateJWT = require('../middlewares/authMiddleware');
const validate = require('../middlewares/validateMiddleware');
const { loginSchema } = require('../validators/authValidator');

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
