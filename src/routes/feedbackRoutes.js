const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');
const authService = require('../services/authService');
const requireRole = require('../middlewares/roleMiddleware');

/**
 * Optional Auth Middleware: ถ้ามี Bearer Token ให้ Decode หา req.user
 * แต่ถ้าไม่มี ก็ยังอนุญาตให้ Request ผ่านไปได้ (req.user = null)
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = authService.verifyAccessToken(token);
      req.user = decoded;
    }
  } catch {
    // Ignore invalid token in optional auth
  }
  next();
};

const authenticateJWT = require('../middlewares/authMiddleware');

// 1. Submit Feedback (Client / LIFF / Web / Admin)
router.post('/feedback', optionalAuth, (req, res, next) => feedbackController.submitFeedback(req, res, next));
router.post('/v1/feedback', optionalAuth, (req, res, next) => feedbackController.submitFeedback(req, res, next));

// 2. Admin Feedback Management
router.get(
  '/admin/feedbacks',
  authenticateJWT,
  requireRole('OWNER', 'MANAGER', 'super_admin', 'superadmin', 'admin'),
  (req, res, next) => feedbackController.getFeedbacks(req, res, next)
);

router.patch(
  '/admin/feedbacks/:id/status',
  authenticateJWT,
  requireRole('OWNER', 'MANAGER', 'super_admin', 'superadmin', 'admin'),
  (req, res, next) => feedbackController.updateFeedbackStatus(req, res, next)
);

router.delete(
  '/admin/feedbacks/:id',
  authenticateJWT,
  requireRole('OWNER', 'MANAGER', 'super_admin', 'superadmin', 'admin'),
  (req, res, next) => feedbackController.deleteFeedback(req, res, next)
);

module.exports = router;
