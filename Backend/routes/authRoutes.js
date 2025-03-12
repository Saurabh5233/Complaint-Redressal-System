const express = require('express');
const router = express.Router();
const {
  registerUser,
  verifyEmail,
  verifyPhone,
  loginUser,
  requestOTP,
  getUserProfile
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Public routes
router.post('/register', registerUser);
router.post('/verify-email', verifyEmail);
router.post('/verify-phone', verifyPhone);
router.post('/login', loginUser);
router.post('/request-otp', requestOTP);

// Protected routes
router.get('/profile', protect, getUserProfile);

module.exports = router;
