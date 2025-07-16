const moment = require('moment-timezone');

/**
 * Ambil moment waktu masuk shift sesuai zona dan tanggal yang tepat (besok jika jam masuk < jam sekarang).
 */
function getJamMasukMoment(jamMasukStr, zona = 'Asia/Makassar') {
  const now = moment().tz(zona);
  let target = moment.tz(`${now.format('YYYY-MM-DD')} ${jamMasukStr}`, 'YYYY-MM-DD HH:mm', zona);

  // Jika jam masuk lebih awal dari jam sekarang (misal jamMasuk 00:00 dan sekarang 23:00), berarti shift besok
  if (target.isBefore(now.clone().subtract(29, 'minutes'))) {
    target.add(1, 'day');
  }

  return target;
}

module.exports = { getJamMasukMoment };