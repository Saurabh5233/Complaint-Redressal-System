const express = require('express');
const router = express.Router();
const { userLogin } = require('../Controller/authController');

router.post('/send-otp', userLogin);


module.exports = router;