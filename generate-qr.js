const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { Jimp } = require('jimp');

// Target URL
const url = 'https://www.instagram.com/snaptiqz';
const outputPath = path.join(__dirname, 'snaptiqz-qr.png');
const logoPath = path.join(__dirname, 'logo.png');

// Configuration for high-quality, high-reliability offline QR code
const options = {
  errorCorrectionLevel: 'H', // Must be High (H) to support watermark coverage (up to 30%)
  type: 'png',
  quality: 0.95,
  margin: 2,                 // Standard margin
  width: 1024,               // High resolution (1024x1024 px)
  color: {
    dark: '#000000',         // Black QR blocks
    light: '#FFFFFF'         // Clean white background
  }
};

console.log(`Generating high-resolution base QR code for: ${url}...`);

// Generate base QR code
QRCode.toFile(outputPath, url, options, async (err) => {
  if (err) {
    console.error('Failed to generate base QR code:', err);
    process.exit(1);
  }

  // Check if logo.png exists to apply the watermark
  if (!fs.existsSync(logoPath)) {
    console.log(`Base QR code generated and saved as: ${outputPath}`);
    console.warn(`Warning: logo.png not found. Skipping watermark overlay.`);
    process.exit(0);
  }

  console.log('Base QR code generated. Applying watermark logo...');
  
  try {
    // Read both images
    const qrImage = await Jimp.read(outputPath);
    const logoImage = await Jimp.read(logoPath);

    const qrWidth = qrImage.bitmap.width;
    const qrHeight = qrImage.bitmap.height;

    // Calculate logo watermark size (15% of QR size) and round to integer
    const logoSize = Math.round(qrWidth * 0.15);
    logoImage.resize({ w: logoSize, h: logoSize });

    // Calculate background card size (18% of QR size) and round to integer
    const bgSize = Math.round(qrWidth * 0.18);

    // Create white background box (solid white in RGBA is 0xffffffff)
    const whiteBg = new Jimp({ width: bgSize, height: bgSize, color: 0xffffffff });

    // Paste white background in the center of the QR code
    const bgX = Math.round((qrWidth - bgSize) / 2);
    const bgY = Math.round((qrHeight - bgSize) / 2);
    qrImage.composite(whiteBg, bgX, bgY);

    // Paste resized logo in the center of the QR code
    const logoX = Math.round((qrWidth - logoSize) / 2);
    const logoY = Math.round((qrHeight - logoSize) / 2);
    qrImage.composite(logoImage, logoX, logoY);

    // Save final watermarked QR code
    await qrImage.write(outputPath);
    console.log(`Success! Watermarked QR code saved at: ${outputPath}`);

  } catch (error) {
    console.error('Failed to apply watermark logo:', error);
    process.exit(1);
  }
});
