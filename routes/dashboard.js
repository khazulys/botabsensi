const express = require('express');
const router = express.Router();
const Absensi = require('../models/Absensi');
const Karyawan = require('../models/Karyawan');
const moment = require('moment-timezone');
const { getIO } = require('../utils/socket'); // Pastikan sudah diimpor
const emitRekapHariIni = require('../utils/emitRekap');
const io = getIO();

router.get('/rekap-hari-ini', async (req, res) => {
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

        const rekap = {
            hadir,
            pulang,
            izin,
            alpha,
            total: totalKaryawan
        };

        // 🔥 Emit realtime ke semua client yang terhubung
        await emitRekapHariIni(io); // emit + return rekap
        res.json(rekap);
        
    } catch (err) {
        console.error('❌ Error rekap:', err);
        res.status(500).json({ message: 'Gagal mengambil data rekap' });
    }
});

router.get('/grafik-kehadiran', async (req, res) => {
    try {
        const hariTerakhir = 5; // tampilkan 5 hari terakhir
        const hasil = await Absensi.aggregate([
            {
                $match: {
                    status: 'hadir',
                    tanggal: {
                        $gte: new Date(new Date().setDate(new Date().getDate() - hariTerakhir))
                    }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: "%d %b", date: "$tanggal" }
                    },
                    totalHadir: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const labels = hasil.map(item => item._id);
        const data = hasil.map(item => item.totalHadir);

        res.json({ labels, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Gagal mengambil data grafik" });
    }
});

module.exports = router;