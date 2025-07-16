const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = () => {
    // Opsi untuk koneksi yang lebih modern dan stabil
    const options = {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000, // Timeout setelah 5 detik jika server tidak ditemukan
        socketTimeoutMS: 45000,      // Tutup koneksi setelah 45 detik tidak aktif
    };

    const connectWithRetry = () => {
        console.log('Mencoba terhubung ke MongoDB...');
        // Gunakan MONGO_URI dari file .env Anda
        mongoose.connect(process.env.MONGO_URI, options)
            .then(() => {
                // Koneksi awal berhasil, tidak perlu log di sini
            })
            .catch(err => {
                console.error(`❌ Gagal terhubung ke MongoDB: ${err.name}. Mencoba lagi dalam 5 detik...`);
                // Tunggu 5 detik sebelum mencoba lagi
                setTimeout(connectWithRetry, 5000);
            });
    };

    // Panggil fungsi untuk memulai koneksi
    connectWithRetry();

    // Event listener untuk memantau status koneksi
    mongoose.connection.on('connected', () => {
        console.log('✅ Berhasil terhubung ke database MongoDB.');
    });

    mongoose.connection.on('error', err => {
        console.error('❌ Terjadi error pada koneksi MongoDB:', err);
    });

    mongoose.connection.on('disconnected', () => {
        console.warn('🔌 Koneksi MongoDB terputus. Mongoose akan mencoba menghubungkan kembali secara otomatis...');
    });
};

module.exports = connectDB;
