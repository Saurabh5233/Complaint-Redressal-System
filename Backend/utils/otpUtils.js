// The sendOtpViaSms function to abstract Firebase phone verification
// Add this to utils/otpUtils.js

const admin = require('../config/firebase');

const sendOtpViaSms = async (phone, otp) => {
  try {
    if (!phone) return false;
    
    try {
      await admin.auth().getUser(phone);
    } catch (error) {
      // User doesn't exist in Firebase, create them
      try {
        await admin.auth().createUser({
          phoneNumber: phone
        });
      } catch (createError) {
        console.log('Unable to create Firebase user:', createError.message);
      }
    }

    // Try to send OTP via SMS
    try {
      await admin.auth().sendVerificationCode(phone, {
        code: otp
      });
      return true;
    } catch (smsError) {
      console.log('Unable to send SMS, but continuing:', smsError.message);
      // For development, just log the OTP
      console.log(`DEVELOPMENT: SMS OTP for ${phone} is: ${otp}`);
      return false;
    }
  } catch (error) {
    console.error('SMS sending error:', error);
    // For development, just log the OTP
    console.log(`DEVELOPMENT: SMS OTP for ${phone} is: ${otp}`);
    return false;
  }
};

// Now update your generateOTP function in utils/otpUtils.js to export this
module.exports = {
  generateOTP,
  isOTPExpired,
  sendOtpViaSms
};