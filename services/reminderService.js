const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const Config = require('../models/Config');
const Karyawan = require('../models/Karyawan');
const Absensi = require('../models/Absensi');
const { getIO } = require('../utils/socket');

let reminderJobs = {}; // Menyimpan cron job yang aktif
let lastConfigHash = ''; // Cache untuk mendeteksi perubahan konfigurasi

// Fungsi untuk menulis log
function writeLog(message) {
    const logPath = path.join(__dirname, '..', 'logs', 'reminder.log');
    const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' });
    const logMessage = `[${timestamp}] ${message}\n`;
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFile(logPath, logMessage, (err) => {
        if (err) console.error('❌ Gagal menulis log:', err);
    });
}

// --- FUNGSI-FUNGSI PENGIRIM REMINDER ---

async function sendReminderMasuk(sock, config, message) {
    try {
        if (!config?.grupAbsensiId) return;

        const todayStart = moment().tz('Asia/Makassar').startOf('day').toDate();
        const todayEnd = moment().tz('Asia/Makassar').endOf('day').toDate();

        const karyawanAktif = await Karyawan.find({ status: 'aktif' }).lean();
        if (karyawanAktif.length === 0) return;

        const sudahAbsen = await Absensi.find({ tanggal: { $gte: todayStart, $lte: todayEnd } }).lean();
        const karyawanSudahAbsenIds = new Set(sudahAbsen.map(a => a.karyawan.toString()));

        const belumAbsen = karyawanAktif.filter(k => !karyawanSudahAbsenIds.has(k._id.toString()));

        if (belumAbsen.length === 0) {
            writeLog('✅ Semua karyawan sudah absen, reminder masuk dibatalkan.');
            return;
        }

        const mentions = belumAbsen.map(k => `${k.nomorWa}@s.whatsapp.net`);
        await sock.sendMessage(config.grupAbsensiId, { text: message, mentions });

        writeLog(`✅ Reminder absen masuk berhasil dikirim ke ${belumAbsen.length} karyawan.`);
    } catch (err) {
        writeLog(`❌ ERROR saat kirim reminder masuk: ${err.message}`);
    }
}

async function sendReminderIstirahat(sock, config) {
    try {
        if (!config?.grupAbsensiId) return;

        const todayStart = moment().tz('Asia/Makassar').startOf('day').toDate();
        const todayEnd = moment().tz('Asia/Makassar').endOf('day').toDate();

        const sudahHadir = await Absensi.find({ status: 'hadir', tanggal: { $gte: todayStart, $lte: todayEnd } }).populate('karyawan').lean();
        const sudahIstirahat = await Absensi.find({ status: 'istirahat', tanggal: { $gte: todayStart, $lte: todayEnd } }).lean();
        const karyawanSudahIstirahatIds = new Set(sudahIstirahat.map(a => a.karyawan.toString()));
        
        const belumIstirahat = sudahHadir.filter(a => a.karyawan && !karyawanSudahIstirahatIds.has(a.karyawan._id.toString()));

        if (belumIstirahat.length === 0) {
            writeLog('✅ Semua karyawan yang hadir sudah istirahat, reminder dibatalkan.');
            return;
        }
        
        const mentions = belumIstirahat.map(a => `${a.karyawan.nomorWa}@s.whatsapp.net`);
        await sock.sendMessage(config.grupAbsensiId, {
            text: `🌞 Waktunya istirahat! Jangan lupa untuk absen kembali setelah selesai istirahat ya.`,
            mentions
        });

        writeLog(`✅ Reminder istirahat berhasil dikirim ke ${belumIstirahat.length} karyawan.`);
    } catch (err) {
        writeLog(`❌ ERROR saat kirim reminder istirahat: ${err.message}`);
    }
}

async function markAlphaEmployees(sock, config) {
    try {
        writeLog('🏃 Menjalankan pengecekan status Alpha...');
        if (!config?.grupAbsensiId) return;

        const todayStart = moment().tz('Asia/Makassar').startOf('day').toDate();
        const todayEnd = moment().tz('Asia/Makassar').endOf('day').toDate();

        const karyawanAktif = await Karyawan.find({ status: 'aktif' }).lean();
        if (karyawanAktif.length === 0) return;

        const absensiHariIni = await Absensi.find({ tanggal: { $gte: todayStart, $lte: todayEnd } }).lean();
        const karyawanSudahAbsenIds = new Set(absensiHariIni.map(a => a.karyawan.toString()));

        const karyawanAlpha = karyawanAktif.filter(k => !karyawanSudahAbsenIds.has(k._id.toString()));

        if (karyawanAlpha.length === 0) {
            writeLog('✅ Semua karyawan sudah absen atau izin. Tidak ada yang ditandai Alpha.');
            return;
        }

        writeLog(`⚠️ Ditemukan ${karyawanAlpha.length} karyawan yang akan ditandai Alpha.`);
        const now = moment().tz('Asia/Makassar');

        for (const karyawan of karyawanAlpha) {
            const alphaRecord = new Absensi({
                karyawan: karyawan._id,
                nomorHp: karyawan.nomorWa,
                posJaga: karyawan.pos,
                status: 'alpha',
                jam: now.format('HH:mm'),
                tanggal: now.toDate(),
                keterangan: 'Tidak ada absensi masuk atau izin'
            });
            await alphaRecord.save();
            getIO().emit('absensi_baru', { ...alphaRecord.toObject(), karyawan: { nama: karyawan.nama, pos: karyawan.pos } });
        }

        const mentions = karyawanAlpha.map(k => `${k.nomorWa}@s.whatsapp.net`);
        await sock.sendMessage(config.grupAbsensiId, {
            text: `Waduh, kamu belum absen hadir atau izin, status kamu hari ini jadi *alpha* tuh 🤷‍♂️`,
            mentions
        });

        writeLog(`✅ Berhasil menandai ${karyawanAlpha.length} karyawan sebagai Alpha dan mengirim notifikasi.`);
    } catch (err) {
        writeLog(`❌ ERROR saat proses Auto-Alpha: ${err.message}`);
    }
}

// --- FUNGSI UTAMA PENJADWALAN ---

async function rescheduleReminders(sock) {
    const config = await Config.findOne({ identifier: 'main_config' }).lean();
    if (!config || !config.jamKerja) {
        console.log("Konfigurasi jam kerja tidak ditemukan, reminder tidak diaktifkan.");
        return;
    }

    const currentHash = JSON.stringify(config.jamKerja);
    if (currentHash === lastConfigHash) {
        return; // Tidak ada perubahan
    }

    lastConfigHash = currentHash;
    console.log('Konfigurasi jam kerja berubah, menjadwalkan ulang semua reminder...');

    // Hentikan semua job lama sebelum membuat yang baru
    Object.values(reminderJobs).forEach(job => job.stop());
    reminderJobs = {};

    const { masuk, mulaiIstirahat } = config.jamKerja;

    // Definisikan waktu-waktu penting
    const waktuMasuk = moment(masuk, 'HH:mm');
    const waktuReminderMasukAwal = waktuMasuk.clone().subtract(30, 'minutes');
    const waktuReminderMasukAkhir = waktuMasuk.clone().add(30, 'minutes');
    const waktuCekAlpha = waktuMasuk.clone().add(35, 'minutes'); // 5 menit setelah jendela ditutup
    const waktuIstirahat = moment(mulaiIstirahat, 'HH:mm');

    // Buat daftar pekerjaan yang akan dijadwalkan
    const jobsToSchedule = [
        { 
            name: 'MasukAwal', 
            pattern: `${waktuReminderMasukAwal.minutes()} ${waktuReminderMasukAwal.hours()} * * *`, 
            handler: () => sendReminderMasuk(sock, config, `☀️ *Pengingat Absen Masuk* ☀️\n\nWaktu absen akan dibuka dalam 30 menit lagi. Mohon bersiap-siap ya!`) 
        },
        { 
            name: 'MasukAkhir', 
            pattern: `${waktuReminderMasukAkhir.minutes()} ${waktuReminderMasukAkhir.hours()} * * *`, 
            handler: () => sendReminderMasuk(sock, config, `🔔 *Pengingat Terakhir Absen Masuk* 🔔\n\nBagi yang belum absen, waktu absen akan segera berakhir. Silakan absen sekarang!`) 
        },
        { 
            name: 'CekAlpha', 
            pattern: `${waktuCekAlpha.minutes()} ${waktuCekAlpha.hours()} * * *`, 
            handler: () => markAlphaEmployees(sock, config) 
        },
        { 
            name: 'Istirahat', 
            pattern: `${waktuIstirahat.minutes()} ${waktuIstirahat.hours()} * * *`, 
            handler: () => sendReminderIstirahat(sock, config) 
        }
    ];

    // Lakukan penjadwalan
    jobsToSchedule.forEach(({ name, pattern, handler }) => {
        if (cron.validate(pattern)) {
            reminderJobs[name] = cron.schedule(pattern, handler, {
                scheduled: true,
                timezone: 'Asia/Makassar'
            });
            const logMsg = `✅ Jadwal reminder '${name}' berhasil diatur ke pola: ${pattern}`;
            writeLog(logMsg);
            console.log(logMsg);
        } else {
            const logMsg = `❌ Pola cron tidak valid untuk '${name}': ${pattern}`;
            writeLog(logMsg);
            console.error(logMsg);
        }
    });
}

// --- FUNGSI SETUP UTAMA ---

async function setupAbsenReminders(sock) {
    console.log("🔧 Menginisialisasi layanan reminder & auto-alpha...");
    await rescheduleReminders(sock);

    // Cek ulang konfigurasi secara periodik
    setInterval(() => {
        rescheduleReminders(sock).catch(err => {
            writeLog(`❌ ERROR saat pengecekan ulang jadwal: ${err.message}`);
        });
    }, 1 * 60 * 1000); // setiap 5 menit
}

module.exports = setupAbsenReminders;
