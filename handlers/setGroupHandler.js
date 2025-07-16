const Config = require('../models/Config');

/**
 * Menangani perintah !setgrup untuk menyimpan ID grup.
 */
async function handleSetGroupCommand({ sock, msg }) {
    const groupId = msg.key.remoteJid;

    // Pastikan ini benar-benar dari grup
    if (!groupId.endsWith('@g.us')) {
        return await sock.sendMessage(msg.key.remoteJid, {
            text: '❌ Perintah ini hanya bisa dijalankan di dalam grup.'
        }, { quoted: msg });
    }

    try {
        const groupMeta = await sock.groupMetadata(groupId);
        const senderId = msg.key.participant;

        const participant = groupMeta.participants.find(p => p.id === senderId);
        const isAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';

        if (!isAdmin) {
            return await sock.sendMessage(groupId, {
                text: '❌ Perintah ini hanya bisa dijalankan oleh *admin grup*.'
            }, { quoted: msg });
        }

        // Simpan ID grup ke konfigurasi
        await Config.findOneAndUpdate(
            { identifier: 'main_config' },
            { grupAbsensiId: groupId },
            { upsert: true, new: true }
        );

        await sock.sendMessage(groupId, {
            text: '✅ Berhasil! Grup ini telah ditetapkan sebagai *grup absensi*.'
        }, { quoted: msg });

        console.log(`✅ Grup Absensi Disimpan: ${groupId}`);

    } catch (err) {
        console.error("❌ Error pada !setgrup:", err);
        await sock.sendMessage(groupId, {
            text: '❌ Terjadi kesalahan saat mengatur grup.'
        }, { quoted: msg });
    }
}
module.exports = handleSetGroupCommand;