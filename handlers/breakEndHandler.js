const Karyawan = require('../models/Karyawan');
const Config = require('../models/Config');
const Absensi = require('../models/Absensi');
const moment = require('moment-timezone');

async function handleBreakEndCommand({ sock, groupJid, nomorHp, userState, msg }) {
    try {
        const karyawan = await Karyawan.findOne({ nomorWa: nomorHp });
        if (!karyawan) {
            return await sock.sendMessage(groupJid, { text: 'Nomor Anda tidak terdaftar.' }, { "quoted": msg });
        }
        const config = await Config.findOne({ identifier: 'main_config' });
        const todayStart = moment().tz('Asia/Makassar').startOf('day').toDate();
        const todayEnd = moment().tz('Asia/Makassar').endOf('day').toDate();
        const sedangIstirahat = await Absensi.findOne({ karyawan: karyawan._id, status: 'istirahat', tanggal: { $gte: todayStart, $lte: todayEnd } });
        if (!sedangIstirahat) {
            return await sock.sendMessage(groupJid, { text: 'Anda belum tercatat *istirahat*.' }, { "quoted": msg });
        }
        const sudahSelesai = await Absensi.findOne({ karyawan: karyawan._id, status: 'selesai istirahat', tanggal: { $gte: todayStart, $lte: todayEnd } });
        if (sudahSelesai) {
            return await sock.sendMessage(groupJid, { text: 'Anda sudah absen selesai istirahat.' }, { "quoted": msg });
        }
        const { selesaiIstirahat } = config.jamKerja;
        const now = moment().tz('Asia/Makassar');
        const waktuSelesaiJadwal = moment(selesaiIstirahat, 'HH:mm').tz('Asia/Makassar', true);
        const waktuBukaAbsen = waktuSelesaiJadwal.clone().subtract(30, 'minutes');
        const waktuTutupAbsen = waktuSelesaiJadwal.clone().add(30, 'minutes');
        if (now.isBefore(waktuBukaAbsen) || now.isAfter(waktuTutupAbsen)) {
            return await sock.sendMessage(groupJid, { text: `Absen selesai istirahat hanya dibuka dari *${waktuBukaAbsen.format('HH:mm')}* hingga *${waktuTutupAbsen.format('HH:mm')}* WIB.` }, { "quoted": msg });
        }
        userState[msg.key.participant] = {
            stage: 'selesai_istirahat_menunggu_lokasi',
            karyawanId: karyawan._id,
        };
        await sock.sendMessage(groupJid, { text: 'Validasi waktu berhasil. Silakan kirim lokasi, lalu kirim foto selfie.' });
    } catch (err) {
        await sock.sendMessage(groupJid, { text: 'Terjadi kesalahan internal.' }, { "quoted": msg });
    }
}
module.exports = handleBreakEndCommand;
