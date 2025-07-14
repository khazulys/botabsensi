const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const Config = require('../models/Config');
const Karyawan = require('../models/Karyawan');

let reminderJobs = {}; // Menyimpan cron aktif per shift
let lastConfigHash = ''; // Cache konfigurasi terakhir

// Fungsi untuk tulis log ke file
function writeLog(message) {
    const logPath = path.join(__dirname, '..', 'logs', 'reminder.log');
    const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    const logMessage = `[${timestamp}] ${message}\n`;

    // Buat direktori logs jika belum ada
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    fs.appendFile(logPath, logMessage, (err) => {
        if (err) console.error('❌ Gagal menulis log:', err);
    });
}

// Fungsi kirim reminder ke grup WA
async function sendReminder(sock, shiftName) {
    try {
        const config = await Config.findOne({ identifier: 'main_config' });
        if (!config?.grupAbsensiId) return;

        const targetGroupId = config.grupAbsensiId;
        const karyawanShift = await Karyawan.find({ shift: new RegExp(`^${shiftName}$`, 'i') }).lean();

        if (!karyawanShift.length) {
            const msg = `⚠️ Tidak ada karyawan di shift ${shiftName}, reminder dibatalkan.`;
            console.log(msg);
            writeLog(msg);
            return;
        }

        const mentions = karyawanShift.map(k => `${k.nomorWa}@s.whatsapp.net`);

        await sock.sendMessage(targetGroupId, {
            text: `Halo untuk shift *${shiftName}*, waktu absen sudah dimulai. Jangan lupa absen ya!`,
            mentions
        });

        console.log(`📢 Reminder shift ${shiftName} berhasil dikirim.`);
        writeLog(`✅ Reminder shift ${shiftName} berhasil dikirim ke grup.`);
    } catch (err) {
        console.error(`❌ Gagal mengirim reminder shift ${shiftName}:`, err);
        writeLog(`❌ ERROR reminder shift ${shiftName}: ${err.message}`);
    }
}

// Fungsi buat hash konfigurasi
function getShiftHash(config) {
    return JSON.stringify({
        pagi: config.shiftPagi?.jamMasuk,
        siang: config.shiftSiang?.jamMasuk,
        malam: config.shiftMalam?.jamMasuk
    });
}

// Fungsi utama untuk reschedule jika ada perubahan
async function rescheduleReminders(sock) {
    const config = await Config.findOne({ identifier: 'main_config' });
    if (!config) return;

    const currentHash = getShiftHash(config);
    if (currentHash === lastConfigHash) {
        return; // Tidak ada perubahan konfigurasi
    }

    lastConfigHash = currentHash; // Simpan konfigurasi terakhir

    const shifts = [
        { name: 'Pagi', time: config.shiftPagi?.jamMasuk },
        { name: 'Siang', time: config.shiftSiang?.jamMasuk },
        { name: 'Malam', time: config.shiftMalam?.jamMasuk }
    ];

    for (const shift of shifts) {
        const { name, time } = shift;
        if (!name || !time) continue;

        const [jam, menit] = time.split(':').map(Number);
        let reminderHour = jam;
        let reminderMinute = menit - 30;

        if (reminderMinute < 0) {
            reminderMinute += 60;
            reminderHour -= 1;
            if (reminderHour < 0) reminderHour = 23;
        }

        const cronPattern = `${reminderMinute} ${reminderHour} * * *`;

        // Stop dan hapus job lama
        if (reminderJobs[name]) {
            reminderJobs[name].stop();
            delete reminderJobs[name];
        }

        // Jadwalkan ulang
        if (cron.validate(cronPattern)) {
            const job = cron.schedule(cronPattern, () => {
                console.log(`🔔 Reminder shift ${name} dimulai.`);
                writeLog(`🔔 Reminder shift ${name} dijalankan pada ${reminderHour}:${reminderMinute}`);
                sendReminder(sock, name);
            }, {
                scheduled: true,
                timezone: 'Asia/Jakarta'
            });

            reminderJobs[name] = job;
            console.log(`✅ Jadwal reminder shift ${name} diperbarui ke ${String(reminderHour).padStart(2, '0')}:${String(reminderMinute).padStart(2, '0')} WIB.`);
            writeLog(`🔁 Jadwal shift ${name} diperbarui ke ${String(reminderHour).padStart(2, '0')}:${String(reminderMinute).padStart(2, '0')} WIB`);
        } else {
            console.error(`❌ Cron pattern tidak valid untuk ${name}:`, cronPattern);
            writeLog(`❌ Gagal membuat jadwal shift ${name}, cron tidak valid: ${cronPattern}`);
        }
    }
}

// Fungsi utama untuk setup awal dan pengecekan periodik
async function setupAbsenReminders(sock) {
    await rescheduleReminders(sock); // Inisialisasi pertama

    // Cek ulang konfigurasi setiap 2 menit
    setInterval(async () => {
        try {
            await rescheduleReminders(sock);
        } catch (err) {
            console.error('🔁 Error saat mengecek ulang shift:', err);
            writeLog(`❌ ERROR saat pengecekan ulang shift: ${err.message}`);
        }
    }, 2 * 60 * 1000); // 2 menit
}

module.exports = setupAbsenReminders;