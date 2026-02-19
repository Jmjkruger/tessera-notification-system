const QRCode = require('qrcode');

/**
 * Generate a QR code as a base64-encoded data URL (PNG).
 * The data URL can be embedded directly in HTML img src.
 */
async function generateQR(data) {
  return QRCode.toDataURL(data, {
    width: 200,
    margin: 2,
    color: { dark: '#1f2937', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  });
}

module.exports = { generateQR };
