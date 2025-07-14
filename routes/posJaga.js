// routes/posJaga.js
const express = require('express');
const router = express.Router();
const PosJaga = require('../models/PosJaga');

// --- FUNGSI HELPER UNTUK EKSTRAK KOORDINAT ---
function extractCoordsFromUrl(url) {
    if (!url) return null;
    const regex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
    const match = url.match(regex);
    if (match && match[1] && match[2]) {
        return { lat: match[1], lon: match[2] };
    }
    return null;
}

// =========================================================
// === GET: Mengambil semua pos jaga (INI PERBAIKANNYA) ===
// =========================================================
router.get('/', async (req, res) => {
    try {
        const semuaPos = await PosJaga.find(); // Ambil semua data dari model PosJaga
        res.json(semuaPos); // Kirim data sebagai respons JSON
    } catch (err) {
        console.error("Error saat mengambil data Pos Jaga:", err);
        res.status(500).json({ message: "Terjadi kesalahan pada server" });
    }
});
// =========================================================

// POST: Membuat pos jaga baru
router.post('/', async (req, res) => {
    const { namaPos, lokasiPos, statusPos } = req.body;
    const koordinat = extractCoordsFromUrl(lokasiPos);

    if (lokasiPos && lokasiPos.includes('google.com/maps') && !koordinat) {
        return res.status(400).json({ message: 'Format URL Google Maps tidak valid atau tidak mengandung koordinat.' });
    }

    const posJaga = new PosJaga({
        namaPos,
        lokasiPos,
        statusPos,
        koordinat
    });

    try {
        const newPosJaga = await posJaga.save();
        res.status(201).json(newPosJaga);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// PUT: Memperbarui pos jaga
router.put('/:id', async (req, res) => {
    const { lokasiPos } = req.body;
    let updateData = req.body;

    if (lokasiPos) {
        const koordinat = extractCoordsFromUrl(lokasiPos);
        if (lokasiPos.includes('google.com/maps') && !koordinat) {
            return res.status(400).json({ message: 'Format URL Google Maps tidak valid atau tidak mengandung koordinat.' });
        }
        updateData.koordinat = koordinat;
    }

    try {
        const updatedPosJaga = await PosJaga.findByIdAndUpdate(req.params.id, updateData, { new: true });
        if (!updatedPosJaga) return res.status(404).json({ message: 'Pos tidak ditemukan' });
        res.json(updatedPosJaga);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// DELETE: Menghapus pos jaga
router.delete('/:id', async (req, res) => {
    try {
        const deletedPosJaga = await PosJaga.findByIdAndDelete(req.params.id);
        if (!deletedPosJaga) return res.status(404).json({ message: 'Pos tidak ditemukan' });
        res.json({ message: 'Pos jaga berhasil dihapus' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
