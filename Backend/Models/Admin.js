// const mongoose = require('mongoose');
// const bcrypt = require('bcryptjs');

// const AdminSchema = new mongoose.Schema({
//   name: {
//     type: String,
//     required: [true, 'Please provide a name']
//   },
//   email: {
//     type: String,
//     required: [true, 'Please provide an email'],
//     unique: true,
//     match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
//   },
//   phone: {
//     type: String,
//     unique: true,
//     sparse: true
//   },
//   password: {
//     type: String,
//     required: [true, 'Please provide a password'],
//     minlength: 6,
//     select: false
//   },
//   isVerified: {
//     type: Boolean,
//     default: false
//   },
//   emailVerified: {
//     type: Boolean,
//     default: false
//   },
//   phoneVerified: {
//     type: Boolean,
//     default: false
//   },
//   role: {
//     type: String,
//     default: 'admin'
//   },
//   otp: {
//     code: String,
//     expiresAt: Date
//   },
//   createdAt: {
//     type: Date,
//     default: Date.now
//   }
// });

// // Hash password before saving
// AdminSchema.pre('save', async function(next) {
//   if (!this.isModified('password')) {
//     next();
//   }
  
//   const salt = await bcrypt.genSalt(10);
//   this.password = await bcrypt.hash(this.password, salt);
// });

// // Check if password matches
// AdminSchema.methods.matchPassword = async function(enteredPassword) {
//   return await bcrypt.compare(enteredPassword, this.password);
// };

// module.exports = mongoose.model('Admin', AdminSchema);
