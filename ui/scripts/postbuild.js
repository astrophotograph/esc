#!/usr/bin/env node

/**
 * Post-build script to copy static files for standalone Next.js deployment
 */

const fs = require('fs');
const path = require('path');

console.log('📦 Preparing standalone build...');

const rootDir = path.join(__dirname, '..');
const standaloneDir = path.join(rootDir, '.next', 'standalone');

// Check if standalone directory exists
if (!fs.existsSync(standaloneDir)) {
  console.error('❌ Standalone directory not found. Make sure to run "next build" first.');
  process.exit(1);
}

// Copy static files
const staticSource = path.join(rootDir, '.next', 'static');
const staticDest = path.join(standaloneDir, '.next', 'static');

if (fs.existsSync(staticSource)) {
  console.log('📋 Copying static files...');
  copyFolderRecursive(staticSource, staticDest);
  console.log('✅ Static files copied');
} else {
  console.warn('⚠️  No static files found');
}

// Copy public folder if it exists and is not already there
const publicSource = path.join(rootDir, 'public');
const publicDest = path.join(standaloneDir, 'public');

if (fs.existsSync(publicSource) && !fs.existsSync(publicDest)) {
  console.log('📋 Copying public folder...');
  copyFolderRecursive(publicSource, publicDest);
  console.log('✅ Public folder copied');
}

console.log('✨ Standalone build ready!');
console.log('');
console.log('To start the server:');
console.log('  cd .next/standalone');
console.log('  node server.js');
console.log('');
console.log('Or use: npm start');

// Helper function to copy folder recursively
function copyFolderRecursive(source, target) {
  // Create target folder if it doesn't exist
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  // Read source directory
  const files = fs.readdirSync(source);

  files.forEach(file => {
    const sourcePath = path.join(source, file);
    const targetPath = path.join(target, file);

    if (fs.lstatSync(sourcePath).isDirectory()) {
      // Recursively copy subdirectories
      copyFolderRecursive(sourcePath, targetPath);
    } else {
      // Copy file
      fs.copyFileSync(sourcePath, targetPath);
    }
  });
}