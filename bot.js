// bot.js (Versi Final dengan Multi-Grup & Koneksi Stabil)

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
const fs = require('fs');

// --- KONEKSI LOKAL ---
const connectDB = require('./utils/db');
const Karyawan = require('./models/Karyawan');
const PosJaga = require('./models/PosJaga');
const Config = require('./models/Config');
const Absensi = require('./models/Absensi');
const { getDistance, extractLatLonFromLink } = require('./utils/distance');
const uploadToImgur = require('./utils/uploadImgur');
const { getIO } = require('./utils/socket');
const handleInfoCommand = require('./handlers/infoHandler');

// --- HANDLERS & SERVICES ---
const handleHadirCommand = require('./handlers/hadirHandler');
const handleOutCommand = require('./handlers/outHandler');
const handleSetGroupCommand = require('./handlers/setGroupHandler');
const handleIzinCommand = require('./handlers/izinHandler');
const handleBreakStartCommand = require('./handlers/breakStartHandler');
const handleBreakEndCommand = require('./handlers/breakEndHandler');
const setupAbsenReminders = require('./services/reminderService');

// --- VARIABEL GLOBAL ---
let rl;
const userState = {};
let retryCount = 0;
const AUTH_SESSION_DIR = "baileys_auth_session";

const question = (text) => {
    if (!rl || rl.closed) {
        rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    }
    return new Promise((resolve) => rl.question(text, resolve));
};

async function startBot() {
  connectDB();
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: pino({ level: "debug" }),
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

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    const MAX_RETRY = 5;

    if (connection === 'open') {
        console.log("✅ Bot berhasil terhubung! Mereset hitungan percobaan.");
        retryCount = 0;
        setupAbsenReminders(sock);
        if (rl && !rl.closed) { rl.close(); }
    } else if (connection === 'close') {
        const statusCode = lastDisconnect.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
            retryCount++;
            if (retryCount <= MAX_RETRY) {
                const delay = retryCount * 5000;
                console.error(`❌ Koneksi terputus: ${lastDisconnect.error?.message}. Percobaan ke-${retryCount}. Mencoba lagi dalam ${delay / 1000} detik.`);
                setTimeout(() => startBot(), delay);
            } else {
                console.error(`🛑 Gagal terhubung setelah ${MAX_RETRY} kali. Bot berhenti.`);
                process.exit(1);
            }
        } else {
             console.error('🛑 Perangkat ter-logout! Hapus folder sesi dan scan ulang.');
             if (fs.existsSync(AUTH_SESSION_DIR)) { fs.rmSync(AUTH_SESSION_DIR, { recursive: true, force: true }); }
             process.exit(1);
        }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages[0];
      if (!msg.message || msg.key.fromMe) return;

      const groupJid = msg.key.remoteJid;
      if (!groupJid.endsWith('@g.us')) return;

      const userJid = msg.key.participant;
      if (!userJid) return;

      const nomorHp = userJid.split('@')[0];
      const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim();
      const currentState = userState[userJid] || {};

      // =========================================================
      // ===          FILTER GRUP MULTI-GRUP & DEBUGGING         ===
      // =========================================================

      const config = await Config.findOne({ identifier: 'main_config' });

      // Menampilkan info debug di console setiap ada pesan masuk
      console.log(`\n[DEBUG] Pesan: "${text}" | Dari Grup: ${groupJid}`);

      // LOGIKA FILTER BARU: Cek apakah grup saat ini ada di dalam DAFTAR grup aktif
      if (text !== '!setgrup' && config?.activeGroups && !config.activeGroups.includes(groupJid)) {
        console.log(`[INFO] Pesan diabaikan. Grup ${groupJid} tidak ada dalam daftar aktif.`);
        return;
      }
      
      // =========================================================
      // ===         LOGIKA UTAMA & ALUR PERINTAH              ===
      // =========================================================

      if (text === '!batal') {
          if (currentState.stage) {
              delete userState[userJid];
              return await sock.sendMessage(groupJid, { text: '✅ Proses sebelumnya telah dibatalkan. Anda bisa memulai perintah baru.' }, { "quoted": msg });
          } else {
              return await sock.sendMessage(groupJid, { text: 'Tidak ada proses yang sedang berjalan untuk dibatalkan.' }, { "quoted": msg });
          }
      }

      if (currentState.stage) {
          const messageType = Object.keys(msg.message)[0];

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
                  
                  let nextStage = (currentState.stage === 'menunggu_lokasi') ? 'menunggu_foto_hadir' : 'menunggu_foto_pulang';

                  userState[userJid] = {
                      stage: nextStage,
                      karyawanId: karyawan._id,
                      lokasi: { lat: degreesLatitude, lon: degreesLongitude },
                  };
                  await sock.sendMessage(groupJid, { text: `✅ Lokasi dalam radius (${Math.round(jarak)}m). Silakan kirim *foto selfie* untuk verifikasi.` }, { "quoted": msg });
              } catch (err) {
                  delete userState[userJid];
                  await sock.sendMessage(groupJid, { text: `❌ Gagal: ${err.message}` }, { "quoted": msg });
              }
              return;
          }

          if (messageType === 'imageMessage' && (currentState.stage === 'menunggu_foto_hadir' || currentState.stage === 'menunggu_foto_pulang')) {
              try {
                  const buffer = await downloadMediaMessage(msg, "buffer", {});
                  const imgUrl = await uploadToImgur(buffer.toString('base64'));
                  const now = moment().tz('Asia/Makassar');
                  const karyawan = await Karyawan.findById(currentState.karyawanId);
                  
                  const mapsLink = `http://maps.google.com/maps?q=${currentState.lokasi.lat},${currentState.lokasi.lon}`;
                  const lokasiLink = `<a href="${mapsLink}" target="_blank">Lihat Lokasi</a>`;
                  const buktiLink = `<a href="${imgUrl}" target="_blank">Lihat Bukti</a>`;
                  const lokasiGabungan = `${lokasiLink} | ${buktiLink}`;
          
                  let absensiData = {
                      karyawan: karyawan._id,
                      nomorHp: karyawan.nomorWa,
                      posJaga: karyawan.pos,
                      tanggal: now.toDate(),
                      jam: now.format('HH:mm'),
                      buktiFoto: imgUrl,
                      latitude: currentState.lokasi.lat,
                      longitude: currentState.lokasi.lon,
                      lokasi: lokasiGabungan,
                  };
          
                  if (currentState.stage === 'menunggu_foto_hadir') {
                      absensiData.status = 'hadir';
                      const [jamMasuk, menitMasuk] = config.jamKerja.masuk.split(':').map(Number);
                      const waktuMasukJadwal = now.clone().set({ hour: jamMasuk, minute: menitMasuk, second: 0 });
                      const selisihMenit = now.diff(waktuMasukJadwal, 'minutes');
                      absensiData.keterangan = selisihMenit > config.toleransiKeterlambatan ? `Terlambat ${selisihMenit} menit` : 'Tepat waktu';
                  }
          
                  if (currentState.stage === 'menunggu_foto_pulang') {
                      absensiData.status = 'pulang';
                      const { keluar } = config.jamKerja;
                      const waktuKeluarJadwal = moment(keluar, 'HH:mm').tz('Asia/Makassar', true);
                      const selisihMenit = now.diff(waktuKeluarJadwal, 'minutes');
                      absensiData.keterangan = selisihMenit > 0 ? `Lembur ${selisihMenit} menit` : 'Pulang tepat waktu';
                  }
          
                  const absensiBaru = new Absensi(absensiData);
                  await absensiBaru.save();
                  
                  getIO().emit('absensi_baru', { ...absensiBaru.toObject(), karyawan: { nama: karyawan.nama, pos: karyawan.pos } });
                  await sock.sendMessage(groupJid, { text: `✅ Absensi *${absensiData.status}* berhasil dicatat pada jam ${absensiData.jam} WITA.\nTerima kasih, *${karyawan.nama}*.` }, { "quoted": msg });
          
              } catch (err) {
                  await sock.sendMessage(groupJid, { text: `Gagal memproses foto: ${err.message}` }, { "quoted": msg });
              } finally {
                  delete userState[userJid];
              }
              return;
          }

          if (messageType === 'imageMessage' && currentState.stage === 'menunggu_bukti_izin') {
              try {
                  const buffer = await downloadMediaMessage(msg, "buffer", {});
                  const imgUrl = await uploadToImgur(buffer.toString('base64'));
                  const now = moment().tz('Asia/Makassar');
                  const karyawan = await Karyawan.findById(currentState.karyawanId);
          
                  const buktiLink = `<a href="${imgUrl}" target="_blank">Lihat Bukti</a>`;
          
                  const izinBaru = new Absensi({
                      karyawan: currentState.karyawanId,
                      nomorHp: karyawan.nomorWa,
                      posJaga: karyawan.pos,
                      status: 'izin',
                      jam: now.format('HH:mm'),
                      tanggal: now.toDate(),
                      keterangan: currentState.keterangan,
                      buktiFoto: imgUrl,
                      lokasi: buktiLink,
                  });
                  await izinBaru.save();
          
                  getIO().emit('absensi_baru', { ...izinBaru.toObject(), karyawan: { nama: karyawan.nama, pos: karyawan.pos } });
                  await sock.sendMessage(groupJid, { text: `✅ Pengajuan *izin* Anda telah dicatat.\nTerima kasih, *${karyawan.nama}*.` }, { "quoted": msg });
              } catch (err) {
                  await sock.sendMessage(groupJid, { text: `Gagal memproses bukti izin: ${err.message}` }, { "quoted": msg });
              } finally {
                  delete userState[userJid];
              }
              return;
          }

          const stageInfo = currentState.stage.replace(/_/g, ' ').replace('menunggu ', '');
          await sock.sendMessage(groupJid, { 
              text: `Bot sedang menunggu *${stageInfo}*. Silakan kirim data yang sesuai atau ketik *!batal* untuk membatalkan.` 
          }, { "quoted": msg });
          
          return;
      }
      
      // =========================================================
      // ===          ROUTING PERINTAH BERBASIS TEKS           ===
      // =========================================================
      if (!text) return;
      
      const command = text.split(' ')[0];
      const commonParams = { sock, groupJid, userJid, nomorHp, userState, msg, text };
      const commandMap = {
        '!hadir': handleHadirCommand, '!masuk': handleHadirCommand,
        '!pulang': handleOutCommand, '!keluar': handleOutCommand,
        '!izin': handleIzinCommand, '!istirahat': handleBreakStartCommand,
        '!selesaiistirahat': handleBreakEndCommand, '!setgrup': handleSetGroupCommand,
        '!info': handleInfoCommand
      };

      if (commandMap[command]) {
        await commandMap[command](commonParams);
      }

    } catch (error) {
      console.error("❌ Error utama dalam 'messages.upsert':", error);
    }
  });
}

// Memulai bot
startBot();
