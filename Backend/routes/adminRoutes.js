const express = require('express');
const router = express.Router();
const {
  registerAdmin,
  verifyAdminEmail,
  verifyAdminPhone,
  loginAdmin,
  requestAdminOTP,
  getAdminProfile
} = require('../controllers/adminController');
const { adminProtect } = require('../middleware/authMiddleware');

// Public routes
router.post('/register', registerAdmin);
router.post('/verify-email', verifyAdminEmail);
router.post('/verify-phone', verifyAdminPhone);
router.post('/login', loginAdmin);
router.post('/request-otp', requestAdminOTP);

// Protected routes
router.get('/profile', adminProtect, getAdminProfile);

module.exports = router;