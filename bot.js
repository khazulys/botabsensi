// bot.js

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
const uploadToImgur = require('./utils/uploadImgur');
const { getIO } = require('./utils/socket');

// --- HANDLERS & SERVICES ---
const handleHadirCommand = require('./handlers/hadirHandler');
const handleOutCommand = require('./handlers/outHandler');
const handleSetGroupCommand = require('./handlers/setGroupHandler');
const handleIzinCommand = require('./handlers/izinHandler'); // Diimpor untuk !izin
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
      console.log("Bot berhasil terhubung ke WhatsApp!");
      setupAbsenReminders(sock);
      rl.close();
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    try {
      const msg = messages[0];
      if (!msg.message || msg.key.fromMe) return;

      const sender = msg.key.remoteJid;
      const isGroup = sender.endsWith('@g.us');
      const senderId = isGroup ? msg.key.participant : sender;
      const nomorHp = senderId.split('@')[0];
      const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase().trim();
      const currentState = userState[sender] || {};

      // === FLOW ABSEN MASUK: HANDLE FOTO ===
      if (msg.message.imageMessage && currentState.stage === 'menunggu_foto') {
        try {
          const absensiData = currentState;
          const buffer = await downloadMediaMessage(msg, "buffer", {});
          const base64 = buffer.toString('base64');
          const imgUrl = await uploadToImgur(base64);
          const lokasiLink = `<a href="${absensiData.lokasi}" target="_blank" class="text-blue-500 hover:underline">Lihat lokasi</a>`;
          const buktiLink = `<a href="${imgUrl}" target="_blank" class="text-blue-500 hover:underline">Lihat bukti</a>`;
          const lokasiGabungan = `${lokasiLink} | ${buktiLink}`;
          const now = moment().tz('Asia/Jakarta');
          const absensiBaru = new Absensi({
            karyawan: absensiData.karyawanId,
            nomorHp: absensiData.nomorHp,
            tanggal: now.toDate(),
            jam: now.format('HH:mm'),
            posJaga: absensiData.posJaga,
            shift: absensiData.shift,
            status: 'hadir',
            keterangan: absensiData.keterangan,
            lokasi: lokasiGabungan,
            buktiFoto: imgUrl
          });
          const absensiTersimpan = await absensiBaru.save();
          const karyawan = await Karyawan.findById(absensiData.karyawanId);
          getIO().emit('absensi_baru', {
              _id: absensiTersimpan._id,
              karyawan: { _id: karyawan._id, nama: karyawan.nama },
              nomorHp: absensiTersimpan.nomorHp,
              tanggal: absensiTersimpan.tanggal,
              jam: absensiTersimpan.jam,
              posJaga: absensiTersimpan.posJaga,
              shift: absensiTersimpan.shift,
              status: absensiTersimpan.status,
              keterangan: absensiTersimpan.keterangan,
              lokasi: absensiTersimpan.lokasi,
              buktiFoto: absensiTersimpan.buktiFoto
          });
          await sock.sendMessage(sender, { text: `*${karyawan.nama}*, absensi kamu telah dicatat *hadir* hari ini:\n\n*Nama:* ${karyawan.nama}\n*Tanggal:* ${now.format('DD MMMM YYYY')}\n*Jam:* ${absensiTersimpan.jam} WIB\n*Status:* ${absensiTersimpan.status}\n*Keterangan:* ${absensiTersimpan.keterangan || '-'}` }, {"quoted": msg});
        } catch (err) {
          await sock.sendMessage(sender, { text: `Gagal memproses absensi: ${err.message}` }, {"quoted": msg});
        } finally {
          delete userState[sender];
        }
        return;
      }

      // === FLOW IZIN: HANDLE FOTO BUKTI ===
      if (msg.message.imageMessage && currentState.stage === 'menunggu_bukti_izin') {
        try {
            const izinData = currentState;
            const buffer = await downloadMediaMessage(msg, "buffer", {});
            const base64 = buffer.toString('base64');
            const imgUrl = await uploadToImgur(base64);
            const buktiLink = `<a href="${imgUrl}" target="_blank" class="text-blue-500 hover:underline">Lihat bukti</a>`;
            const now = moment().tz('Asia/Jakarta');
            const izinBaru = new Absensi({
                karyawan: izinData.karyawanId,
                nomorHp: izinData.nomorHp,
                tanggal: now.toDate(),
                jam: now.format('HH:mm'),
                posJaga: izinData.posJaga,
                shift: izinData.shift,
                status: 'izin',
                keterangan: izinData.keterangan,
                lokasi: buktiLink,
                buktiFoto: imgUrl,
            });
            const izinTersimpan = await izinBaru.save();
            const karyawan = await Karyawan.findById(izinData.karyawanId);
            getIO().emit('absensi_baru', {
                _id: izinTersimpan._id,
                karyawan: { _id: karyawan._id, nama: karyawan.nama },
                nomorHp: izinTersimpan.nomorHp,
                tanggal: izinTersimpan.tanggal,
                jam: izinTersimpan.jam,
                posJaga: izinTersimpan.posJaga,
                shift: izinTersimpan.shift,
                status: izinTersimpan.status,
                keterangan: izinTersimpan.keterangan,
                lokasi: izinTersimpan.lokasi,
                buktiFoto: izinTersimpan.buktiFoto
            });
            await sock.sendMessage(sender, { text: `*${karyawan.nama}*, pengajuan izin kamu telah dicatat:\n\n*Nama:* ${karyawan.nama}\n*Tanggal:* ${now.format('DD MMMM YYYY')}\n*Jam:* ${izinTersimpan.jam} WIB\n*Status:* Izin\n*Keterangan:* ${izinTersimpan.keterangan}` }, {"quoted": msg});
        } catch (err) {
            await sock.sendMessage(sender, { text: `Gagal memproses pengajuan izin: ${err.message}` }, {"quoted": msg});
        } finally {
            delete userState[sender];
        }
        return;
      }

      // === FLOW ABSEN MASUK: HANDLE LOKASI ===
      if (msg.message.locationMessage && currentState.stage === 'menunggu_lokasi') {
        try {
          const { degreesLatitude, degreesLongitude } = msg.message.locationMessage;
          const karyawan = await Karyawan.findOne({ nomorWa: nomorHp });
          if (!karyawan) throw new Error('Nomor Anda tidak terdaftar.');
          const posJaga = await PosJaga.findOne({ namaPos: karyawan.pos });
          if (!posJaga) throw new Error('Pos jaga tidak ditemukan.');
          const config = await Config.findOne({ identifier: 'main_config' });
          if (!config) throw new Error('Konfigurasi tidak ditemukan.');
          const posKoordinat = extractLatLonFromLink(posJaga.lokasiPos);
          const userKoordinat = { lat: degreesLatitude, lon: degreesLongitude };
          const jarak = getDistance(posKoordinat, userKoordinat);
          if (jarak > config.radiusAbsensi) {
            delete userState[sender];
            throw new Error(`Anda berada ${Math.round(jarak)} meter dari pos. Batas: ${config.radiusAbsensi} meter.`);
          }
          let keteranganAbsen;
          const shiftConfig = config[`shift${karyawan.shift.charAt(0).toUpperCase() + karyawan.shift.slice(1).toLowerCase()}`];
          const [jamMasuk, menitMasuk] = shiftConfig.jamMasuk.split(':').map(Number);
          const now = moment().tz('Asia/Jakarta');
          const waktuMasukShift = now.clone().set({ hour: jamMasuk, minute: menitMasuk, second: 0 });
          const selisihMenit = now.diff(waktuMasukShift, 'minutes');
          if (selisihMenit > 0) {
            keteranganAbsen = `Terlambat ${selisihMenit} menit (jarak ${Math.round(jarak)}m)`;
          } else {
            keteranganAbsen = `Tepat waktu (jarak ${Math.round(jarak)}m)`;
          }
          const mapsLink = `https://maps.google.com/?q=${degreesLatitude},${degreesLongitude}`;
          userState[sender] = {
            ...currentState,
            stage: 'menunggu_foto',
            karyawanId: karyawan._id,
            nomorHp: karyawan.nomorWa,
            posJaga: karyawan.pos,
            shift: karyawan.shift,
            keterangan: keteranganAbsen,
            lokasi: mapsLink
          };
          await sock.sendMessage(sender, { text: `Lokasi dalam radius *(${Math.round(jarak)}m)*.\nSilakan kirim *foto selfie* untuk verifikasi.` }, {"quoted": msg});
        } catch (err) {
          delete userState[sender];
          await sock.sendMessage(sender, { text: `${err.message}` }, {"quoted": msg});
        }
        return;
      }

      // === FLOW ABSEN PULANG: HANDLE LOKASI ===
      if (msg.message.locationMessage && currentState.stage === 'pulang_menunggu_lokasi') {
        try {
            const karyawan = await Karyawan.findOne({ nomorWa: nomorHp }).lean();
            const posJaga = await PosJaga.findOne({ namaPos: karyawan.pos }).lean();
            const config = await Config.findOne({ identifier: 'main_config' }).lean();
            const posKoordinat = extractLatLonFromLink(posJaga.lokasiPos);
            const userKoordinat = { lat: msg.message.locationMessage.degreesLatitude, lon: msg.message.locationMessage.degreesLongitude };
            const jarak = getDistance(posKoordinat, userKoordinat);
            if (jarak > config.radiusAbsensi) {
                delete userState[sender];
                return await sock.sendMessage(sender, { text: `Kamu berada *${Math.round(jarak)}* meter dari lokasi pos. Silakan kembali ke pos tugas lalu absen kembali!` }, {"quoted": msg});
            }
            currentState.jarak = Math.round(jarak);
            currentState.lokasi = `https://maps.google.com/?q=${msg.message.locationMessage.degreesLatitude},${msg.message.locationMessage.degreesLongitude}`;
            currentState.stage = 'pulang_menunggu_foto';
            await sock.sendMessage(sender, { text: 'Lokasi terverifikasi.\n\nSilakan kirim *foto selfie* Anda sebagai bukti.' }, {"quoted": msg});
        } catch (err) {
            delete userState[sender];
            await sock.sendMessage(sender, { text: `Terjadi error: ${err.message}` });
        }
        return;
      }

      // === FLOW ABSEN PULANG: HANDLE FOTO ===
      if (msg.message.imageMessage && currentState.stage === 'pulang_menunggu_foto') {
        try {
            const { jarak, lokasi } = currentState;
            const buffer = await downloadMediaMessage(msg, "buffer", {});
            const base64 = buffer.toString('base64');
            const imgUrl = await uploadToImgur(base64);
            const now = moment().tz('Asia/Jakarta');
            const karyawan = await Karyawan.findOne({ nomorWa: nomorHp });
            const config = await Config.findOne({ identifier: 'main_config' });
            let keteranganPulang;
            const shiftConfig = config[`shift${karyawan.shift.charAt(0).toUpperCase() + karyawan.shift.slice(1).toLowerCase()}`];
            const [jamKeluar, menitKeluar] = shiftConfig.jamKeluar.split(':').map(Number);
            const waktuKeluarShift = now.clone().set({ hour: jamKeluar, minute: menitKeluar });
            const selisihMenit = now.diff(waktuKeluarShift, 'minutes');
            if (selisihMenit > 0) {
                keteranganPulang = `Lembur ${selisihMenit} menit (jarak ${jarak}m)`;
            } else {
                keteranganPulang = `Pulang tepat waktu (jarak ${jarak}m)`;
            }
            const lokasiLink = `<a href="${lokasi}" target="_blank" class="text-blue-500 hover:underline">Lihat lokasi</a>`;
            const buktiLink = `<a href="${imgUrl}" target="_blank" class="text-blue-500 hover:underline">Lihat bukti</a>`;
            const lokasiGabungan = `${lokasiLink} | ${buktiLink}`;
            const absensiPulangBaru = new Absensi({
                karyawan: karyawan._id,
                nomorHp: karyawan.nomorWa,
                tanggal: now.toDate(),
                jam: now.format('HH:mm'),
                posJaga: karyawan.pos,
                shift: karyawan.shift,
                status: 'pulang',
                keterangan: keteranganPulang,
                lokasi: lokasiGabungan,
                buktiFoto: imgUrl,
            });
            const absensiTersimpan = await absensiPulangBaru.save();
            getIO().emit('absensi_baru', {
                _id: absensiTersimpan._id,
                karyawan: { _id: karyawan._id, nama: karyawan.nama },
                nomorHp: absensiTersimpan.nomorHp,
                tanggal: absensiTersimpan.tanggal,
                jam: absensiTersimpan.jam,
                posJaga: absensiTersimpan.posJaga,
                shift: absensiTersimpan.shift,
                status: absensiTersimpan.status,
                keterangan: absensiTersimpan.keterangan,
                lokasi: absensiTersimpan.lokasi,
                buktiFoto: absensiTersimpan.buktiFoto
            });
            await sock.sendMessage(sender, { text: `*Absen Pulang Berhasil!*\n\nTerima kasih *${karyawan.nama}*, selamat beristirahat.\n\n*Jam Pulang:* ${absensiTersimpan.jam} WIB\n*Keterangan:* ${keteranganPulang}` }, {"quoted": msg});
        } catch (err) {
            await sock.sendMessage(sender, { text: `Gagal memproses foto pulang: ${err.message}` }, {"quoted": msg});
        } finally {
            delete userState[sender];
        }
        return;
      }

      // === HANDLE PERINTAH TEKS ===
      if (!text) return;
      const config = await Config.findOne({ identifier: 'main_config' });
      const grupTerdaftar = config?.grupAbsensiId;
      
      if (!isGroup) {
        return await sock.sendMessage(sender, { text: '❌ Bot ini hanya bisa digunakan di dalam grup yang telah ditentukan.' }, { quoted: msg });
      }
      
      if (grupTerdaftar && sender !== grupTerdaftar) {
        return await sock.sendMessage(sender, { text: '❌ Grup ini tidak terdaftar sebagai grup absensi.' }, { quoted: msg });
      }
      
      const command = text.split(' ')[0];

      if (command === '!hadir' || command === '!masuk') {
        await handleHadirCommand({ sock, sender, nomorHp, userState, msg });
      } else if (command === '!pulang' || command === '!keluar') {
        await handleOutCommand({ sock, sender, nomorHp, userState, msg });
      } else if (command === '!setgrup') {
        await handleSetGroupCommand({ sock, msg });
      } else if (command === '!izin') {
        await handleIzinCommand({ sock, sender, nomorHp, text, userState, msg });
      }

    } catch (error) {
      console.error("Error saat proses pesan:", error);
    }
  });
}

startBot();
