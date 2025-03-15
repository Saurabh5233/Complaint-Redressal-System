const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // console.log('Attempting to connect to MongoDB...');
        // console.log('MongoDB URI:', process.env.MONGO_URI || 'mongodb://localhost:27017/auth-app');
        
        const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/auth-app');
        console.log('MongoDB Connected');

        // Drop the problematic index if it exists (run once)
        try {
            await mongoose.connection.db.collection('users').dropIndex('mobile_1');
            console.log('Dropped the problematic index');
        } catch (error) {
            // Index might not exist
            console.log('No problematic index found or already dropped');
        }

        return conn;
    } catch (error) {
        console.error('MongoDB Connection Error:', error);
        process.exit(1);
    }
};

module.exports = connectDB;