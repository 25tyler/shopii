import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logoPath = path.join(__dirname, '../../Shopii Logo.png');
const outputDir = path.join(__dirname, '../public/icon');

const sizes = [16, 32, 48, 128];

async function generateIcons() {
  // Check if logo exists
  if (!fs.existsSync(logoPath)) {
    console.error(`Logo not found at: ${logoPath}`);
    process.exit(1);
  }

  console.log(`Using logo from: ${logoPath}`);
  console.log(`Output directory: ${outputDir}`);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate each size
  for (const size of sizes) {
    const outputPath = path.join(outputDir, `${size}.png`);

    try {
      // First, trim the transparent edges to get just the logo
      const trimmed = await sharp(logoPath)
        .trim()
        .toBuffer();

      // Then resize to the target size with padding to center it
      await sharp(trimmed)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png({
          compressionLevel: 9,
          adaptiveFiltering: true,
          force: true
        })
        .toFile(outputPath);

      console.log(`✓ Generated ${size}x${size} icon: ${outputPath}`);
    } catch (error) {
      console.error(`✗ Failed to generate ${size}x${size} icon:`, error.message);
    }
  }

  console.log('\nAll icons generated successfully!');
}

generateIcons().catch(error => {
  console.error('Error generating icons:', error);
  process.exit(1);
});
