// server.js

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const connectDB = require('./utils/db');
const { initSocket } = require('./utils/socket'); // ← tambah ini
const path = require('path');
connectDB();

const app = express();
const server = http.createServer(app);
const io = initSocket(server); // ← inisialisasi socket
const session = require('express-session');

app.use(session({
  secret: 'khazul0411', // Ganti dengan string rahasia
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 60 } // 1 jam
}));

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// GET: Root
app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, 'login', 'login.html'));
});

// GET: Dashboard
app.get('/dashboard', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Router API
app.use('/auth', require('./routes/auth'));
app.use('/api/karyawan', require('./routes/karyawan'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/posjaga', require('./routes/posJaga'));
app.use('/api/config', require('./routes/config'));
app.use('/api/absensi', require('./routes/absensi'));
app.use('/api/dashboard', require('./routes/dashboard'));

// STATIC FILES (⛔️ HARUS DI AKHIR)
app.use(express.static(path.join(__dirname, 'public')));
// Jalankan server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server berjalan di port http://localhost:${PORT}`);
});
require('./bot');