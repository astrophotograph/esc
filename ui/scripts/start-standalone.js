#!/usr/bin/env node

/**
 * Wrapper script to start Next.js standalone server with proper static file handling
 */

const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const rootDir = path.join(__dirname, '..');
const standaloneDir = path.join(rootDir, '.next', 'standalone');
const serverPath = path.join(standaloneDir, 'server.js');

// Check if standalone server exists
if (!fs.existsSync(serverPath)) {
  console.error('❌ Standalone server not found. Please run "npm run build" first.');
  process.exit(1);
}

// Ensure static files are in place
const staticSource = path.join(rootDir, '.next', 'static');
const staticDest = path.join(standaloneDir, '.next', 'static');

if (fs.existsSync(staticSource) && !fs.existsSync(staticDest)) {
  console.log('📋 Copying static files...');
  require('./postbuild.js');
}

// Set environment variables
process.env.HOSTNAME = process.env.HOSTNAME || 'localhost';
process.env.PORT = process.env.PORT || '3000';

console.log(`🚀 Starting Next.js standalone server...`);
console.log(`   URL: http://${process.env.HOSTNAME}:${process.env.PORT}`);
console.log(`   Node: ${process.version}`);
console.log(`   Memory limit: ${process.env.NODE_OPTIONS || 'default'}`);
console.log('');

// Change to standalone directory
process.chdir(standaloneDir);

// Start the server
const nodeArgs = process.env.NODE_OPTIONS ? process.env.NODE_OPTIONS.split(' ') : [];
const server = spawn('node', [...nodeArgs, 'server.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production'
  }
});

// Handle signals
process.on('SIGTERM', () => {
  console.log('\n⏹️  Stopping server...');
  server.kill('SIGTERM');
});

process.on('SIGINT', () => {
  console.log('\n⏹️  Stopping server...');
  server.kill('SIGINT');
});

server.on('exit', (code) => {
  process.exit(code || 0);
});