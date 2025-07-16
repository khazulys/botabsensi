const Karyawan = require('../models/Karyawan');
const Config = require('../models/Config');
const Absensi = require('../models/Absensi');
const moment = require('moment-timezone');

async function handleOutCommand({ sock, groupJid, nomorHp, userState, msg }) {
    try {
        const karyawan = await Karyawan.findOne({ nomorWa: nomorHp });
        if (!karyawan) {
            return await sock.sendMessage(groupJid, { text: 'Nomor Anda tidak terdaftar.' }, { "quoted": msg });
        }

        const config = await Config.findOne({ identifier: 'main_config' });
        const todayStart = moment().tz('Asia/Makassar').startOf('day').toDate();
        const todayEnd = moment().tz('Asia/Makassar').endOf('day').toDate();
        const absensiMasuk = await Absensi.findOne({ karyawan: karyawan._id, tanggal: { $gte: todayStart, $lte: todayEnd }, status: 'hadir' });

        if (!absensiMasuk) {
            return await sock.sendMessage(groupJid, { text: 'Anda belum absen "hadir" hari ini.' }, { "quoted": msg });
        }
        
        const absensiPulang = await Absensi.findOne({ karyawan: karyawan._id, tanggal: { $gte: todayStart, $lte: todayEnd }, status: 'pulang' });
        if (absensiPulang) {
             return await sock.sendMessage(groupJid, { text: 'Anda sudah absen pulang hari ini.' }, { "quoted": msg });
        }

        const { masuk, keluar } = config.jamKerja;
        const nowInJakarta = moment().tz('Asia/Makassar');
        let waktuKeluarJadwal = moment(absensiMasuk.tanggal).tz('Asia/Makassar').set({ hour: keluar.split(':')[0], minute: keluar.split(':')[1], second: 0 });
        let waktuMasukJadwal = moment(absensiMasuk.tanggal).tz('Asia/Makassar').set({ hour: masuk.split(':')[0], minute: masuk.split(':')[1], second: 0 });

        if (waktuKeluarJadwal.isBefore(waktuMasukJadwal)) {
            waktuKeluarJadwal.add(1, 'day');
        }

        if (waktuKeluarJadwal.diff(nowInJakarta, 'minutes') > 30) {
            const waktuBolehPulang = waktuKeluarJadwal.clone().subtract(30, 'minutes');
            return await sock.sendMessage(groupJid, { text: `Anda baru bisa absen pulang mulai pukul *${waktuBolehPulang.format('HH:mm')} WIB*.`}, { "quoted": msg });
        }
        
        userState[msg.key.participant] = { stage: 'pulang_menunggu_lokasi' };
        await sock.sendMessage(groupJid, { text: 'Validasi waktu pulang berhasil. Silakan kirim lokasi Anda sekarang.' });
    } catch (err) {
        await sock.sendMessage(groupJid, { text: 'Terjadi kesalahan internal.' }, { "quoted": msg });
    }
}
module.exports = handleOutCommand;
