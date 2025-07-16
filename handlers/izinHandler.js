// handlers/izinHandler.js

const moment = require('moment-timezone');
const Karyawan = require('../models/Karyawan');
const Absensi = require('../models/Absensi');

/**
 * Menangani perintah !izin dari pengguna.
 * @param {object} params - Parameter yang dibutuhkan.
 * @param {import('@whiskeysockets/baileys').WASocket} params.sock - Socket Baileys.
 * @param {string} params.sender - JID pengirim.
 * @param {string} params.nomorHp - Nomor HP pengirim.
 * @param {string} params.text - Teks pesan.
 * @param {object} params.userState - Objek state pengguna.
 */
async function handleIzinCommand({ sock, sender, nomorHp, text, userState, msg }) {
  try {
    // 1. Ekstrak keterangan dari pesan
    const args = text.split(' ');
    if (args.length < 2) {
      await sock.sendMessage(sender, { text: 'Format salah. Gunakan: `!izin <alasan>`\n\nContoh: `!izin sakit demam`' }, {"quoted": msg});
      return;
    }
    const keterangan = args.slice(1).join(' ');

    // 2. Cek apakah karyawan terdaftar di database
    const karyawan = await Karyawan.findOne({ nomorWa: nomorHp }).lean();
    if (!karyawan) {
      await sock.sendMessage(sender, { text: 'Halo, mohon maaf Nama kamu tidak terdaftar sebagai karyawan, silahkan hubungi atasan kamu' }, {"quoted": msg});
      return;
    }

    // 3. Cek apakah sudah ada absensi untuk hari ini
    const today = moment().tz('Asia/Makassar').startOf('day');
    const tomorrow = moment(today).add(1, 'days');

    const absensiHariIni = await Absensi.findOne({
      karyawan: karyawan._id,
      tanggal: {
        $gte: today.toDate(),
        $lt: tomorrow.toDate(),
      },
    });

    if (absensiHariIni) {
      await sock.sendMessage(sender, { text: `Anda sudah tercatat *${absensiHariIni.status}* hari ini pada jam ${absensiHariIni.jam}.` }, {"quoted": msg});
      return;
    }

    // 4. Atur state pengguna untuk menunggu bukti foto (shift dihilangkan)
    userState[sender] = {
      stage: 'menunggu_bukti_izin',
      karyawanId: karyawan._id,
      nomorHp: karyawan.nomorWa,
      posJaga: karyawan.pos,
      // shift: karyawan.shift, // <-- Baris ini dihapus
      keterangan: keterangan,
    };

    await sock.sendMessage(sender, {
      text: `Permintaan izin diterima dengan keterangan: *${keterangan}*.\n\nSilakan kirim *foto surat sakit* atau *surat izin resmi* sebagai bukti.`
    }, {"quoted": msg});

  } catch (error) {
    console.error('Error in handleIzinCommand:', error);
    await sock.sendMessage(sender, { text: 'Terjadi kesalahan saat memproses permintaan izin.' }, {"quoted": msg});
  }
}

module.exports = handleIzinCommand;

