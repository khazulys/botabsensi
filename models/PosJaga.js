// models/PosJaga.js
const mongoose = require('mongoose');

const posJagaSchema = new mongoose.Schema({
    namaPos: {
        type: String,
        required: true,
        unique: true
    },
    lokasiPos: {
        type: String,
        required: true
    },
    statusPos: {
        type: String,
        required: true,
        enum: ['aktif', 'tidak aktif'],
        default: 'aktif'
    }
}, { timestamps: true });

module.exports = mongoose.model('PosJaga', posJagaSchema);
