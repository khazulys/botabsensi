const fs = require('fs');
const path = require('path');

// --- KONFIGURASI ---
const direktoriAwal = '.'; // Mulai dari folder saat ini
const timezoneLama = 'Asia/Makassar';
const timezoneBaru = 'Asia/Makassar';
// Tambahkan ekstensi file lain jika perlu, misal: '.css', '.json'
const ekstensiFileTarget = ['.js', '.html', '.txt']; 
// Folder yang ingin diabaikan
const folderAbaikan = ['node_modules', '.git', 'logs'];

let fileDiubah = 0;

/**
 * Fungsi untuk mencari dan mengganti string di dalam file secara rekursif.
 * @param {string} direktoriSaatIni - Path direktori yang sedang diproses.
 */
function cariDanGanti(direktoriSaatIni) {
    const files = fs.readdirSync(direktoriSaatIni);

    for (const file of files) {
        const pathLengkap = path.join(direktoriSaatIni, file);

        // Abaikan folder yang ada di daftar 'folderAbaikan'
        if (folderAbaikan.includes(file)) {
            continue;
        }

        const status = fs.statSync(pathLengkap);

        if (status.isDirectory()) {
            // Jika ini adalah direktori, masuk ke dalamnya (rekursif)
            cariDanGanti(pathLengkap);
        } else if (ekstensiFileTarget.includes(path.extname(pathLengkap))) {
            // Jika ini adalah file dengan ekstensi yang sesuai, proses file tersebut
            prosesFile(pathLengkap);
        }
    }
}

/**
 * Membaca file, mengganti konten, dan menulisnya kembali.
 * @param {string} pathFile - Path lengkap ke file yang akan diproses.
 */
function prosesFile(pathFile) {
    try {
        let konten = fs.readFileSync(pathFile, 'utf8');

        // Cek apakah file berisi timezone lama untuk menghindari penulisan yang tidak perlu
        if (konten.includes(timezoneLama)) {
            // Ganti semua kemunculan timezone lama dengan yang baru
            const kontenBaru = konten.replace(new RegExp(timezoneLama, 'g'), timezoneBaru);
            
            fs.writeFileSync(pathFile, kontenBaru, 'utf8');
            console.log(`✅ Diubah: ${pathFile}`);
            fileDiubah++;
        }
    } catch (err) {
        console.error(`❌ Gagal memproses file ${pathFile}:`, err);
    }
}

// --- Mulai Proses ---
console.log(`Mencari "${timezoneLama}" dan menggantinya dengan "${timezoneBaru}"...`);
cariDanGanti(direktoriAwal);
console.log(`\nSelesai! Total ${fileDiubah} file telah berhasil diubah.`);

