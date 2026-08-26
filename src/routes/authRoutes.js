const express = require('express');
const router = express.Router();
const passport = require('passport');
const authController = require('../controllers/authController');
const authenticateJWT = require('../middlewares/authMiddleware');

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
 * @desc    Google OAuth Callback เมื่อผู้ใช้ยืนยันตัวตนสำเร็จ จะทำการออก JWT Token
 */
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/login', session: false }),
  authController.googleCallback
);

/**
 * @route   POST /auth/login
 * @desc    ทดสอบการเข้าสู่ระบบแบบปกติเพื่อออก JWT Token (Manual Login)
 */
router.post('/login', authController.login);

/**
 * @route   GET /auth/me
 * @desc    เรียกดูข้อมูล Profile ของตัวเอง (ต้องผ่าน JWT Authentication)
 */
router.get('/me', authenticateJWT, authController.getProfile);

module.exports = router;
