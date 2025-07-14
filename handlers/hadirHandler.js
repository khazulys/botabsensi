const Karyawan = require('../models/Karyawan');
const Config = require('../models/Config');
const Absensi = require('../models/Absensi');
const moment = require('moment-timezone');

/**
 * Menangani logika !hadir dengan aturan yang disederhanakan.
 */
async function handleHadirCommand({ sock, sender, nomorHp, userState, msg }) {
    try {
        const karyawan = await Karyawan.findOne({ nomorWa: nomorHp });
        if (!karyawan) {
            return await sock.sendMessage(sender, { text: 'Nama kamu tidak terdaftar sebagai karyawan, silahkan hubungi atasan kamu.' }, {"quoted": msg});
        }

        // =========================================================
        // === ATURAN 1: Cek Absensi Hanya Bisa 1 Kali Sehari ===
        // =========================================================
        const todayStart = moment().tz('Asia/Jakarta').startOf('day').toDate();
        const todayEnd = moment().tz('Asia/Jakarta').endOf('day').toDate();

        const absensiHariIni = await Absensi.findOne({
            karyawan: karyawan._id,
            tanggal: { $gte: todayStart, $lte: todayEnd }
        });

        if (absensiHariIni) {
            const status = absensiHariIni.status;
            const jam = absensiHariIni.jam;
        
            if (status === 'izin') {
                return await sock.sendMessage(sender, {
                    text: `Anda sudah *izin* hari ini pada jam ${jam} WIB.`
                }, {"quoted": msg});
            } else if (status === 'alpha') {
                return await sock.sendMessage(sender, {
                    text: `Hari ini kamu dianggap *alpha* karena tidak melakukan absen *hadir* maupun *izin*.`
                }, {"quoted": msg});
            } else {
                return await sock.sendMessage(sender, {
                    text: `Anda sudah melakukan absensi hari ini pada jam ${jam} WIB.`
                }, {"quoted": msg});
            }
        }

        // =========================================================
        // === ATURAN 2: Jendela Absen (+/- 30 Menit dari Jam Masuk) ===
        // =========================================================
        const config = await Config.findOne({ identifier: 'main_config' });
        const shiftConfig = config[`shift${karyawan.shift.charAt(0).toUpperCase() + karyawan.shift.slice(1).toLowerCase()}`];

        if (!shiftConfig || !shiftConfig.aktif) {
            return await sock.sendMessage(sender, { text: `Shift ${karyawan.shift} Anda tidak aktif.` }, {"quoted": msg});
        }

        const now = moment().tz('Asia/Jakarta');
        const [jamMasuk, menitMasuk] = shiftConfig.jamMasuk.split(':').map(Number);
        const waktuMasukHariIni = moment().tz('Asia/Jakarta').set({ hour: jamMasuk, minute: menitMasuk });

        const selisihMenit = now.diff(waktuMasukHariIni, 'minutes');

        if (selisihMenit < -30 || selisihMenit > 30) {
            const waktuMulai = waktuMasukHariIni.clone().subtract(30, 'minutes').format('HH:mm');
            const waktuSelesai = waktuMasukHariIni.clone().add(30, 'minutes').format('HH:mm');
            return await sock.sendMessage(sender, {
                text: `*Absensi Gagal!*\n\nJendela absensi untuk shift Anda hanya dibuka dari pukul *${waktuMulai}* hingga *${waktuSelesai}* WIB.\n\n*Waktu Sekarang:* ${now.format('HH:mm')} WIB`
            }, {"quoted": msg});
        }

        // --- SEMUA VALIDASI BERHASIL ---
        userState[sender] = { stage: 'menunggu_lokasi' };
        await sock.sendMessage(sender, {
            text: 'Validasi berhasil. Silakan kirim lokasi Anda sekarang.'
        });

    } catch (err) {
        console.error("Error pada command !hadir: ", err);
        await sock.sendMessage(sender, { text: 'Terjadi kesalahan internal.' }, {"quoted": msg});
    }
}

module.exports = handleHadirCommand;