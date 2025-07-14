// utils/socket.js

let ioInstance = null;

function initSocket(server) {
  const { Server } = require('socket.io');
  ioInstance = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  ioInstance.on('connection', (socket) => {
    console.log('🟢 Socket.IO terhubung:', socket.id);
  });

  return ioInstance;
}

function getIO() {
  if (!ioInstance) {
    throw new Error('Socket.IO belum diinisialisasi. Jalankan initSocket(server) di server.js');
  }
  return ioInstance;
}

module.exports = { initSocket, getIO };