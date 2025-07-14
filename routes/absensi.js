// routes/absensi.js (REVISI FINAL)

const express = require('express');
const router = express.Router();
const Absensi = require('../models/Absensi');
const Karyawan = require('../models/Karyawan');
const PosJaga = require('../models/PosJaga');
const Config = require('../models/Config');
const { getDistance } = require('../utils/distance');
const ExcelJS = require('exceljs');
const { getIO } = require('../utils/socket'); // Impor getIO
const emitRekapHariIni = require('../utils/emitRekap');
const emitGrafik = require('../utils/emitGrafik');
// ...
// Dapatkan instance Socket.IO di luar handler rute untuk menghindari pemanggilan berulang
const io = getIO(); 

// POST /api/absensi/hadir
router.post('/hadir', async (req, res) => {
    const { nomorHp, lat, lon } = req.body;
    
    try {
        const karyawan = await Karyawan.findOne({ nomorWa: nomorHp });
        if (!karyawan) return res.status(404).json({ message: 'Karyawan tidak terdaftar.' });

        const posJaga = await PosJaga.findOne({ namaPos: karyawan.pos });
        if (!posJaga || !posJaga.koordinat) return res.status(404).json({ message: 'Pos jaga tidak ditemukan atau tidak memiliki koordinat.' });

        const config = await Config.findOne({ identifier: 'main_config' });
        if (!config) return res.status(404).json({ message: 'Konfigurasi sistem tidak ditemukan.' });

        const shiftKaryawan = config[`shift${karyawan.shift.charAt(0).toUpperCase() + karyawan.shift.slice(1)}`];
        const [jamMasuk, menitMasuk] = shiftKaryawan.jamMasuk.split(':').map(Number);
        
        const waktuSekarang = new Date();
        const waktuMulaiAbsen = new Date();
        waktuMulaiAbsen.setHours(jamMasuk, menitMasuk - 30, 0); // 30 menit sebelum jam masuk
        
        const waktuSelesaiAbsen = new Date();
        waktuSelesaiAbsen.setHours(jamMasuk, menitMasuk + 30, 0); // 30 menit setelah jam masuk

        if (waktuSekarang < waktuMulaiAbsen || waktuSekarang > waktuSelesaiAbsen) {
            return res.status(400).json({ message: `Absensi Gagal. Anda hanya bisa absen antara jam ${waktuMulaiAbsen.toLocaleTimeString('id-ID')} - ${waktuSelesaiAbsen.toLocaleTimeString('id-ID')}.` });
        }

        const jarak = getDistance(
            { lat: posJaga.koordinat.lat, lon: posJaga.koordinat.lon },
            { lat, lon }
        );

        if (jarak > config.radiusAbsensi) {
            return res.status(400).json({ message: `Absensi Gagal. Anda berada ${Math.round(jarak)} meter dari pos. Radius yang diizinkan adalah ${config.radiusAbsensi} meter.` });
        }

        const absensiBaru = new Absensi({
            karyawan: karyawan._id,
            nomorHp: karyawan.nomorWa,
            tanggal: waktuSekarang,
            jam: waktuSekarang.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
            posJaga: karyawan.pos,
            shift: karyawan.shift,
            status: 'hadir',
            keterangan: `Tepat waktu (jarak ${Math.round(jarak)}m)`,
            lokasi: `(${lat}, ${lon})`
        });

        await absensiBaru.save();

        // Tambahkan ini:
        await emitRekapHariIni(io);
        await emitGrafik(io);

        // --- PENTING: Lakukan populate sebelum di-emit untuk client-side ---
        // Pastikan objek absensi yang dikirim ke client memiliki data karyawan yang lengkap
        const populatedAbsensi = await Absensi.findById(absensiBaru._id)
                                             .populate('karyawan', 'nama'); // Hanya ambil field 'nama' dari karyawan
        
        // --- Emit event 'absensi_baru' ke semua klien yang terhubung ---
        io.emit('absensi_baru', populatedAbsensi); 

        res.status(201).json({ message: `Absensi HADIR untuk ${karyawan.nama} berhasil dicatat.` });

    } catch (err) {
        console.error("Error saat mencatat absensi kehadiran:", err); // Log error lebih spesifik
        res.status(500).json({ message: 'Terjadi kesalahan di server.' });
    }
});

// GET /api/absensi
router.get('/', async (req, res) => {
    const moment = require('moment'); // pastikan momentjs tersedia
    try {
        const { startDate, endDate, shift, pos, status, search } = req.query;
        let query = {};

        // ===========================================
        // ⛔ CEK DAN INSERT DATA ALPHA OTOMATIS DI SINI
        // ===========================================
        const config = await Config.findOne({ identifier: 'main_config' });
        const semuaKaryawan = await Karyawan.find();
        const hariIni = moment().startOf('day');
        const sekarang = moment();

        for (const karyawan of semuaKaryawan) {
            // Lewati jika sudah absen hadir/izin hari ini
            const sudahAbsen = await Absensi.findOne({
                karyawan: karyawan._id,
                tanggal: {
                    $gte: hariIni.toDate(),
                    $lte: moment(hariIni).endOf('day').toDate()
                },
                status: { $in: ['hadir', 'izin', 'alpha'] } // <- tambahkan pengecekan alpha agar tidak dobel
            });

            if (sudahAbsen) continue;

            const shift = karyawan.shift?.toLowerCase();
            let jamMasuk = null;

            if (shift === 'pagi') jamMasuk = config.shiftPagi?.jamMasuk;
            else if (shift === 'siang') jamMasuk = config.shiftSiang?.jamMasuk;
            else if (shift === 'malam') jamMasuk = config.shiftMalam?.jamMasuk;
            else continue;

            if (!jamMasuk) continue;

            const toleransi = config.toleransiKeterlambatan || 30;
            const batasAlpha = moment(`${hariIni.format('YYYY-MM-DD')} ${jamMasuk}`, 'YYYY-MM-DD HH:mm')
                                .add(toleransi, 'minutes');

            if (sekarang.isAfter(batasAlpha)) {
                await Absensi.create({
                    karyawan: karyawan._id,
                    nomorHp: karyawan.nomorWa,
                    tanggal: hariIni.toDate(),
                    jam: '-', // tidak absen
                    posJaga: karyawan.pos,
                    shift: karyawan.shift,
                    status: 'alpha',
                    keterangan: 'Tidak absen hingga batas waktu',
                    lokasi: null
                });
            }
        }

        // ===========================================
        // Filter query berdasarkan parameter
        // ===========================================
        if (startDate && endDate) {
            query.tanggal = { 
                $gte: new Date(startDate), 
                $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)) 
            };
        }
        if (shift) query.shift = shift;
        if (pos) query.posJaga = pos;
        if (status) query.status = status;

        let absensiQuery = Absensi.find(query)
                                  .populate('karyawan', 'nama')
                                  .sort({ tanggal: -1, jam: -1 });

        let results = await absensiQuery.exec();

        if (search) {
            results = results.filter(item => 
                (item.karyawan && item.karyawan.nama.toLowerCase().includes(search.toLowerCase())) ||
                item.nomorHp.includes(search)
            );
        }

        res.json(results);

    } catch (err) {
        console.error("❌ Error saat mengambil data absensi:", err);
        res.status(500).json({ message: 'Gagal mengambil data absensi.', error: err.message });
    }
});

// GET /api/absensi/export
router.get('/export', async (req, res) => {
    try {
        // Ambil semua data absensi dengan populate karyawan
        const absensiData = await Absensi.find({}).populate('karyawan', 'nama').sort({ tanggal: -1, jam: -1 });

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Data Absensi');

        // Definisi kolom untuk Excel
        worksheet.columns = [
            { header: 'Nama', key: 'nama', width: 30 },
            { header: 'Nomor HP', key: 'nomorHp', width: 20 },
            { header: 'Tanggal', key: 'tanggal', width: 15 },
            { header: 'Jam', key: 'jam', width: 10 },
            { header: 'Pos Jaga', key: 'posJaga', width: 15 },
            { header: 'Shift', key: 'shift', width: 15 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Keterangan', key: 'keterangan', width: 30 },
            { header: 'Lokasi', key: 'lokasi', width: 25 }, // Tambahkan kolom lokasi jika diinginkan
        ];

        // Isi baris data
        absensiData.forEach(item => {
            worksheet.addRow({
                nama: item.karyawan ? item.karyawan.nama : 'N/A',
                nomorHp: item.nomorHp,
                tanggal: new Date(item.tanggal).toLocaleDateString('id-ID'),
                jam: item.jam,
                posJaga: item.posJaga,
                shift: item.shift,
                status: item.status,
                keterangan: item.keterangan,
                lokasi: item.lokasi || '-', // Pastikan lokasi ada
            });
        });

        // Set header response untuk download Excel
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="data-absensi.xlsx"');

        // Tulis workbook ke response
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error("Error saat mengekspor data absensi:", err); // Log error lebih spesifik
        res.status(500).json({ message: 'Gagal mengekspor data absensi.', error: err.message });
    }
});

// DELETE /api/absensi/:id
router.delete('/:id', async (req, res) => {
    try {
        const absensi = await Absensi.findByIdAndDelete(req.params.id);

        if (!absensi) {
            return res.status(404).json({ message: 'Data absensi tidak ditemukan.' });
        }
        
        // KIRIM SINYAL KE SEMUA KLIEN BAHWA DATA INI TELAH DIHAPUS
        io.emit('absensi_dihapus', { id: req.params.id });
        await emitRekapHariIni(io);
        await emitGrafik(io);
        res.json({ message: 'Data absensi berhasil dihapus.' });

    } catch (err) {
        console.error("Error saat menghapus data absensi:", err); // Log error lebih spesifik
        res.status(500).json({ message: 'Gagal menghapus data.' });
    }
});

module.exports = router;
