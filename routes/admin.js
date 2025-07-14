// routes/admin.js
const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const bcrypt = require('bcryptjs');


// POST /api/admin/login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password)
        return res.status(400).json({ message: 'Username dan password harus diisi.' });

    try {
        const admin = await Admin.findOne({ username });
        if (!admin) return res.status(401).json({ message: 'Username tidak ditemukan.' });

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) return res.status(401).json({ message: 'Password salah.' });

        // Sukses login
        res.json({ message: 'Login berhasil.' });
    } catch (err) {
        res.status(500).json({ message: 'Terjadi kesalahan server.' });
    }
});

// GET: Mengambil semua admin
router.get('/', async (req, res) => {
    try {
        // Ambil semua admin, jangan tampilkan password
        const admins = await Admin.find().select('-password').sort({ createdAt: -1 });
        res.json(admins);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST: Membuat admin baru
router.post('/', async (req, res) => {
    const { nama, username, password } = req.body;

    if (!nama || !username || !password) {
        return res.status(400).json({ message: 'Semua field harus diisi' });
    }
    
    console.log('Menerima data untuk admin baru:', req.body);
    
    try {
        const newAdmin = new Admin({ nama, username, password });
        await newAdmin.save();
        res.status(201).json({ message: 'Admin baru berhasil dibuat' });
    } catch (err) {
        // Tangani error jika username sudah ada
        if (err.code === 11000) {
            return res.status(400).json({ message: 'Username sudah digunakan.' });
        }
        res.status(500).json({ message: err.message });
    }
});


// Anda bisa menambahkan rute PUT dan DELETE di sini nanti
// GET: Mengambil satu admin berdasarkan ID (tanpa password)
router.get('/:id', async (req, res) => {
    try {
        const admin = await Admin.findById(req.params.id).select('-password');
        if (!admin) return res.status(404).json({ message: 'Admin tidak ditemukan' });
        res.json(admin);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// PUT: Memperbarui data admin berdasarkan ID
router.put('/:id', async (req, res) => {
    const { nama, username, password } = req.body;
    let updateData = { nama, username };

    try {
        // Jika ada password baru yang dikirim, hash password tersebut
        if (password && password.length > 0) {
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(password, salt);
        }

        const updatedAdmin = await Admin.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        ).select('-password');

        if (!updatedAdmin) {
            return res.status(404).json({ message: 'Admin tidak ditemukan' });
        }

        res.json(updatedAdmin);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// DELETE: Menghapus admin berdasarkan ID
router.delete('/:id', async (req, res) => {
    try {
        const deletedAdmin = await Admin.findByIdAndDelete(req.params.id);
        if (!deletedAdmin) {
            return res.status(404).json({ message: 'Admin tidak ditemukan' });
        }
        res.json({ message: 'Admin berhasil dihapus' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
