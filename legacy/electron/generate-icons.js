#!/usr/bin/env node

/**
 * Generate all icon sizes from icon.png
 * This is a Node.js version that works cross-platform
 * Requires sharp: npm install sharp
 */

const fs = require('fs');
const path = require('path');

// Check if sharp is available
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.error('Error: sharp is not installed.');
  console.error('Please install it with: npm install sharp');
  process.exit(1);
}

const iconsDir = path.join(__dirname, 'icons');
const sourceIcon = path.join(iconsDir, 'icon.png');

// Check if source icon exists
if (!fs.existsSync(sourceIcon)) {
  console.error('Error: icon.png not found in icons directory');
  process.exit(1);
}

console.log('Generating icon sizes from icon.png...');

// Define the sizes we need
const sizes = [16, 32, 64, 128, 256, 512, 1024];

// Generate icons
async function generateIcons() {
  try {
    for (const size of sizes) {
      const outputPath = path.join(iconsDir, `icon_${size}.png`);
      const outputPath2 = path.join(iconsDir, `icon_${size}x${size}.png`);
      
      console.log(`Creating icon_${size}.png (${size}x${size})...`);
      
      await sharp(sourceIcon)
        .resize(size, size)
        .toFile(outputPath);
      
      // Create duplicate with x notation (except for 1024)
      if (size !== 1024) {
        fs.copyFileSync(outputPath, outputPath2);
      }
    }
    
    // Create icon.iconset directory for macOS
    const iconsetDir = path.join(iconsDir, 'icon.iconset');
    
    console.log('Creating icon.iconset directory...');
    
    // Remove existing iconset directory
    if (fs.existsSync(iconsetDir)) {
      fs.rmSync(iconsetDir, { recursive: true, force: true });
    }
    fs.mkdirSync(iconsetDir, { recursive: true });
    
    // Copy files with correct names for iconutil
    const iconsetFiles = [
      { src: 'icon_16.png', dst: 'icon_16x16.png' },
      { src: 'icon_32.png', dst: 'icon_16x16@2x.png' },
      { src: 'icon_32.png', dst: 'icon_32x32.png' },
      { src: 'icon_64.png', dst: 'icon_32x32@2x.png' },
      { src: 'icon_128.png', dst: 'icon_128x128.png' },
      { src: 'icon_256.png', dst: 'icon_128x128@2x.png' },
      { src: 'icon_256.png', dst: 'icon_256x256.png' },
      { src: 'icon_512.png', dst: 'icon_256x256@2x.png' },
      { src: 'icon_512.png', dst: 'icon_512x512.png' },
      { src: 'icon_1024.png', dst: 'icon_512x512@2x.png' }
    ];
    
    for (const file of iconsetFiles) {
      const srcPath = path.join(iconsDir, file.src);
      const dstPath = path.join(iconsetDir, file.dst);
      fs.copyFileSync(srcPath, dstPath);
    }
    
    console.log('\nIcon generation complete!');
    console.log('\nGenerated files:');
    
    // List generated files
    const files = fs.readdirSync(iconsDir)
      .filter(f => f.startsWith('icon') && f.endsWith('.png'))
      .filter(f => !f.includes('iconset'));
    
    files.forEach(f => {
      const stats = fs.statSync(path.join(iconsDir, f));
      console.log(`  ${f} (${stats.size} bytes)`);
    });
    
    console.log('\nicon.iconset directory created for macOS .icns generation');
    console.log('To generate .icns on macOS, run: iconutil -c icns icons/icon.iconset -o icons/icon.icns');
    
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

// Run the generator
generateIcons();