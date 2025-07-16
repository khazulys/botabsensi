const mongoose = require('mongoose');

const karyawanSchema = new mongoose.Schema({
    nama: {
        type: String,
        required: true
    },
    nomorWa: {
        type: String,
        required: true,
        unique: true 
    },
    pos: {
        type: String,
        required: true
    },
    // Field 'shift' dihapus karena sudah tidak relevan
    status: {
        type: String,
        required: true,
        enum: ['aktif', 'tidak aktif'],
        default: 'aktif'
    }
}, { timestamps: true });

// Index untuk memastikan nomor WhatsApp selalu unik
karyawanSchema.index({ nomorWa: 1 }, { unique: true });

module.exports = mongoose.model('Karyawan', karyawanSchema);
