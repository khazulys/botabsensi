// bot.js (Versi Final & Lengkap)

// --- IMPORTS ---
const {
  default: makeWASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  Browsers,
  DisconnectReason,
  downloadMediaMessage
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const readline = require("readline");
const moment = require('moment-timezone');

// --- KONEKSI LOKAL ---
const connectDB = require('./utils/db');
const Karyawan = require('./models/Karyawan');
const PosJaga = require('./models/PosJaga');
const Config = require('./models/Config');
const Absensi = require('./models/Absensi');
const { getDistance, extractLatLonFromLink } = require('./utils/distance');
const uploadToImgur = require('./utils/uploadImgur'); // Ganti dengan fungsi upload Anda
const { getIO } = require('./utils/socket');

// --- HANDLERS & SERVICES ---
const handleHadirCommand = require('./handlers/hadirHandler');
const handleOutCommand = require('./handlers/outHandler');
const handleSetGroupCommand = require('./handlers/setGroupHandler');
const handleIzinCommand = require('./handlers/izinHandler');
const handleBreakStartCommand = require('./handlers/breakStartHandler');
const handleBreakEndCommand = require('./handlers/breakEndHandler');
const setupAbsenReminders = require('./services/reminderService');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));
const userState = {};

async function startBot() {
  await connectDB();
  const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_session");
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu("Chrome"),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
  });

  sock.ev.on("creds.update", saveCreds);

  if (!sock.authState.creds.registered) {
    const phoneNumber = await question("Masukkan nomor WhatsApp bot (diawali 62): ");
    const code = await sock.requestPairingCode(phoneNumber);
    console.log(`\nKode Pairing Anda: ${code}\n`);
  }

  sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
    if (connection === "close") {
      const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) startBot();
    } else if (connection === "open") {
      console.log("Bot berhasil terhubung!");
      setupAbsenReminders(sock);
      rl.close();
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages[0];
      if (!msg.message || msg.key.fromMe) return;

      const groupJid = msg.key.remoteJid;
      if (!groupJid.endsWith('@g.us')) return; // Hanya proses pesan dari grup

      const userJid = msg.key.participant;
      if (!userJid) return; // Abaikan jika tidak ada partisipan (misal: notif perubahan nama grup)

      const nomorHp = userJid.split('@')[0];
      const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim();
      const currentState = userState[userJid] || {};
      
      const config = await Config.findOne({ identifier: 'main_config' });

      // Filter grup: abaikan grup yang tidak terdaftar, kecuali untuk perintah !setgrup
      if (text !== '!setgrup' && config?.grupAbsensiId && groupJid !== config.grupAbsensiId) {
        return;
      }

      // =========================================================
      // ===          LOGIKA BERDASARKAN STATE PENGGUNA        ===
      // =========================================================
      if (Object.keys(currentState).length > 0) {
        const messageType = Object.keys(msg.message)[0];
        
        // --- FLOW MENUNGGU LOKASI (UNTUK HADIR & PULANG) ---
        if (messageType === 'locationMessage' && (currentState.stage === 'menunggu_lokasi' || currentState.stage === 'pulang_menunggu_lokasi')) {
            try {
                const { degreesLatitude, degreesLongitude } = msg.message.locationMessage;
                const karyawan = await Karyawan.findOne({ nomorWa: nomorHp });
                const posJaga = await PosJaga.findOne({ namaPos: karyawan.pos });
                if (!posJaga || !config) throw new Error('Data pos atau konfigurasi tidak ditemukan.');

                const posKoordinat = extractLatLonFromLink(posJaga.lokasiPos);
                const jarak = getDistance(posKoordinat, { lat: degreesLatitude, lon: degreesLongitude });

                if (jarak > config.radiusAbsensi) {
                    delete userState[userJid];
                    throw new Error(`Anda berada ${Math.round(jarak)} meter dari pos. Batas: ${config.radiusAbsensi} meter.`);
                }
                
                let nextStage = '';
                if (currentState.stage === 'menunggu_lokasi') nextStage = 'menunggu_foto_hadir';
                if (currentState.stage === 'pulang_menunggu_lokasi') nextStage = 'menunggu_foto_pulang';

                userState[userJid] = {
                    ...currentState,
                    stage: nextStage,
                    karyawanId: karyawan._id,
                    lokasi: { lat: degreesLatitude, lon: degreesLongitude },
                    jarak: Math.round(jarak)
                };
                await sock.sendMessage(groupJid, { text: `✅ Lokasi dalam radius (${Math.round(jarak)}m). Silakan kirim *foto selfie* untuk verifikasi.` }, { "quoted": msg });
            } catch (err) {
                delete userState[userJid];
                await sock.sendMessage(groupJid, { text: `❌ Gagal: ${err.message}` }, { "quoted": msg });
            }
            return;
        }

        // --- FLOW MENUNGGU FOTO (UNTUK HADIR & PULANG) ---
        // --- FLOW MENUNGGU FOTO (UNTUK HADIR & PULANG) ---
        if (messageType === 'imageMessage' && (currentState.stage === 'menunggu_foto_hadir' || currentState.stage === 'menunggu_foto_pulang')) {
            try {
                const buffer = await downloadMediaMessage(msg, "buffer", {});
                const imgUrl = await uploadToImgur(buffer.toString('base64')); // Ganti dengan fungsi upload Anda
                const now = moment().tz('Asia/Makassar');
                const karyawan = await Karyawan.findById(currentState.karyawanId);
                const config = await Config.findOne({ identifier: 'main_config' });
        
                // --- MEMBUAT LINK LOKASI DAN BUKTI ---
                const mapsLink = `https://maps.google.com/?q=${currentState.lokasi.lat},${currentState.lokasi.lon}`;
                const lokasiLink = `<a href="${mapsLink}" target="_blank" class="text-blue-500 hover:underline">Lihat lokasi</a>`;
                const buktiLink = `<a href="${imgUrl}" target="_blank" class="text-blue-500 hover:underline">Lihat bukti</a>`;
                const lokasiGabungan = `${lokasiLink} | ${buktiLink}`;
        
                // MEMBUAT OBJEK DENGAN DATA LENGKAP
                let absensiData = {
                    karyawan: karyawan._id,
                    nomorHp: karyawan.nomorWa,
                    posJaga: karyawan.pos,
                    tanggal: now.toDate(),
                    jam: now.format('HH:mm'),
                    buktiFoto: imgUrl,
                    latitude: currentState.lokasi.lat,
                    longitude: currentState.lokasi.lon,
                    lokasi: lokasiGabungan, // <-- DIPERBAIKI: Menambahkan field lokasi dengan link
                };
        
                // Logika spesifik untuk absen MASUK
                if (currentState.stage === 'menunggu_foto_hadir') {
                    absensiData.status = 'hadir';
                    const [jamMasuk, menitMasuk] = config.jamKerja.masuk.split(':').map(Number);
                    const waktuMasukJadwal = now.clone().set({ hour: jamMasuk, minute: menitMasuk, second: 0 });
                    const selisihMenit = now.diff(waktuMasukJadwal, 'minutes');
                    absensiData.keterangan = selisihMenit > config.toleransiKeterlambatan ? `Terlambat ${selisihMenit} menit` : 'Tepat waktu';
                }
        
                // Logika spesifik untuk absen PULANG
                if (currentState.stage === 'menunggu_foto_pulang') {
                    absensiData.status = 'pulang';
                    const { keluar } = config.jamKerja;
                    const waktuKeluarJadwal = moment(keluar, 'HH:mm').tz('Asia/Makassar', true);
                    const selisihMenit = now.diff(waktuKeluarJadwal, 'minutes');
                    absensiData.keterangan = selisihMenit > 0 ? `Lembur ${selisihMenit} menit` : 'Pulang tepat waktu';
                }
        
                const absensiBaru = new Absensi(absensiData);
                await absensiBaru.save();
                
                // Mengirim data lengkap ke frontend via Socket.IO
                getIO().emit('absensi_baru', { ...absensiBaru.toObject(), karyawan: { nama: karyawan.nama, pos: karyawan.pos } });
                
                await sock.sendMessage(groupJid, { text: `✅ Absensi *${absensiData.status}* berhasil dicatat pada jam ${absensiData.jam} WIB.\nTerima kasih, *${karyawan.nama}*.` }, { "quoted": msg });
        
            } catch (err) {
                await sock.sendMessage(groupJid, { text: `Gagal memproses foto: ${err.message}` }, { "quoted": msg });
            } finally {
                delete userState[userJid];
            }
            return;
        }

        // --- FLOW IZIN: Menunggu Foto Bukti ---
        if (messageType === 'imageMessage' && currentState.stage === 'menunggu_bukti_izin') {
            try {
                const buffer = await downloadMediaMessage(msg, "buffer", {});
                const imgUrl = await uploadToImgur(buffer.toString('base64'));
                const now = moment().tz('Asia/Makassar');

                const izinBaru = new Absensi({
                    karyawan: currentState.karyawanId,
                    status: 'izin',
                    jam: now.format('HH:mm'),
                    tanggal: now.toDate(),
                    keterangan: currentState.keterangan,
                    buktiFoto: imgUrl,
                });
                await izinBaru.save();
                const karyawan = await Karyawan.findById(currentState.karyawanId);

                getIO().emit('absensi_baru', { ...izinBaru.toObject(), karyawan: { nama: karyawan.nama } });
                await sock.sendMessage(groupJid, { text: `✅ Pengajuan *izin* Anda telah dicatat.\nTerima kasih, *${karyawan.nama}*.` }, { "quoted": msg });
            } catch (err) {
                await sock.sendMessage(groupJid, { text: `Gagal memproses bukti izin: ${err.message}` }, { "quoted": msg });
            } finally {
                delete userState[userJid];
            }
            return;
        }

        // --- FLOW SELESAI ISTIRAHAT ---
        // --- FLOW SELESAI ISTIRAHAT: Menunggu Lokasi ---
        if (messageType === 'locationMessage' && currentState.stage === 'selesai_istirahat_menunggu_lokasi') {
            try {
                const location = msg.message.locationMessage;
                // Simpan lokasi ke state dan ubah stage ke menunggu foto
                userState[userJid] = {
                    ...currentState,
                    stage: 'selesai_istirahat_menunggu_foto',
                    lokasi: {
                        latitude: location.degreesLatitude,
                        longitude: location.degreesLongitude
                    }
                };
                await sock.sendMessage(groupJid, { text: '✅ Lokasi diterima. Sekarang, silakan kirim *foto selfie* Anda.' }, { "quoted": msg });
            } catch (err) {
                 await sock.sendMessage(groupJid, { text: 'Gagal memproses lokasi.' }, { "quoted": msg });
            }
            return; // Hentikan proses agar tidak lanjut
        }

        // --- FLOW SELESAI ISTIRAHAT: Menunggu Foto ---
        if (messageType === 'imageMessage' && currentState.stage === 'selesai_istirahat_menunggu_foto') {
            try {
                const config = await Config.findOne({ identifier: 'main_config' });
                const karyawan = await Karyawan.findById(currentState.karyawanId);
                if (!karyawan) throw new Error("Data karyawan tidak ditemukan.");
        
                const posJaga = await PosJaga.findOne({ namaPos: karyawan.pos });
                if (!posJaga) throw new Error(`Pos jaga "${karyawan.pos}" tidak ditemukan.`);
        
                const posKoordinat = extractLatLonFromLink(posJaga.lokasiPos);
                const jarak = getDistance(currentState.lokasi, posKoordinat);
        
                if (jarak > config.radiusAbsensi) {
                    delete userState[userJid];
                    return await sock.sendMessage(groupJid, { text: `❌ *Absen Gagal!* Lokasi Anda (${jarak.toFixed(0)}m) di luar radius pos Anda (${config.radiusAbsensi}m). Silakan kembali ke pos dan ulangi perintah.` }, { "quoted": msg });
                }
        
                const buffer = await downloadMediaMessage(msg, "buffer", {});
                const photoUrl = await uploadToImgur(buffer.toString('base64'));
                const now = moment().tz('Asia/Makassar');
        
                // --- PERBAIKAN DI SINI: Membuat Link HTML ---
                const mapsLink = `https://maps.google.com/?q=${currentState.lokasi.latitude},${currentState.lokasi.longitude}`;
                const lokasiLink = `<a href="${mapsLink}" target="_blank" class="text-blue-500 hover:underline">Lihat lokasi</a>`;
                const buktiLink = `<a href="${photoUrl}" target="_blank" class="text-blue-500 hover:underline">Lihat bukti</a>`;
                const lokasiGabungan = `${lokasiLink} | ${buktiLink}`;
                // --- AKHIR PERBAIKAN ---
        
                const waktuSelesaiJadwal = moment(config.jamKerja.selesaiIstirahat, 'HH:mm').tz('Asia/Makassar', true);
                const selisihMenit = now.diff(waktuSelesaiJadwal, 'minutes');
                const keteranganTelat = selisihMenit > 0 ? `Telat ${selisihMenit} menit` : null;
        
                const absensiSelesai = new Absensi({
                    karyawan: currentState.karyawanId,
                    nomorHp: karyawan.nomorWa,
                    posJaga: karyawan.pos,
                    status: 'selesai istirahat',
                    jam: now.format('HH:mm'),
                    tanggal: now.toDate(),
                    latitude: currentState.lokasi.latitude,
                    longitude: currentState.lokasi.longitude,
                    buktiFoto: photoUrl,
                    keterangan: keteranganTelat,
                    lokasi: lokasiGabungan, // <-- Menambahkan field lokasi dengan link
                });
                await absensiSelesai.save();
                
                let pesanBalasan = `✅ Absen *selesai istirahat* berhasil pada jam ${now.format('HH:mm')} WIB. Selamat bekerja kembali, *${karyawan.nama}*.`;
                if (keteranganTelat) pesanBalasan += `\n\n*Catatan: ${keteranganTelat}*`;
        
                getIO().emit('absensi_baru', { ...absensiSelesai.toObject(), karyawan: { nama: karyawan.nama, pos: karyawan.pos } });
                await sock.sendMessage(groupJid, { text: pesanBalasan }, { "quoted": msg });
            
            } catch (err) {
                 await sock.sendMessage(groupJid, { text: `Gagal memproses foto: ${err.message}` }, { "quoted": msg });
            } finally {
                delete userState[userJid];
            }
            return;
        }


        return; // Hentikan jika ada state tapi tidak cocok dengan pesan masuk
      }

      // =========================================================
      // ===          ROUTING PERINTAH BERBASIS TEKS           ===
      // =========================================================
      if (!text) return;
      
      const command = text.split(' ')[0];
      const commonParams = { sock, groupJid, userJid, nomorHp, userState, msg, text };

      const commandMap = {
        '!hadir': handleHadirCommand,
        '!masuk': handleHadirCommand,
        '!pulang': handleOutCommand,
        '!keluar': handleOutCommand,
        '!izin': handleIzinCommand,
        '!istirahat': handleBreakStartCommand,
        '!selesaiistirahat': handleBreakEndCommand,
        '!setgrup': handleSetGroupCommand
      };

      if (commandMap[command]) {
        // !setgrup punya parameter berbeda karena tidak butuh identifikasi user
        if (command === '!setgrup') await handleSetGroupCommand({ sock, msg });
        else await commandMap[command](commonParams);
      }
    } catch (error) {
      console.error("Error utama dalam 'messages.upsert':", error);
    }
  });
}

startBot();
