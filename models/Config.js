// models/Config.js (VERSI FINAL YANG BENAR)

const mongoose = require('mongoose');

// Skema Konfigurasi untuk mendukung Multi-Grup
const configSchema = new mongoose.Schema({
    identifier: {
        type: String,
        default: 'main_config',
        unique: true
    },
    
    // Ini adalah field yang benar untuk menyimpan BANYAK ID grup
    activeGroups: { 
        type: [String], 
        default: [] 
    },
    
    jamKerja: {
        masuk: { type: String, default: '08:00' },
        mulaiIstirahat: { type: String, default: '12:00' },
        selesaiIstirahat: { type: String, default: '13:00' },
        keluar: { type: String, default: '17:00' }
    },

    toleransiKeterlambatan: { type: Number, default: 15 },
    radiusAbsensi: { type: Number, default: 100 },
    
}, { timestamps: true });

module.exports = mongoose.model('Config', configSchema);
