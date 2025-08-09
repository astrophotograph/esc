#!/usr/bin/env node

/**
 * Auto-respawn script for Next.js server
 * Automatically restarts the server if it crashes or exits
 */

const { spawn } = require('child_process');
const path = require('path');

// Configuration
const MAX_RETRIES = 10;
const RETRY_DELAY = 3000; // 3 seconds
const RESET_COUNTER_AFTER = 60000; // Reset retry counter after 60 seconds of successful run

let retryCount = 0;
let lastStartTime = Date.now();
let child = null;

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0] || 'dev'; // Default to 'dev' if no command specified

// Map commands to npm scripts
const commandMap = {
  'dev': ['npm', ['run', 'dev']],
  'start': ['npm', ['run', 'start']],
  'build-start': ['npm', ['run', 'build', '&&', 'npm', 'run', 'start']],
  'custom': args.slice(1) // Allow custom commands
};

if (!commandMap[command] && command !== 'custom') {
  console.error(`Unknown command: ${command}`);
  console.log('Usage: node scripts/respawn.js [dev|start|build-start|custom <command>]');
  process.exit(1);
}

const [cmd, cmdArgs] = command === 'custom' 
  ? [args[1], args.slice(2)] 
  : commandMap[command];

console.log(`🚀 Starting respawn manager for: ${cmd} ${cmdArgs.join(' ')}`);
console.log(`   Max retries: ${MAX_RETRIES}`);
console.log(`   Retry delay: ${RETRY_DELAY}ms`);
console.log('   Press Ctrl+C twice to exit\n');

function startServer() {
  const currentTime = Date.now();
  
  // Reset retry counter if the server has been running successfully for a while
  if (currentTime - lastStartTime > RESET_COUNTER_AFTER) {
    retryCount = 0;
  }
  
  // Check if we've exceeded max retries
  if (retryCount >= MAX_RETRIES) {
    console.error(`\n❌ Server crashed ${MAX_RETRIES} times. Giving up.`);
    console.error('   Please check the logs and fix the issue.');
    process.exit(1);
  }
  
  lastStartTime = currentTime;
  retryCount++;
  
  console.log(`\n🔄 Starting server (attempt ${retryCount}/${MAX_RETRIES})...`);
  
  // Spawn the child process
  child = spawn(cmd, cmdArgs, {
    stdio: 'inherit',
    shell: true,
    cwd: path.dirname(path.dirname(__filename))
  });
  
  child.on('exit', (code, signal) => {
    if (code === 0) {
      console.log('\n✅ Server exited normally');
      retryCount = 0; // Reset counter on normal exit
    } else if (signal === 'SIGINT' || signal === 'SIGTERM') {
      console.log('\n🛑 Server was terminated by signal:', signal);
      process.exit(0);
    } else {
      console.error(`\n⚠️ Server crashed with code ${code}`);
      console.log(`   Restarting in ${RETRY_DELAY / 1000} seconds...`);
      
      setTimeout(() => {
        startServer();
      }, RETRY_DELAY);
    }
  });
  
  child.on('error', (err) => {
    console.error('\n❌ Failed to start server:', err);
    console.log(`   Retrying in ${RETRY_DELAY / 1000} seconds...`);
    
    setTimeout(() => {
      startServer();
    }, RETRY_DELAY);
  });
}

// Handle graceful shutdown
let shutdownCount = 0;
process.on('SIGINT', () => {
  shutdownCount++;
  
  if (shutdownCount === 1) {
    console.log('\n\n⚠️ Press Ctrl+C again to exit...');
    
    // Reset counter after 2 seconds
    setTimeout(() => {
      shutdownCount = 0;
    }, 2000);
    
    // Kill the child process
    if (child && !child.killed) {
      child.kill('SIGINT');
    }
  } else {
    console.log('\n👋 Shutting down respawn manager...');
    
    // Force kill child if still running
    if (child && !child.killed) {
      child.kill('SIGKILL');
    }
    
    process.exit(0);
  }
});

process.on('SIGTERM', () => {
  console.log('\n👋 Received SIGTERM, shutting down...');
  
  if (child && !child.killed) {
    child.kill('SIGTERM');
  }
  
  process.exit(0);
});

// Start the server
startServer();