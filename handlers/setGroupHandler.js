const Config = require('../models/Config');

/**
 * Menangani perintah !setgrup untuk menyimpan ID grup.
 * @param {object} params
 * @param {object} params.sock - Instance socket Baileys.
 * @param {object} params.msg - Objek pesan lengkap dari Baileys.
 */
async function handleSetGroupCommand({ sock, msg }) {
    const sender = msg.key.participant || msg.key.remoteJid;
    const groupId = msg.key.remoteJid;

    // 1. Pastikan perintah dijalankan di dalam grup
    if (!groupId.endsWith('@g.us')) {
        return await sock.sendMessage(sender, { text: 'Perintah ini hanya bisa digunakan di dalam grup.' }, {"quoted": msg});
    }

    try {
        // 2. Cek apakah pengirim adalah admin grup
        const groupMeta = await sock.groupMetadata(groupId);
        const participant = groupMeta.participants.find(p => p.id === sender);
        
        if (!participant || (participant.admin !== 'admin' && participant.admin !== 'superadmin')) {
             return await sock.sendMessage(groupId, { text: 'Perintah ini hanya bisa digunakan oleh admin grup.' }, {"quoted": msg});
        }

        // 3. Simpan ID grup ke database
        await Config.findOneAndUpdate(
            { identifier: 'main_config' },
            { grupAbsensiId: groupId },
            { upsert: true, new: true } // Buat jika belum ada, atau update jika sudah ada
        );

        await sock.sendMessage(groupId, { text: 'Berhasil! Grup ini telah ditetapkan sebagai grup absensi.' }, {"quoted": msg});

    } catch (err) {
        console.error("Error pada !setgrup:", err);
        await sock.sendMessage(groupId, { text: 'Terjadi kesalahan saat mengatur grup.' }, {"quoted": msg});
    }
}

module.exports = handleSetGroupCommand;
