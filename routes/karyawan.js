const express = require('express');
const router = express.Router();
const Karyawan = require('../models/Karyawan');

// Rute untuk GET: Mengambil semua data karyawan
router.get('/', async (req, res) => {
    try {
        const karyawan = await Karyawan.find().sort({ createdAt: -1 }); // Tampilkan yang terbaru dulu
        res.json(karyawan);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Rute untuk POST: Menambahkan karyawan baru
router.post('/', async (req, res) => {
    try {
        const { nama, nomorWa, pos, status } = req.body;

        // === CEK DUPLIKAT NOMOR WA ===
        const existing = await Karyawan.findOne({ nomorWa });
        if (existing) {
            return res.status(400).json({ message: '❌ Karyawan dengan nomor WhatsApp ini sudah ada.' });
        }

        // === BUAT KARYAWAN BARU ===
        const karyawan = new Karyawan({
            nama,
            nomorWa,
            pos,
            status
        });

        const newKaryawan = await karyawan.save();
        res.status(201).json(newKaryawan);
    } catch (err) {
        console.error('Gagal menambahkan karyawan:', err);
        res.status(400).json({ message: err.message });
    }
});

// Rute untuk GET single karyawan by ID
router.get('/:id', async (req, res) => {
    try {
        const karyawan = await Karyawan.findById(req.params.id);
        if (!karyawan) return res.status(404).json({ message: 'Karyawan tidak ditemukan' });
        res.json(karyawan);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Rute untuk UPDATE (PUT) karyawan by ID
router.put('/:id', async (req, res) => {
    try {
        const updatedKaryawan = await Karyawan.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true } // Opsi: `new: true` untuk mengembalikan dokumen yang sudah diupdate
                                               // `runValidators: true` untuk menjalankan validasi schema (seperti enum)
        );
        if (!updatedKaryawan) return res.status(404).json({ message: 'Karyawan tidak ditemukan' });
        res.json(updatedKaryawan);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Rute untuk DELETE karyawan by ID
router.delete('/:id', async (req, res) => {
    try {
        const deletedKaryawan = await Karyawan.findByIdAndDelete(req.params.id);
        if (!deletedKaryawan) {
            return res.status(404).json({ message: 'Karyawan tidak ditemukan' });
        }
        res.json({ message: 'Karyawan berhasil dihapus' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
// Anda bisa menambahkan rute DELETE di sini nanti

module.exports = router;
