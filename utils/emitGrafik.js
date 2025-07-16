// utils/emitGrafik.js
const Absensi = require('../models/Absensi');
const moment = require('moment-timezone');

async function emitGrafik(io) {
    const hariTerakhir = 5;
    const startDate = moment().tz('Asia/Makassar').subtract(hariTerakhir, 'days').startOf('day').toDate();

    const hasil = await Absensi.aggregate([
        {
            $match: {
                status: 'hadir',
                tanggal: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: {
                    $dateToString: { format: "%d %b", date: "$tanggal" }
                },
                totalHadir: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    const labels = hasil.map(item => item._id);
    const data = hasil.map(item => item.totalHadir);

    io.emit('update_grafik', { labels, data });
}

module.exports = emitGrafik;