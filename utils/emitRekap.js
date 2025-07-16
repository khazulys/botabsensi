// utils/emitRekap.js
const Absensi = require('../models/Absensi');
const Karyawan = require('../models/Karyawan');
const moment = require('moment-timezone');

async function emitRekapHariIni(io) {
    try {
        const todayStart = moment().tz('Asia/Makassar').startOf('day').toDate();
        const todayEnd = moment().tz('Asia/Makassar').endOf('day').toDate();

        const [hadir, pulang, izin, alpha, totalKaryawan] = await Promise.all([
            Absensi.countDocuments({ tanggal: { $gte: todayStart, $lte: todayEnd }, status: 'hadir' }),
            Absensi.countDocuments({ tanggal: { $gte: todayStart, $lte: todayEnd }, status: 'pulang' }),
            Absensi.countDocuments({ tanggal: { $gte: todayStart, $lte: todayEnd }, status: 'izin' }),
            Absensi.countDocuments({ tanggal: { $gte: todayStart, $lte: todayEnd }, status: 'alpha' }),
            Karyawan.countDocuments()
        ]);

        const rekap = { hadir, pulang, izin, alpha, total: totalKaryawan };

        io.emit('update_rekap', rekap); // Broadcast ke semua klien
        return rekap;
    } catch (err) {
        console.error('❌ Gagal emit rekap hari ini:', err);
    }
}

module.exports = emitRekapHariIni;