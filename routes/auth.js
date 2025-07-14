const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const bcrypt = require('bcryptjs');

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  const admin = await Admin.findOne({ username });
  if (!admin) return res.status(401).json({ message: 'Username tidak ditemukan' });

  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) return res.status(401).json({ message: 'Password salah' });

  req.session.user = {
    username: admin.username,
    nama: admin.nama
  };

  res.json({ message: 'Login berhasil', username: admin.username });
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid'); // <--- Tambahan penting
    res.redirect('/');
  });
});

module.exports = router;