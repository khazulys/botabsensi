const moment = require('moment-timezone');
const Karyawan = require('../models/Karyawan');
const Absensi = require('../models/Absensi');

async function handleIzinCommand({ sock, groupJid, userJid, nomorHp, text, userState, msg }) {
  try {
    const karyawan = await Karyawan.findOne({ nomorWa: nomorHp }).lean();
    if (!karyawan) {
      return await sock.sendMessage(groupJid, { text: 'Nomor Anda tidak terdaftar sebagai karyawan.' }, { "quoted": msg });
    }

    const todayStart = moment().tz('Asia/Makassar').startOf('day').toDate();
    const todayEnd = moment().tz('Asia/Makassar').endOf('day').toDate();

    const absensiHariIni = await Absensi.findOne({
      karyawan: karyawan._id,
      tanggal: { $gte: todayStart, $lt: todayEnd },
    });

    if (absensiHariIni) {
        if (absensiHariIni.status === 'alpha') {
            return await sock.sendMessage(groupJid, { text: `Anda tidak dapat mengajukan izin karena status Anda hari ini sudah tercatat *Alpha*.` }, { "quoted": msg });
        }
        return await sock.sendMessage(groupJid, { text: `Anda sudah tercatat *${absensiHariIni.status}* hari ini.` }, { "quoted": msg });
    }
    
    const args = text.split(' ');
    if (args.length < 2) {
      await sock.sendMessage(groupJid, { text: 'Format salah. Gunakan: `!izin <alasan>`\n\nContoh: `!izin sakit demam`' }, { "quoted": msg });
      return;
    }
    const keterangan = args.slice(1).join(' ');

    userState[userJid] = {
      stage: 'menunggu_bukti_izin',
      karyawanId: karyawan._id,
      keterangan: keterangan,
    };

    await sock.sendMessage(groupJid, {
      text: `Permintaan izin diterima dengan keterangan: *${keterangan}*.\n\nSilakan kirim *foto surat sakit* atau *surat izin resmi* sebagai bukti.`
    }, { "quoted": msg });

  } catch (error) {
    console.error('Error in handleIzinCommand:', error);
    await sock.sendMessage(groupJid, { text: 'Terjadi kesalahan saat memproses permintaan izin.' }, { "quoted": msg });
  }
}

module.exports = handleIzinCommand;
