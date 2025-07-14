const mongoose = require('mongoose');

const absensiSchema = new mongoose.Schema({
    karyawan: { type: mongoose.Schema.Types.ObjectId, ref: 'Karyawan', required: true },
    nomorHp: { type: String, required: true },
    tanggal: { type: Date, required: true },
    jam: { type: String, required: true }, // Jam Masuk
    posJaga: { type: String, required: true },
    shift: { type: String, required: true },
    status: { type: String, enum: ['hadir', 'izin', 'alpha', 'pulang'], required: true },
    keterangan: { type: String },
    lokasi: { type: String },
    buktiFoto: { type: String }, // Bukti Foto Masuk

    // --- TAMBAHKAN DUA FIELD INI ---
    jamPulang: { type: String },
    buktiFotoPulang: { type: String },
    // --------------------------------

}, { timestamps: true });

module.exports = mongoose.model('Absensi', absensiSchema);
