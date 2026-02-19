const QRCode = require('qrcode');

/**
 * Generate a QR code as a base64 string (PNG, no data URL prefix).
 * Used as a CID inline attachment in emails.
 */
async function generateQR(data) {
  const buffer = await QRCode.toBuffer(data, {
    type: 'png',
    width: 200,
    margin: 2,
    color: { dark: '#1f2937', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  });
  return buffer.toString('base64');
}

module.exports = { generateQR };
