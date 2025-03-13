const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Generate JWT Token
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d'
    });
};

// Authenticate user
const authenticate = async (req, res, next) => {
    try {
        let token;

        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({ success: false, message: 'Not authorized' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error(error);
        res.status(401).json({ success: false, message: 'Not authorized' });
    }
};

// Check if user is admin
const isAdmin = async (req, res, next) => {
    try {
        if (req.user.__type !== 'Admin') {
            return res.status(403).json({ success: false, message: 'Not authorized as admin' });
        }
        next();
    } catch (error) {
        console.error(error);
        res.status(403).json({ success: false, message: 'Not authorized as admin' });
    }
};

module.exports = {
    generateToken,
    authenticate,
    isAdmin
};