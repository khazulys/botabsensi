const mongoose = require('mongoose');

// Skema Konfigurasi yang Diperbarui
const configSchema = new mongoose.Schema({
    identifier: {
        type: String,
        default: 'main_config',
        unique: true
    },
    
    // Objek jam kerja baru menggantikan sistem shift
    jamKerja: {
        masuk: { type: String, default: '08:00' },
        mulaiIstirahat: { type: String, default: '12:00' },
        selesaiIstirahat: { type: String, default: '13:00' },
        keluar: { type: String, default: '17:00' }
    },

    toleransiKeterlambatan: { type: Number, default: 15 },
    radiusAbsensi: { type: Number, default: 100 },
    
    // Field ini tetap dipertahankan
    grupAbsensiId: { type: String, default: null }

}, { timestamps: true });

module.exports = mongoose.model('Config', configSchema);
