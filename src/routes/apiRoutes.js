const express = require('express');
const router = express.Router();
const mainController = require('../controllers/mainController');
const authenticateJWT = require('../middlewares/authMiddleware');

/**
 * ครอบ (Protect) Route ทั้งหมดใน Router นี้ด้วย authMiddleware (JWT Verification)
 * ส่งผลให้ทุก Endpoint ย่อยใน /api บังคับต้องแนบ Bearer Token มาใน Header
 */
router.use(authenticateJWT);

/**
 * @route   GET /api
 * @desc    ดึงข้อมูลภาพรวม API Dashboard (Protected Route)
 * @access  Private (ต้องมี JWT Token)
 */
router.get('/', mainController.getOverview);

/**
 * @route   POST /api
 * @desc    สร้างและประมวลผลข้อมูลใหม่ (Protected Route)
 * @access  Private (ต้องมี JWT Token)
 */
router.post('/', mainController.createData);

module.exports = router;
