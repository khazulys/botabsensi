// utils/uploadImgur.js
const imgurUploader = require('imgur-uploader');

async function uploadToImgur(base64Image) {
  try {
    const buffer = Buffer.from(base64Image, 'base64');
    const result = await imgurUploader(buffer, {
      title: 'Absensi Foto',
      description: 'Foto selfie absensi'
    });

    return result.link; // => https://i.imgur.com/xxxx.jpg
  } catch (error) {
    throw new Error('Gagal upload ke Imgur: ' + error.message);
  }
}

module.exports = uploadToImgur;