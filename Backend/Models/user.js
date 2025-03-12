const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    
    mobile:{
        type:String, 
        required:true, 
        unique:true,
    },
    name:{
        type:String, 
        required: true, 
    },      
    otp:{
        type:String,
    }, 
    otpExpires:{
        type:Date 
    },
    isVerified:{
        type:Boolean, 
        default:false,
    }
}, {timestamps:true});

const User = mongoose.model("users", userSchema);
module.exports = User;