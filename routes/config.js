// routes/config.js
const express = require('express');
const router = express.Router();
const Config = require('../models/Config');

// GET: Mengambil konfigurasi
router.get('/', async (req, res) => {
    try {
        let config = await Config.findOne({ identifier: 'main_config' });

        if (!config) {
            // Jika tidak ada config, buat dokumen baru.
            // Nilai default akan otomatis diambil dari skema di models/Config.js
            console.log('Tidak ada konfigurasi, membuat data default...');
            config = new Config(); // Cukup panggil constructor kosong
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
        const configData = req.body; // Menerima data dengan struktur baru { jamKerja: {...} }
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
