const Karyawan = require('../models/Karyawan');
const Config = require('../models/Config');
const Absensi = require('../models/Absensi');
const moment = require('moment-timezone');

async function handleHadirCommand({ sock, groupJid, userJid, nomorHp, userState, msg }) {
    try {
        const karyawan = await Karyawan.findOne({ nomorWa: nomorHp });
        if (!karyawan) {
            return await sock.sendMessage(groupJid, { text: 'Nomor Anda tidak terdaftar sebagai karyawan.' }, { "quoted": msg });
        }

        const todayStart = moment().tz('Asia/Makassar').startOf('day').toDate();
        const todayEnd = moment().tz('Asia/Makassar').endOf('day').toDate();

        const absensiTerakhirHariIni = await Absensi.findOne({
            karyawan: karyawan._id,
            tanggal: { $gte: todayStart, $lte: todayEnd }
        }).sort({ createdAt: -1 });

        if (absensiTerakhirHariIni) {
            if (absensiTerakhirHariIni.status === 'alpha') {
                return await sock.sendMessage(groupJid, { text: `Anda tidak dapat melakukan absensi karena status Anda hari ini sudah tercatat *Alpha*.` }, { "quoted": msg });
            }
            if (absensiTerakhirHariIni.status === 'pulang') {
                return await sock.sendMessage(groupJid, { text: 'Anda sudah absen pulang hari ini. Silakan kembali besok untuk absen hadir kembali.' }, { "quoted": msg });
            }
            return await sock.sendMessage(groupJid, { text: `Anda sudah tercatat *${absensiTerakhirHariIni.status}* hari ini. Tidak bisa absen hadir lagi.` }, { "quoted": msg });
        }

        const config = await Config.findOne({ identifier: 'main_config' });
        if (!config || !config.jamKerja.masuk) {
             return await sock.sendMessage(groupJid, { text: 'Jam kerja belum diatur oleh admin.' }, { "quoted": msg });
        }
        
        const now = moment().tz('Asia/Makassar');
        const waktuMasukJadwal = moment(config.jamKerja.masuk, 'HH:mm').tz('Asia/Makassar', true);
        const waktuMulaiAbsen = waktuMasukJadwal.clone().subtract(30, 'minutes');
        const waktuSelesaiAbsen = waktuMasukJadwal.clone().add(30, 'minutes');

        if (now.isBefore(waktuMulaiAbsen) || now.isAfter(waktuSelesaiAbsen)) {
            return await sock.sendMessage(groupJid, {
                text: `*Absensi Gagal!* Jendela absensi hanya dibuka dari pukul *${waktuMulaiAbsen.format('HH:mm')}* hingga *${waktuSelesaiAbsen.format('HH:mm')}* WITA.`
            }, { "quoted": msg });
        }

        userState[userJid] = { stage: 'menunggu_lokasi' };
        await sock.sendMessage(groupJid, { text: 'Validasi waktu berhasil. Silakan kirim lokasi Anda sekarang.' }, { "quoted": msg });
    
    } catch (err) {
        console.error("Error pada !hadir:", err);
        await sock.sendMessage(groupJid, { text: 'Terjadi kesalahan internal saat memproses perintah Anda.' }, { "quoted": msg });
    }
}

module.exports = handleHadirCommand;
