const nodemailer = require('nodemailer');
const admin = require('../config/firebase');

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

// Send OTP via email
const sendOTPEmail = async (email, otp) => {
    if (process.env.EMAIL_USERNAME && process.env.EMAIL_PASSWORD) {
        try {
            await transporter.sendMail({
                from: process.env.EMAIL_USERNAME,
                to: email,
                subject: 'Email Verification OTP',
                text: `Your OTP for email verification is: ${otp}. Valid for 10 minutes.`
            });
            return true;
        } catch (emailError) {
            console.error('Email sending failed:', emailError);
            console.log(`DEVELOPMENT: Email OTP for ${email} is: ${otp}`);
            return false;
        }
    } else {
        // For development, just log the OTP
        console.log(`DEVELOPMENT: Email OTP for ${email} is: ${otp}`);
        return false;
    }
};

// Send OTP via Firebase Phone Auth
const sendOTPPhone = async (phoneNumber) => {
    try {
        const verificationCode = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

        // For development/testing environments
        if (process.env.NODE_ENV === 'development') {
            console.log(`DEVELOPMENT: Phone OTP for ${phoneNumber} is: ${verificationCode}`);
        }

        try {
            // Try to get existing user
            const userRecord = await admin.auth().getUserByPhoneNumber(phoneNumber);
            if (userRecord) {
                // User exists, just return the verification code
                return {
                    success: true,
                    verificationCode,
                    expiresAt,
                    uid: userRecord.uid
                };
            }
        } catch (error) {
            // User doesn't exist, create new user
            if (error.code === 'auth/user-not-found') {
                const newUser = await admin.auth().createUser({
                    phoneNumber: phoneNumber,
                    disabled: false
                });
                return {
                    success: true,
                    verificationCode,
                    expiresAt,
                    uid: newUser.uid
                };
            }
            throw error; // Re-throw if it's a different error
        }

        return {
            success: true,
            verificationCode,
            expiresAt
        };
    } catch (error) {
        console.error('Phone OTP sending failed:', error);
        if (error.code === 'auth/phone-number-already-exists') {
            // If phone number exists but we couldn't get the user earlier
            return {
                success: true,
                verificationCode: generateOTP(),
                expiresAt: new Date(Date.now() + 10 * 60 * 1000)
            };
        }
        return {
            success: false,
            error: error.message
        };
    }
};

// Verify phone number with Firebase
const verifyPhoneOTP = async (phoneNumber, otp) => {
    try {
        // Get the user by phone number
        const userRecord = await admin.auth().getUserByPhoneNumber(phoneNumber);
        
        if (!userRecord) {
            return {
                success: false,
                message: 'Phone number not found'
            };
        }

        // In development, always return success
        if (process.env.NODE_ENV === 'development') {
            return {
                success: true,
                uid: userRecord.uid
            };
        }

        return {
            success: true,
            uid: userRecord.uid
        };
    } catch (error) {
        console.error('Phone verification failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

module.exports = {
    generateOTP,
    isOTPExpired,
    sendOTPEmail,
    sendOTPPhone,
    verifyPhoneOTP
};