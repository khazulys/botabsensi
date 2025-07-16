const Absensi = require('../models/Absensi');
const Karyawan = require('../models/Karyawan');
const Config = require('../models/Config');
const moment = require('moment-timezone');
const { getIO } = require('../utils/socket');

async function handleBreakStartCommand({ sock, groupJid, nomorHp, msg }) {
    try {
        const karyawan = await Karyawan.findOne({ nomorWa: nomorHp });
        if (!karyawan) {
            return await sock.sendMessage(groupJid, { text: 'Nomor Anda tidak terdaftar.' }, { "quoted": msg });
        }

        const todayStart = moment().tz('Asia/Makassar').startOf('day').toDate();
        const todayEnd = moment().tz('Asia/Makassar').endOf('day').toDate();

        // === VALIDASI BARU DI SINI ===
        const sudahPulang = await Absensi.findOne({ karyawan: karyawan._id, status: 'pulang', tanggal: { $gte: todayStart, $lte: todayEnd } });
        if (sudahPulang) {
            return await sock.sendMessage(groupJid, { text: 'Anda sudah absen pulang dan tidak bisa memulai istirahat.' }, { "quoted": msg });
        }
        
        const sudahHadir = await Absensi.findOne({ karyawan: karyawan._id, status: 'hadir', tanggal: { $gte: todayStart, $lte: todayEnd } });
        if (!sudahHadir) {
            return await sock.sendMessage(groupJid, { text: 'Anda harus absen *hadir* dahulu sebelum bisa istirahat.' }, { "quoted": msg });
        }

        const sudahIstirahat = await Absensi.findOne({ karyawan: karyawan._id, status: 'istirahat', tanggal: { $gte: todayStart, $lte: todayEnd } });
        if (sudahIstirahat) {
            return await sock.sendMessage(groupJid, { text: 'Anda sudah tercatat memulai istirahat.' }, { "quoted": msg });
        }

        const config = await Config.findOne({ identifier: 'main_config' });
        if (!config || !config.jamKerja.mulaiIstirahat) {
            return await sock.sendMessage(groupJid, { text: 'Jam istirahat belum diatur oleh admin.' }, { "quoted": msg });
        }

        // Logika jendela waktu istirahat (tetap sama)
        const { masuk, mulaiIstirahat, selesaiIstirahat } = config.jamKerja;
        const now = moment().tz('Asia/Makassar');
        const tanggalAcuan = moment(sudahHadir.tanggal).tz('Asia/Makassar');
        let waktuMasukJadwal = tanggalAcuan.clone().set({ hour: masuk.split(':')[0], minute: masuk.split(':')[1] });
        let waktuMulaiWindow = tanggalAcuan.clone().set({ hour: mulaiIstirahat.split(':')[0], minute: mulaiIstirahat.split(':')[1] });
        let waktuSelesaiWindow = tanggalAcuan.clone().set({ hour: selesaiIstirahat.split(':')[0], minute: selesaiIstirahat.split(':')[1] });

        if (waktuMulaiWindow.isBefore(waktuMasukJadwal)) waktuMulaiWindow.add(1, 'day');
        if (waktuSelesaiWindow.isBefore(waktuMulaiWindow)) waktuSelesaiWindow.add(1, 'day');
        
        if (now.isBefore(waktuMulaiWindow) || now.isAfter(waktuSelesaiWindow)) {
            return await sock.sendMessage(groupJid, { text: `Waktu istirahat hanya dibuka dari pukul *${waktuMulaiWindow.format('HH:mm')}* hingga *${waktuSelesaiWindow.format('HH:mm')}* WIB.` }, { "quoted": msg });
        }

        const absensiIstirahat = new Absensi({
            karyawan: karyawan._id,
            nomorHp: karyawan.nomorWa,
            posJaga: karyawan.pos,
            status: 'istirahat',
            jam: now.format('HH:mm'),
            tanggal: now.toDate(),
        });
        await absensiIstirahat.save();

        getIO().emit('absensi_baru', { ...absensiIstirahat.toObject(), karyawan: { nama: karyawan.nama, pos: karyawan.pos } });
        await sock.sendMessage(groupJid, { text: `✅ Absen *istirahat* berhasil pada jam ${now.format('HH:mm')} WIB. Selamat beristirahat!` }, { "quoted": msg });

    } catch (err) {
        console.error("Error pada !istirahat:", err);
        await sock.sendMessage(groupJid, { text: 'Terjadi kesalahan internal.' }, { "quoted": msg });
    }
}

module.exports = handleBreakStartCommand;
