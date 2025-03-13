const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { generateOTP, isOTPExpired, sendOTPEmail, sendOTPPhone, verifyPhoneOTP } = require('../utils/otpUtils');
const { generateToken, authenticate } = require('../middleware/authMiddleware');

// Register user
router.post('/register', async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;

        // Check if user exists with email or phone
        const userExists = await User.findOne({ 
            $or: [
                { email },
                { phone }
            ]
        });

        if (userExists) {
            return res.status(400).json({ 
                success: false, 
                message: userExists.email === email ? 
                    'User with this email already exists' : 
                    'User with this phone number already exists'
            });
        }

        // Generate OTP
        const otp = generateOTP();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Create user
        const user = await User.create({
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
            message: 'User registered successfully. Please verify your email and phone.',
            userId: user._id,
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
                message: `A user with this ${field} already exists`
            });
        }
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});

// Login user
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Log the email for debugging
        console.log('Login attempt for email:', email);

        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            console.log('No user found with email:', email);
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        console.log('User found:', user._id);
        const isMatch = await user.matchPassword(password);
        console.log('Password match:', isMatch);

        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const token = generateToken(user._id);

        res.json({
            success: true,
            token,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                emailVerified: user.emailVerified,
                phoneVerified: user.phoneVerified,
                isVerified: user.isVerified
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});

// Verify email OTP
router.post('/verify-email', async (req, res) => {
    try {
        const { userId, otp } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (!user.otp || !user.otp.code || isOTPExpired(user.otp.expiresAt)) {
            return res.status(400).json({ success: false, message: 'OTP expired or invalid' });
        }

        if (user.otp.code !== otp) {
            return res.status(400).json({ success: false, message: 'Invalid OTP' });
        }

        user.emailVerified = true;
        user.otp = undefined;
        
        // Check if both email and phone are verified
        if (user.phoneVerified) {
            user.isVerified = true;
        }
        
        await user.save();

        res.json({
            success: true,
            message: 'Email verified successfully'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});

// Verify phone OTP
router.post('/verify-phone', async (req, res) => {
    try {
        const { userId, otp } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const verificationResult = await verifyPhoneOTP(user.phone, otp);
        if (!verificationResult.success) {
            return res.status(400).json({ 
                success: false, 
                message: verificationResult.message || 'Invalid OTP'
            });
        }

        user.phoneVerified = true;
        
        // Check if both email and phone are verified
        if (user.emailVerified) {
            user.isVerified = true;
        }
        
        await user.save();

        res.json({
            success: true,
            message: 'Phone verified successfully'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});

// Resend email OTP
router.post('/resend-email-otp', async (req, res) => {
    try {
        const { userId } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const otp = generateOTP();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        user.otp = {
            code: otp,
            expiresAt: otpExpiresAt
        };
        await user.save();

        // Send OTP via email
        await sendOTPEmail(user.email, otp);

        res.json({
            success: true,
            message: 'OTP sent successfully',
            ...(process.env.NODE_ENV === 'development' && { devOtp: otp })
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});

// Resend phone OTP
router.post('/resend-phone-otp', async (req, res) => {
    try {
        const { userId } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const phoneVerification = await sendOTPPhone(user.phone);

        res.json({
            success: true,
            message: 'OTP sent successfully',
            ...(process.env.NODE_ENV === 'development' && { devOtp: phoneVerification?.verificationCode })
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});

// Get user profile
router.get('/profile', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({
            success: true,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                emailVerified: user.emailVerified,
                phoneVerified: user.phoneVerified,
                isVerified: user.isVerified
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server Error', error: error.message });
    }
});

module.exports = router;