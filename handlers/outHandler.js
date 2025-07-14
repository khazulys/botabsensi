const Karyawan = require('../models/Karyawan');
const Config = require('../models/Config');
const Absensi = require('../models/Absensi');
const moment = require('moment-timezone');

async function handleOutCommand({ sock, sender, nomorHp, userState, msg }) {
    try {
        const karyawan = await Karyawan.findOne({ nomorWa: nomorHp });
        if (!karyawan) {
            return await sock.sendMessage(sender, { text: 'Nama kamu tidak terdaftar sebagai karyawan, silahkan hubungi atasan kamu' }, {"quoted": msg});
        }

        const config = await Config.findOne({ identifier: 'main_config' });
        if (!config) {
            return await sock.sendMessage(sender, { text: 'Konfigurasi sistem tidak ditemukan.' }, {"quoted": msg});
        }

        // Cek apakah sudah absen masuk & belum absen pulang hari ini
        const todayStart = moment().tz('Asia/Jakarta').startOf('day').toDate();
        const todayEnd = moment().tz('Asia/Jakarta').endOf('day').toDate();

        const absensiMasuk = await Absensi.findOne({
            karyawan: karyawan._id,
            tanggal: { $gte: todayStart, $lte: todayEnd },
            status: 'hadir'
        });

        if (!absensiMasuk) {
            return await sock.sendMessage(sender, { text: 'Anda belum tercatat absen "hadir" hari ini.' }, {"quoted": msg});
        }
        
        const absensiPulang = await Absensi.findOne({
            karyawan: karyawan._id,
            tanggal: { $gte: todayStart, $lte: todayEnd },
            status: 'pulang'
        });

        if (absensiPulang) {
             return await sock.sendMessage(sender, { text: 'Anda sudah melakukan absensi pulang hari ini.' }, {"quoted": msg});
        }

        // Validasi waktu absen pulang
        const shiftConfig = config[`shift${karyawan.shift.charAt(0).toUpperCase() + karyawan.shift.slice(1).toLowerCase()}`];
        const [jamMasuk, menitMasuk] = shiftConfig.jamMasuk.split(':').map(Number);
        const [jamKeluar, menitKeluar] = shiftConfig.jamKeluar.split(':').map(Number);
        
        const nowInJakarta = moment().tz('Asia/Jakarta');
        let waktuKeluarShift = moment().tz('Asia/Jakarta').set({ hour: jamKeluar, minute: menitKeluar, second: 0 });
        let waktuMasukShift = moment().tz('Asia/Jakarta').set({ hour: jamMasuk, minute: menitMasuk, second: 0 });

        if (waktuKeluarShift.isBefore(waktuMasukShift)) {
            waktuKeluarShift.add(1, 'day');
        }

        const selisihMenit = waktuKeluarShift.diff(nowInJakarta, 'minutes');

        if (selisihMenit > 30) {
            const waktuBolehPulang = waktuKeluarShift.clone().subtract(30, 'minutes');
            return await sock.sendMessage(sender, { 
                text: `Anda baru bisa absen pulang pada pukul *${waktuBolehPulang.format('HH:mm')} WIB*.\n\nJika Anda ingin pulang lebih awal, silakan hubungi atasan Anda.`
            }, {"quoted": msg});
        }
        
        // Validasi berhasil, siapkan state untuk membuat data baru
        userState[sender] = { 
            stage: 'pulang_menunggu_lokasi',
        };
        await sock.sendMessage(sender, {
            text: 'Validasi waktu pulang berhasil.\n\nSilakan kirim lokasi Anda sekarang.'
        }, {"quoted": msg});

    } catch (err) {
        console.error("Error pada command !pulang: ", err);
        await sock.sendMessage(sender, { text: 'Terjadi kesalahan internal saat memproses perintah Anda.' }, {"quoted": msg});
    }
}

module.exports = handleOutCommand;
