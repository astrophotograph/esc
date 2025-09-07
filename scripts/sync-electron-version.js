#!/usr/bin/env node
/**
 * Synchronize Electron app version with UI version
 */

const fs = require('fs');
const path = require('path');

// Read UI package.json
const uiPackagePath = path.join(__dirname, '../ui/package.json');
const electronPackagePath = path.join(__dirname, '../electron/package.json');

try {
  // Read UI version
  const uiPackage = JSON.parse(fs.readFileSync(uiPackagePath, 'utf8'));
  const uiVersion = uiPackage.version;
  
  // Read Electron package
  const electronPackage = JSON.parse(fs.readFileSync(electronPackagePath, 'utf8'));
  
  // Update Electron version
  electronPackage.version = uiVersion;
  
  // Write back to Electron package.json
  fs.writeFileSync(
    electronPackagePath,
    JSON.stringify(electronPackage, null, 2) + '\n',
    'utf8'
  );
  
  console.log(`✅ Synced Electron version to ${uiVersion}`);
  
} catch (error) {
  console.error('❌ Error syncing versions:', error.message);
  process.exit(1);
}