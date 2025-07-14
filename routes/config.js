// routes/config.js
const express = require('express');
const router = express.Router();
const Config = require('../models/Config');

// GET: Mengambil konfigurasi
router.get('/', async (req, res) => {
    try {
        let config = await Config.findOne({ identifier: 'main_config' });
        if (!config) {
            // Jika tidak ada config, buat dan simpan data default
            config = new Config({
                shiftPagi: { aktif: true, jamMasuk: '06:00', jamKeluar: '14:00' },
                shiftSiang: { aktif: true, jamMasuk: '14:00', jamKeluar: '22:00' },
                shiftMalam: { aktif: true, jamMasuk: '22:00', jamKeluar: '06:00' },
                toleransiKeterlambatan: 15,
                radiusAbsensi: 100,
            });
            await config.save();
        }
        res.json(config);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST: Menyimpan atau Memperbarui konfigurasi
router.post('/', async (req, res) => {
    try {
        const configData = req.body;
        const updatedConfig = await Config.findOneAndUpdate(
            { identifier: 'main_config' },
            configData,
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        res.status(200).json(updatedConfig);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

module.exports = router;
