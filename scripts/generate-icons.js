import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const iconsDir = join(rootDir, 'static', 'icons');

const svgBuffer = readFileSync(join(iconsDir, 'icon.svg'));

// Standard icons
await sharp(svgBuffer).resize(192, 192).png().toFile(join(iconsDir, 'icon-192.png'));
await sharp(svgBuffer).resize(512, 512).png().toFile(join(iconsDir, 'icon-512.png'));
await sharp(svgBuffer).resize(180, 180).png().toFile(join(iconsDir, 'apple-touch-icon.png'));

// Maskable icon with padding (80% of canvas, centered)
const maskableSize = 512;
const innerSize = Math.round(maskableSize * 0.8);
const offset = Math.round((maskableSize - innerSize) / 2);

const innerIcon = await sharp(svgBuffer).resize(innerSize, innerSize).png().toBuffer();
await sharp({
  create: {
    width: maskableSize,
    height: maskableSize,
    channels: 4,
    background: { r: 59, g: 130, b: 246, alpha: 1 }
  }
})
  .composite([{ input: innerIcon, left: offset, top: offset }])
  .png()
  .toFile(join(iconsDir, 'icon-512-maskable.png'));

console.log('Icons generated successfully!');
