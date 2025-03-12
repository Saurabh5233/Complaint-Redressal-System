const Admin = require('../models/Admin');
const jwt = require('jsonwebtoken');
const { generateOTP, isOTPExpired } = require('../utils/otpUtils');
const nodemailer = require('nodemailer');
const admin = require('../config/firebase');

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

// @desc    Register a new admin
// @route   POST /api/admin/register
// @access  Public (can be restricted in production)
const registerAdmin = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Check if admin exists
    const adminExists = await Admin.findOne({ email });

    if (adminExists) {
      return res.status(400).json({ success: false, message: 'Admin already exists' });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create admin
    const newAdmin = await Admin.create({
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
      subject: 'Admin Email Verification OTP',
      text: `Your OTP for admin email verification is: ${otp}. Valid for 10 minutes.`
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

    if (newAdmin) {
      res.status(201).json({
        success: true,
        message: 'Admin registered successfully. Please verify your email/phone.',
        adminId: newAdmin._id
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Verify admin email with OTP
// @route   POST /api/admin/verify-email
// @access  Public
const verifyAdminEmail = async (req, res) => {
  try {
    const { adminId, otp } = req.body;

    const admin = await Admin.findById(adminId);

    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    if (!admin.otp || !admin.otp.code) {
      return res.status(400).json({ success: false, message: 'OTP not generated' });
    }

    if (isOTPExpired(admin.otp.expiresAt)) {
      return res.status(400).json({ success: false, message: 'OTP expired' });
    }

    if (admin.otp.code !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    // Mark email as verified
    admin.emailVerified = true;
    
    // If both email and phone are verified (or only email is required), mark admin as verified
    if (admin.emailVerified && (!admin.phone || admin.phoneVerified)) {
      admin.isVerified = true;
    }
    
    // Clear OTP
    admin.otp = undefined;
    
    await admin.save();

    // Generate token if admin is fully verified
    let token = null;
    if (admin.isVerified) {
      token = generateToken(admin._id);
    }

    res.status(200).json({
      success: true,
      message: 'Admin email verified successfully',
      isVerified: admin.isVerified,
      token: token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Verify admin phone with OTP
// @route   POST /api/admin/verify-phone
// @access  Public
const verifyAdminPhone = async (req, res) => {
  try {
    const { adminId, otp } = req.body;

    const adminUser = await Admin.findById(adminId);

    if (!adminUser) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    if (!adminUser.phone) {
      return res.status(400).json({ success: false, message: 'No phone number associated with this account' });
    }

    if (!adminUser.otp || !adminUser.otp.code) {
      return res.status(400).json({ success: false, message: 'OTP not generated' });
    }

    if (isOTPExpired(adminUser.otp.expiresAt)) {
      return res.status(400).json({ success: false, message: 'OTP expired' });
    }

    if (adminUser.otp.code !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    // Mark phone as verified
    adminUser.phoneVerified = true;
    
    // If both email and phone are verified, mark admin as verified
    if (adminUser.emailVerified && adminUser.phoneVerified) {
      adminUser.isVerified = true;
    }
    
    // Clear OTP
    adminUser.otp = undefined;
    
    await adminUser.save();

    // Generate token if admin is fully verified
    let token = null;
    if (adminUser.isVerified) {
      token = generateToken(adminUser._id);
    }

    res.status(200).json({
      success: true,
      message: 'Admin phone verified successfully',
      isVerified: adminUser.isVerified,
      token: token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Login admin
// @route   POST /api/admin/login
// @access  Public
const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check for admin email
    const adminUser = await Admin.findOne({ email }).select('+password');

    if (!adminUser) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Check if password matches
    const isMatch = await adminUser.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Check if admin is verified
    if (!adminUser.isVerified) {
      // Generate new OTP for verification
      const otp = generateOTP();
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      adminUser.otp = {
        code: otp,
        expiresAt: otpExpiresAt
      };

      await adminUser.save();

      // Send OTP via email
      const mailOptions = {
        from: process.env.EMAIL_USERNAME,
        to: adminUser.email,
        subject: 'Admin Email Verification OTP',
        text: `Your OTP for admin email verification is: ${otp}. Valid for 10 minutes.`
      };

      await transporter.sendMail(mailOptions);

      return res.status(401).json({
        success: false,
        message: 'Admin account not verified. New OTP sent to your email.',
        adminId: adminUser._id
      });
    }

    // Generate JWT
    const token = generateToken(adminUser._id);

    res.status(200).json({
      success: true,
      _id: adminUser._id,
      name: adminUser.name,
      email: adminUser.email,
      phone: adminUser.phone,
      role: adminUser.role,
      isVerified: adminUser.isVerified,
      token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Request new admin OTP
// @route   POST /api/admin/request-otp
// @access  Public
const requestAdminOTP = async (req, res) => {
  try {
    const { email, phone } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ success: false, message: 'Email or phone is required' });
    }

    let adminUser;
    if (email) {
      adminUser = await Admin.findOne({ email });
    } else if (phone) {
      adminUser = await Admin.findOne({ phone });
    }

    if (!adminUser) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    // Generate new OTP
    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    adminUser.otp = {
      code: otp,
      expiresAt: otpExpiresAt
    };

    await adminUser.save();

    // Send OTP based on the provided method
    if (email) {
      // Send OTP via email
      const mailOptions = {
        from: process.env.EMAIL_USERNAME,
        to: email,
        subject: 'Admin Verification OTP',
        text: `Your OTP for admin verification is: ${otp}. Valid for 10 minutes.`
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
      message: 'Admin OTP sent successfully',
      adminId: adminUser._id
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// @desc    Get admin profile
// @route   GET /api/admin/profile
// @access  Private (Admin only)
const getAdminProfile = async (req, res) => {
  try {
    const adminUser = await Admin.findById(req.admin._id);

    if (!adminUser) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    res.status(200).json({
      success: true,
      admin: {
        _id: adminUser._id,
        name: adminUser.name,
        email: adminUser.email,
        phone: adminUser.phone,
        role: adminUser.role,
        emailVerified: adminUser.emailVerified,
        phoneVerified: adminUser.phoneVerified,
        isVerified: adminUser.isVerified,
        createdAt: adminUser.createdAt
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

module.exports = {
  registerAdmin,
  verifyAdminEmail,
  verifyAdminPhone,
  loginAdmin,
  requestAdminOTP,
  getAdminProfile
};
