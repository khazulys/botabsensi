const mongoose = require('mongoose');

const karyawanSchema = new mongoose.Schema({
    nama: {
        type: String,
        required: true
    },
    nomorWa: {
        type: String,
        required: true,
        unique: true // agar tidak duplikat
    },
    pos: {
        type: String,
        required: true
    },
    shift: {
        type: String,
        required: true,
        enum: ['pagi', 'siang', 'malam']
    },
    status: {
        type: String,
        required: true,
        enum: ['aktif', 'tidak aktif'],
        default: 'aktif'
    }
}, { timestamps: true });

// Tambahkan index unik (opsional, redundant tapi aman)
karyawanSchema.index({ nomorWa: 1 }, { unique: true });

module.exports = mongoose.model('Karyawan', karyawanSchema);