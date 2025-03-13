const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const { generateOTP, isOTPExpired, sendOTPEmail, sendOTPPhone } = require('../utils/otpUtils');
const { generateToken, authenticate, isAdmin } = require('../middleware/authMiddleware');

// Register admin
router.post('/register', async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;

        // Check if admin exists with email or phone
        const adminExists = await Admin.findOne({ $or: [{ email }, { phone }] });
        
        if (adminExists) {
            return res.status(400).json({ 
                success: false, 
                message: adminExists.email === email ? 
                    'Admin with this email already exists' : 
                    'Admin with this phone number already exists'
            });
        }

        // Generate OTP
        const otp = generateOTP();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Create admin
        const admin = await Admin.create({
            name,
            email,
            phone,
            password,
            otp: {
                code: otp,
                expiresAt: otpExpiresAt
            }
        });

        // Send OTP via email and phone
        await sendOTPEmail(email, otp);
        const phoneVerification = await sendOTPPhone(phone);

        res.status(201).json({
            success: true,
            message: 'Admin registered. Please verify your email and phone.',
            adminId: admin._id,
            ...(process.env.NODE_ENV === 'development' && { 
                devOtp: otp,
                devPhoneOtp: phoneVerification?.verificationCode
            })
        });
    } catch (error) {
        console.error(error);
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({ 
                success: false, 
                message: `An admin with this ${field} already exists`
            });
        }
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});

// Admin login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const admin = await Admin.findOne({ email }).select('+password');
        if (!admin) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const isMatch = await admin.matchPassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        // Generate and save OTP
        const loginOtp = generateOTP();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

        admin.loginOtp = { code: loginOtp, expiresAt: otpExpiresAt };
        await admin.save();

        // Send OTP via email and phone
        await sendOTPEmail(admin.email, loginOtp);
        const phoneVerification = await sendOTPPhone(admin.phone);

        res.json({
            success: true,
            message: 'Credentials verified. Please verify OTP to complete login.',
            adminId: admin._id,
            ...(process.env.NODE_ENV === 'development' && { 
                devOtp: loginOtp,
                devPhoneOtp: phoneVerification?.verificationCode
            })
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});

// Verify login OTP
router.post('/verify-login-otp', async (req, res) => {
    try {
        const { adminId, otp } = req.body;

        const admin = await Admin.findById(adminId);
        if (!admin) {
            return res.status(404).json({ success: false, message: 'Admin not found' });
        }

        // Log OTP details for debugging
        console.log('Admin LoginOTP:', admin.loginOtp);
        console.log('Received OTP:', otp);
        console.log('OTP Expiry:', admin.loginOtp?.expiresAt);
        console.log('Current Time:', new Date());

        if (!admin.loginOtp || !admin.loginOtp.code) {
            return res.status(400).json({ success: false, message: 'No OTP found. Please request a new one.' });
        }

        if (new Date(admin.loginOtp.expiresAt) < new Date()) {
            return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
        }

        if (admin.loginOtp.code !== otp) {
            return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }

        admin.loginOtp = undefined;
        await admin.save();

        const token = generateToken(admin._id);

        res.json({
            success: true,
            message: 'Login successful',
            token,
            admin: {
                _id: admin._id,
                name: admin.name,
                email: admin.email,
                phone: admin.phone
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});

// Resend login OTP
router.post('/resend-login-otp', async (req, res) => {
    try {
        const { adminId } = req.body;

        const admin = await Admin.findById(adminId);
        if (!admin) {
            return res.status(404).json({ success: false, message: 'Admin not found' });
        }

        // Generate new OTP
        const loginOtp = generateOTP();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

        admin.loginOtp = { code: loginOtp, expiresAt: otpExpiresAt };
        await admin.save();

        // Send OTP via email and phone
        await sendOTPEmail(admin.email, loginOtp);
        const phoneVerification = await sendOTPPhone(admin.phone);

        res.json({
            success: true,
            message: 'OTP resent successfully',
            ...(process.env.NODE_ENV === 'development' && { 
                devOtp: loginOtp,
                devPhoneOtp: phoneVerification?.verificationCode
            })
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});

// Get admin profile
router.get('/profile', authenticate, isAdmin, async (req, res) => {
    try {
        res.json({
            success: true,
            admin: req.user
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});

module.exports = router;
