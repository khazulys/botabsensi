// handlers/setGroupHandler.js (VERSI FINAL MULTI-GRUP)

const Config = require('../models/Config');

async function handleSetGroupCommand({ sock, msg }) {
    const groupId = msg.key.remoteJid;

    if (!groupId.endsWith('@g.us')) {
        return await sock.sendMessage(msg.key.remoteJid, { text: '❌ Perintah ini hanya bisa dijalankan di dalam grup.' }, { quoted: msg });
    }

    try {
        const groupMeta = await sock.groupMetadata(groupId);
        const senderId = msg.key.participant;
        const participant = groupMeta.participants.find(p => p.id === senderId);
        const isAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';

        if (!isAdmin) {
            return await sock.sendMessage(groupId, { text: '❌ Perintah ini hanya bisa dijalankan oleh *admin grup*.' }, { quoted: msg });
        }

        // Gunakan $addToSet untuk MENAMBAHKAN ID grup ke array 'activeGroups'
        // $addToSet mencegah duplikat, jadi aman dijalankan berkali-kali.
        await Config.findOneAndUpdate(
            { identifier: 'main_config' },
            { $addToSet: { activeGroups: groupId } },
            { upsert: true, new: true }
        );

        await sock.sendMessage(groupId, {
            text: '✅ Berhasil! Grup ini telah ditambahkan ke daftar grup aktif untuk absensi.'
        }, { quoted: msg });

        console.log(`✅ Grup Aktif Ditambahkan: ${groupId}`);

    } catch (err) {
        console.error("❌ Error pada !setgrup:", err);
        await sock.sendMessage(groupId, { text: '❌ Terjadi kesalahan saat mengatur grup.' }, { quoted: msg });
    }
}

module.exports = handleSetGroupCommand;
