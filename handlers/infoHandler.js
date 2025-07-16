const Config = require('../models/Config');
const moment = require('moment-timezone');

async function handleInfoCommand({ sock, groupJid, msg }) {
    try {
        const config = await Config.findOne({ identifier: 'main_config' });
        
        let jamMasuk = "Belum diatur";
        let jamIstirahat = "Belum diatur";
        let jamPulang = "Belum diatur";

        if (config && config.jamKerja) {
            jamMasuk = config.jamKerja.masuk || "N/A";
            jamIstirahat = `${config.jamKerja.mulaiIstirahat || "N/A"} - ${config.jamKerja.selesaiIstirahat || "N/A"}`;
            jamPulang = config.jamKerja.keluar || "N/A";
        }

        const pesanInfo = `
*╭───[ ℹ️ INFO PERINTAH BOT ]───╮*

Berikut adalah perintah yang tersedia:

*1. Absen Masuk*
   - Perintah: \`!hadir\` atau \`!masuk\`
   - Fungsi: Untuk mencatat absensi kehadiran.

*2. Absen Pulang*
   - Perintah: \`!pulang\` atau \`!keluar\`
   - Fungsi: Untuk mencatat absensi pulang.

*3. Absen Istirahat*
   - Perintah: \`!istirahat\`
   - Fungsi: Untuk memulai waktu istirahat.

*4. Selesai Istirahat*
   - Perintah: \`!selesaiistirahat\`
   - Fungsi: Untuk mengakhiri waktu istirahat.

*5. Izin Tidak Masuk*
   - Perintah: \`!izin <alasan>\`
   - Contoh: \`!izin sakit demam\`
   - Fungsi: Untuk mengajukan izin tidak masuk kerja.

*6. Batalkan Proses*
   - Perintah: \`!batal\`
   - Fungsi: Untuk membatalkan proses absensi yang sedang berjalan (jika bot tidak merespons).

*7. Info Bot*
   - Perintah: \`!info\`
   - Fungsi: Menampilkan pesan ini.

*Jam Kerja Saat Ini:*
- Masuk: *${jamMasuk} WITA*
- Istirahat: *${jamIstirahat} WITA*
- Pulang: *${jamPulang} WITA*

*╰──────────────────────────╯*
        `;

        await sock.sendMessage(groupJid, { text: pesanInfo.trim() }, { "quoted": msg });

    } catch (error) {
        console.error("Error pada !info:", error);
        await sock.sendMessage(groupJid, { text: 'Gagal mengambil informasi.' }, { "quoted": msg });
    }
}

module.exports = handleInfoCommand;
