const express = require("express");
// const router = express.Router();
const User = require("../Models/user");
const crypto = require("crypto");
const twilio = require("twilio");
require("dotenv").config();
//initialize twilio client....
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);


const userLogin = async (req, res) => {
    const { mobile, name } = req.body;

    // console.log(req.body);
    // res.send(req.body);
    if (!mobile) return res.status(400).json({ message: "Mobile number is required" });
  
    try {
      let user = await User.findOne({ mobile });
  
      if (!user) {
        user = new User({ mobile, name });
        user = await user.save(); // Save new user
      }
  
      // Generate OTP
      const otp = crypto.randomInt(100000, 999999).toString();
      user.otp = otp;
      user.otpExpires = Date.now() + 5 * 60 * 1000; // 5 min expiry
  
      await user.save();
  
      // Send OTP via Twilio
      await client.messages.create({
        body: `Your OTP for registration for Complaint Redressal is ${otp}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: mobile
      });
  
      res.status(200).json({ message: "OTP sent successfully" });
  
    } catch (error) {
      console.error("Twilio Error:", error);
      res.status(500).json({ message: "Error sending OTP", error });
    }
  };
  
  module.exports = { userLogin };