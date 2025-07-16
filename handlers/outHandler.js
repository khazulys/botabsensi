const Karyawan = require('../models/Karyawan');
const Config = require('../models/Config');
const Absensi = require('../models/Absensi');
const moment = require('moment-timezone');

async function handleOutCommand({ sock, groupJid, userJid, nomorHp, userState, msg }) {
    try {
        const karyawan = await Karyawan.findOne({ nomorWa: nomorHp });
        if (!karyawan) {
            return await sock.sendMessage(groupJid, { text: 'Nomor Anda tidak terdaftar.' }, { "quoted": msg });
        }

        const todayStart = moment().tz('Asia/Makassar').startOf('day').toDate();
        const todayEnd = moment().tz('Asia/Makassar').endOf('day').toDate();

        const statusAlpha = await Absensi.findOne({ karyawan: karyawan._id, status: 'alpha', tanggal: { $gte: todayStart, $lte: todayEnd } });
        if (statusAlpha) {
            return await sock.sendMessage(groupJid, { text: `Anda tidak dapat absen pulang karena status Anda hari ini sudah tercatat *Alpha*.` }, { "quoted": msg });
        }

        const absensiMasuk = await Absensi.findOne({
            karyawan: karyawan._id,
            status: 'hadir',
            tanggal: { $gte: todayStart, $lte: todayEnd },
        });

        if (!absensiMasuk) {
            return await sock.sendMessage(groupJid, { text: 'Anda belum tercatat absen "hadir" hari ini.' }, { "quoted": msg });
        }
        
        const absensiPulang = await Absensi.findOne({
            karyawan: karyawan._id,
            status: 'pulang',
            tanggal: { $gte: todayStart, $lte: todayEnd },
        });

        if (absensiPulang) {
             return await sock.sendMessage(groupJid, { text: 'Anda sudah melakukan absensi pulang hari ini.' }, { "quoted": msg });
        }

        const config = await Config.findOne({ identifier: 'main_config' });
        if (!config || !config.jamKerja.keluar) {
             return await sock.sendMessage(groupJid, { text: 'Jam kerja belum diatur oleh admin.' }, { "quoted": msg });
        }

        const { masuk, keluar } = config.jamKerja;
        const nowInJakarta = moment().tz('Asia/Makassar');
        
        const waktuAbsenMasuk = moment(absensiMasuk.tanggal).tz('Asia/Makassar');
        let waktuMasukJadwal = waktuAbsenMasuk.clone().set({ hour: masuk.split(':')[0], minute: masuk.split(':')[1], second: 0 });
        let waktuKeluarJadwal = waktuAbsenMasuk.clone().set({ hour: keluar.split(':')[0], minute: keluar.split(':')[1], second: 0 });

        if (waktuKeluarJadwal.isBefore(waktuMasukJadwal)) {
            waktuKeluarJadwal.add(1, 'day');
        }

        if (waktuKeluarJadwal.diff(nowInJakarta, 'minutes') > 30) {
            const waktuBolehPulang = waktuKeluarJadwal.clone().subtract(30, 'minutes');
            return await sock.sendMessage(groupJid, { 
                text: `Anda baru bisa absen pulang mulai pukul *${waktuBolehPulang.format('HH:mm')} WITA*.\n\nJika ingin pulang lebih awal, hubungi atasan Anda.`
            }, { "quoted": msg });
        }
        
        userState[userJid] = { stage: 'pulang_menunggu_lokasi' };
        await sock.sendMessage(groupJid, {
            text: 'Validasi waktu pulang berhasil. Silakan kirim lokasi Anda sekarang.'
        }, { "quoted": msg });

    } catch (err) {
        console.error("Error pada !pulang:", err);
        await sock.sendMessage(groupJid, { text: 'Terjadi kesalahan internal saat memproses perintah Anda.' }, { "quoted": msg });
    }
}

module.exports = handleOutCommand;
