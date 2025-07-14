const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema({
    aktif: { type: Boolean, default: true },
    jamMasuk: { type: String, required: true },
    jamKeluar: { type: String, required: true }
}, { _id: false });

const configSchema = new mongoose.Schema({
    identifier: {
        type: String,
        default: 'main_config',
        unique: true
    },
    shiftPagi: shiftSchema,
    shiftSiang: shiftSchema,
    shiftMalam: shiftSchema,
    toleransiKeterlambatan: { type: Number, default: 15 },
    radiusAbsensi: { type: Number, default: 100 },
    
    // Field baru untuk menyimpan ID grup
    grupAbsensiId: { type: String, default: null }

}, { timestamps: true });

module.exports = mongoose.model('Config', configSchema);
