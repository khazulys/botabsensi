// utils/db.js
const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    try {
        if (mongoose.connection.readyState >= 1) {
            return; // Jika sudah terhubung, tidak perlu koneksi ulang
        }
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected via db.js...');
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
};

module.exports = connectDB;
