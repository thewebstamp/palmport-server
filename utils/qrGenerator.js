import QRCode from 'qrcode';
import dotenv from 'dotenv';
dotenv.config();

export async function generateQrDataUrl(batchPath) {
  // batchPath is like '/batches/palm-2501-lg' or full URL
  const base = process.env.APP_BASE_URL || 'http://localhost:3000';
  const fullUrl = batchPath.startsWith('http') ? batchPath : `${base}${batchPath}`;
  // returns base64 data URL
  const dataUrl = await QRCode.toDataURL(fullUrl, { errorCorrectionLevel: 'H' });
  return { fullUrl, dataUrl };
}

// optionally save to file on disk
export async function generateQrToFile(fullUrl, outputPath) {
  return new Promise((resolve, reject) => {
    QRCode.toFile(outputPath, fullUrl, { errorCorrectionLevel: 'H' }, function (err) {
      if (err) reject(err);
      else resolve(outputPath);
    });
  });
}
