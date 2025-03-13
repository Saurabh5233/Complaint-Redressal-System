// const mongoose = require('mongoose');
// const User = require('./User');
// const bcrypt = require('bcryptjs');

// const AdminSchema = new mongoose.Schema({
//     loginOtp: {
//         code: String,
//         expiresAt: Date
//     }
// });

// // Set admin type
// AdminSchema.pre('save', function(next) {
//     this.__type = 'Admin';
//     next();
// });

// const Admin = User.discriminator('Admin', AdminSchema);

// ------------|||----------





const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const AdminSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        sparse: true
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false
    },
    role: {
        type: String,
        enum: ['admin'],
        default: 'admin'
    },
    emailVerified: {
        type: Boolean,
        default: false
    },
    phoneVerified: {
        type: Boolean,
        default: false
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    otp: {
        code: String,
        expiresAt: Date
    },
    loginOtp: {
        code: String,
        expiresAt: Date
    }
}, {
    timestamps: true,
});

// Hash password before saving
AdminSchema.pre('save', async function(next) {
    if (!this.isModified('password')) {
        next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Match password
AdminSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Create unique index for email
AdminSchema.index({ 
    email: 1
}, { 
    unique: true
});

// Create unique index for phone
AdminSchema.index({ 
    phone: 1
}, { 
    unique: true,
    sparse: true
});

module.exports = mongoose.model('Admin', AdminSchema);
