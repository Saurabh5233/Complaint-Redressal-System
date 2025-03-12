const User = require('../models/User');
const jwt = require('jsonwebtoken');
const admin = require('../config/firebase');
const { generateOTP, isOTPExpired } = require('../utils/otpUtils');
const nodemailer = require('nodemailer');

// Configure nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ success: false, message: 'User already exists' });
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

    // Send OTP via email
    const mailOptions = {
      from: process.env.EMAIL_USERNAME,
      to: email,
      subject: 'Email Verification OTP',
      text: `Your OTP for email verification is: ${otp}. Valid for 10 minutes.`
    };

    await transporter.sendMail(mailOptions);

    // If phone number is provided, send OTP via SMS using Firebase
    if (phone) {
      try {
        await admin.auth().getUser(phone);
      } catch (error) {
        // User doesn't exist in Firebase, create them
        await admin.auth().createUser({
          phoneNumber: phone
        });
      }

      // Send OTP via SMS
      await admin.auth().sendVerificationCode(phone, {
        code: otp
      });
    }

    if (user) {
      res.status(201).json({
        success: true,
        message: 'User registered successfully. Please verify your email/phone.',
        userId: user._id
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Verify email with OTP
// @route   POST /api/auth/verify-email
// @access  Public
const verifyEmail = async (req, res) => {
  try {
    const { userId, otp } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.otp || !user.otp.code) {
      return res.status(400).json({ success: false, message: 'OTP not generated' });
    }

    if (isOTPExpired(user.otp.expiresAt)) {
      return res.status(400).json({ success: false, message: 'OTP expired' });
    }

    if (user.otp.code !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    // Mark email as verified
    user.emailVerified = true;
    
    // If both email and phone are verified (or only email is required), mark user as verified
    if (user.emailVerified && (!user.phone || user.phoneVerified)) {
      user.isVerified = true;
    }
    
    // Clear OTP
    user.otp = undefined;
    
    await user.save();

    // Generate token if user is fully verified
    let token = null;
    if (user.isVerified) {
      token = generateToken(user._id);
    }

    res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      isVerified: user.isVerified,
      token: token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Verify phone with OTP
// @route   POST /api/auth/verify-phone
// @access  Public
const verifyPhone = async (req, res) => {
  try {
    const { userId, otp } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.phone) {
      return res.status(400).json({ success: false, message: 'No phone number associated with this account' });
    }

    if (!user.otp || !user.otp.code) {
      return res.status(400).json({ success: false, message: 'OTP not generated' });
    }

    if (isOTPExpired(user.otp.expiresAt)) {
      return res.status(400).json({ success: false, message: 'OTP expired' });
    }

    if (user.otp.code !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    // Mark phone as verified
    user.phoneVerified = true;
    
    // If both email and phone are verified, mark user as verified
    if (user.emailVerified && user.phoneVerified) {
      user.isVerified = true;
    }
    
    // Clear OTP
    user.otp = undefined;
    
    await user.save();

    // Generate token if user is fully verified
    let token = null;
    if (user.isVerified) {
      token = generateToken(user._id);
    }

    res.status(200).json({
      success: true,
      message: 'Phone verified successfully',
      isVerified: user.isVerified,
      token: token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check for user email
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Check if user is verified
    if (!user.isVerified) {
      // Generate new OTP for verification
      const otp = generateOTP();
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      user.otp = {
        code: otp,
        expiresAt: otpExpiresAt
      };

      await user.save();

      // Send OTP via email
      const mailOptions = {
        from: process.env.EMAIL_USERNAME,
        to: user.email,
        subject: 'Email Verification OTP',
        text: `Your OTP for email verification is: ${otp}. Valid for 10 minutes.`
      };

      await transporter.sendMail(mailOptions);

      return res.status(401).json({
        success: false,
        message: 'Account not verified. New OTP sent to your email.',
        userId: user._id
      });
    }

    // Generate JWT
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      isVerified: user.isVerified,
      token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Request new OTP
// @route   POST /api/auth/request-otp
// @access  Public
const requestOTP = async (req, res) => {
  try {
    const { email, phone } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ success: false, message: 'Email or phone is required' });
    }

    let user;
    if (email) {
      user = await User.findOne({ email });
    } else if (phone) {
      user = await User.findOne({ phone });
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.otp = {
      code: otp,
      expiresAt: otpExpiresAt
    };

    await user.save();

    // Send OTP based on the provided method
    if (email) {
      // Send OTP via email
      const mailOptions = {
        from: process.env.EMAIL_USERNAME,
        to: email,
        subject: 'Verification OTP',
        text: `Your OTP for verification is: ${otp}. Valid for 10 minutes.`
      };

      await transporter.sendMail(mailOptions);
    }

    if (phone) {
      // Send OTP via SMS using Firebase
      try {
        await admin.auth().getUser(phone);
      } catch (error) {
        // User doesn't exist in Firebase, create them
        await admin.auth().createUser({
          phoneNumber: phone
        });
      }

      // Send OTP via SMS
      await admin.auth().sendVerificationCode(phone, {
        code: otp
      });
    }

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      userId: user._id
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        isVerified: user.isVerified,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

module.exports = {
  registerUser,
  verifyEmail,
  verifyPhone,
  loginUser,
  requestOTP,
  getUserProfile
};
