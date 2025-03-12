/*
const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Body parser middleware
app.use(express.json());

// Define routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// Basic route for testing
app.get('/', (req, res) => {
  res.send('API is running');
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

*/

// server.js
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
app.use(express.json());
app.use(express.urlencoded({extended:true}));

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/auth-app')
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Connection Error:', err));


// Add this code when initializing your app (run it once)
mongoose.connection.once('open', async () => {
    try {
      // Drop the problematic index if it exists
      await mongoose.connection.db.collection('users').dropIndex('mobile_1');
      console.log('Dropped the problematic index');
    } catch (error) {
      // Index might not exist
      console.log('No problematic index found or already dropped');
    }
  });

// User Schema
const UserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String }, // Remove sparse from here
    password: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    otp: {
      code: String,
      expiresAt: Date
    },
    role: { type: String, default: 'user' },
    createdAt: { type: Date, default: Date.now }
  });
  
  // Create proper sparse index
  UserSchema.index({ phone: 1 }, { unique: true, sparse: true });

// Hash password middleware
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Match password method
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Create models
const User = mongoose.model('User', UserSchema);
const Admin = mongoose.model('Admin', UserSchema);

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Generate random 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Check if OTP is expired
const isOTPExpired = (expiresAt) => {
  return new Date() > new Date(expiresAt);
};

// Generate JWT token
const generateToken = (id, role = 'user') => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET || 'secretkey', {
    expiresIn: '30d'
  });
};

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer')) {
      return res.status(401).json({ success: false, message: 'Not authorized, no token' });
    }

    const token = req.headers.authorization.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretkey');
    
    const Model = decoded.role === 'admin' ? Admin : User;
    const user = await Model.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error(error);
    res.status(401).json({ success: false, message: 'Not authorized, token failed' });
  }
};

// Admin middleware
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Not authorized as admin' });
  }
};

// ---- USER ROUTES ----

// Register user
app.post('/api/auth/register', async (req, res) => {
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
    if (process.env.EMAIL_USERNAME && process.env.EMAIL_PASSWORD) {
      try {
        await transporter.sendMail({
          from: process.env.EMAIL_USERNAME,
          to: email,
          subject: 'Email Verification OTP',
          text: `Your OTP for email verification is: ${otp}. Valid for 10 minutes.`
        });
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
        console.log(`DEVELOPMENT: Email OTP for ${email} is: ${otp}`);
      }
    } else {
      // For development, just log the OTP
      console.log(`DEVELOPMENT: Email OTP for ${email} is: ${otp}`);
    }

    // For development, just log the phone OTP
    if (phone) {
      console.log(`DEVELOPMENT: Phone OTP for ${phone} is: ${otp}`);
    }

    res.status(201).json({
      success: true,
      message: 'User registered. OTP sent for verification.',
      userId: user._id,
      // Include OTP in development mode for testing
      ...(process.env.NODE_ENV === 'development' && { devOtp: otp })
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
});

// Verify email OTP
app.post('/api/auth/verify-email', async (req, res) => {
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
    
    // If only email verification is required or both are verified
    if (!user.phone || user.phoneVerified) {
      user.isVerified = true;
    }
    
    // Clear OTP
    user.otp = undefined;
    await user.save();

    // Generate token if fully verified
    const token = user.isVerified ? generateToken(user._id) : null;

    res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      isVerified: user.isVerified,
      token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
});

// Verify phone OTP (same logic as email verification)
app.post('/api/auth/verify-phone', async (req, res) => {
  try {
    const { userId, otp } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.phone) {
      return res.status(400).json({ success: false, message: 'No phone number associated' });
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
    
    // If email is also verified or not required
    if (user.emailVerified) {
      user.isVerified = true;
    }
    
    // Clear OTP
    user.otp = undefined;
    await user.save();

    // Generate token if fully verified
    const token = user.isVerified ? generateToken(user._id) : null;

    res.status(200).json({
      success: true,
      message: 'Phone verified successfully',
      isVerified: user.isVerified,
      token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
});

// Login user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!user.isVerified) {
      // Generate new OTP for verification
      const otp = generateOTP();
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

      user.otp = { code: otp, expiresAt: otpExpiresAt };
      await user.save();

      // Log the OTP in development mode
      console.log(`DEVELOPMENT: New OTP for ${email} is: ${otp}`);

      try {
        await transporter.sendMail({
          from: process.env.EMAIL_USERNAME,
          to: email,
          subject: 'Email Verification OTP',
          text: `Your OTP for email verification is: ${otp}. Valid for 10 minutes.`
        });
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
      }

      return res.status(401).json({
        success: false,
        message: 'Account not verified. New OTP sent.',
        userId: user._id,
        // Include OTP in development mode for testing
        ...(process.env.NODE_ENV === 'development' && { devOtp: otp })
      });
    }

    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      _id: user._id,
      name: user.name,
      email: user.email,
      isVerified: user.isVerified,
      token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
});

// Request new OTP
app.post('/api/auth/request-otp', async (req, res) => {
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
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    user.otp = { code: otp, expiresAt: otpExpiresAt };
    await user.save();

    // Log the OTP in development mode
    console.log(`DEVELOPMENT: New OTP is: ${otp}`);

    if (email) {
      try {
        await transporter.sendMail({
          from: process.env.EMAIL_USERNAME,
          to: email,
          subject: 'Verification OTP',
          text: `Your OTP for verification is: ${otp}. Valid for 10 minutes.`
        });
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
      }
    }

    if (phone) {
      console.log(`DEVELOPMENT: Phone OTP for ${phone} is: ${otp}`);
    }

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      userId: user._id,
      // Include OTP in development mode for testing
      ...(process.env.NODE_ENV === 'development' && { devOtp: otp })
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
});

// Get user profile (protected route)
app.get('/api/auth/profile', authenticate, async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      user: {
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone,
        isVerified: req.user.isVerified,
        emailVerified: req.user.emailVerified,
        phoneVerified: req.user.phoneVerified,
        role: req.user.role,
        createdAt: req.user.createdAt
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
});

// ---- ADMIN ROUTES ----

// Register admin
app.post('/api/admin/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Check if admin exists
    const adminExists = await Admin.findOne({ email });
    if (adminExists) {
      return res.status(400).json({ success: false, message: 'Admin already exists' });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Create admin
    const admin = await Admin.create({
      name,
      email,
      phone,
      password,
      role: 'admin',
      otp: {
        code: otp,
        expiresAt: otpExpiresAt
      }
    });

    // Log the OTP in development mode
    console.log(`DEVELOPMENT: Admin OTP for ${email} is: ${otp}`);

    // Send OTP via email
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USERNAME,
        to: email,
        subject: 'Admin Email Verification OTP',
        text: `Your OTP for admin email verification is: ${otp}. Valid for 10 minutes.`
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
    }

    res.status(201).json({
      success: true,
      message: 'Admin registered. OTP sent for verification.',
      adminId: admin._id,
      // Include OTP in development mode for testing
      ...(process.env.NODE_ENV === 'development' && { devOtp: otp })
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
});

// The remaining admin routes follow the same pattern as user routes
// Verify admin email
app.post('/api/admin/verify-email', async (req, res) => {
  // Similar to user email verification but for Admin model
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
    
    // If only email verification is required or both are verified
    if (!admin.phone || admin.phoneVerified) {
      admin.isVerified = true;
    }
    
    // Clear OTP
    admin.otp = undefined;
    await admin.save();

    // Generate token if fully verified
    const token = admin.isVerified ? generateToken(admin._id, 'admin') : null;

    res.status(200).json({
      success: true,
      message: 'Admin email verified successfully',
      isVerified: admin.isVerified,
      token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
});

// Admin login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email }).select('+password');
    if (!admin || admin.role !== 'admin') {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await admin.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (!admin.isVerified) {
      // Generate new OTP for verification
      const otp = generateOTP();
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

      admin.otp = { code: otp, expiresAt: otpExpiresAt };
      await admin.save();

      // Log the OTP in development mode
      console.log(`DEVELOPMENT: Admin OTP for ${email} is: ${otp}`);

      try {
        await transporter.sendMail({
          from: process.env.EMAIL_USERNAME,
          to: email,
          subject: 'Admin Email Verification OTP',
          text: `Your OTP for admin email verification is: ${otp}. Valid for 10 minutes.`
        });
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
      }

      return res.status(401).json({
        success: false,
        message: 'Admin account not verified. New OTP sent.',
        adminId: admin._id,
        // Include OTP in development mode for testing
        ...(process.env.NODE_ENV === 'development' && { devOtp: otp })
      });
    }

    const token = generateToken(admin._id, 'admin');

    res.status(200).json({
      success: true,
      _id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      isVerified: admin.isVerified,
      token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
});

// Get admin profile
app.get('/api/admin/profile', authenticate, isAdmin, async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      admin: {
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone,
        role: req.user.role,
        isVerified: req.user.isVerified,
        emailVerified: req.user.emailVerified,
        phoneVerified: req.user.phoneVerified,
        createdAt: req.user.createdAt
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on at http://localhost:${PORT}`));