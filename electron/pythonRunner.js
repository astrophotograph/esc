const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');
const { app } = require('electron');

class PythonRunner {
  constructor() {
    this.process = null;
  }

  async start() {
    return new Promise((resolve, reject) => {
      try {
        // Determine paths based on environment
        let pythonPath;
        let scriptPath;
        let workingDir;
        
        if (app.isPackaged) {
          // In production, use bundled Python and script
          const resourcesPath = process.resourcesPath;
          
          // Option 1: Use system Python with requirements
          pythonPath = 'python3';
          scriptPath = path.join(resourcesPath, 'server', 'main.py');
          workingDir = path.join(resourcesPath, 'server');
          
          // Check if script exists
          if (!fs.existsSync(scriptPath)) {
            log.error(`Python script not found at ${scriptPath}`);
            reject(new Error('Python script not found'));
            return;
          }
        } else {
          // In development, use uv
          pythonPath = 'uv';
          scriptPath = path.join(__dirname, '..', 'server', 'main.py');
          workingDir = path.join(__dirname, '..', 'server');
        }
        
        log.info(`Starting Python backend: ${pythonPath} ${scriptPath}`);
        
        // Spawn the Python process
        const args = app.isPackaged 
          ? [scriptPath, 'server']
          : ['run', 'python', scriptPath, 'server'];
          
        this.process = spawn(pythonPath, args, {
          cwd: workingDir,
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1',
            HOST: '127.0.0.1',
            PORT: '8000'
          }
        });
        
        // Handle stdout
        this.process.stdout.on('data', (data) => {
          const output = data.toString();
          log.info(`Python Backend: ${output}`);
          
          // Check if server is ready
          if (output.includes('Uvicorn running on') || 
              output.includes('Started server process') ||
              output.includes('Application startup complete')) {
            log.info('Python backend is ready');
            resolve();
          }
        });
        
        // Handle stderr
        this.process.stderr.on('data', (data) => {
          const output = data.toString();
          // Python often logs to stderr even for non-errors
          if (output.includes('ERROR') || output.includes('CRITICAL')) {
            log.error(`Python Backend Error: ${output}`);
          } else {
            log.info(`Python Backend: ${output}`);
          }
        });
        
        // Handle process exit
        this.process.on('error', (error) => {
          log.error('Failed to start Python backend:', error);
          reject(error);
        });
        
        this.process.on('exit', (code, signal) => {
          log.info(`Python backend exited with code ${code} and signal ${signal}`);
          this.process = null;
        });
        
        // Set a timeout
        setTimeout(() => {
          if (this.process) {
            log.warn('Python backend startup timeout - proceeding anyway');
            resolve();
          }
        }, 85000); // 85 second timeout
        
      } catch (error) {
        log.error('Error starting Python backend:', error);
        reject(error);
      }
    });
  }
  
  async stop() {
    if (!this.process) {
      log.info('Python backend is not running');
      return;
    }
    
    return new Promise((resolve) => {
      log.info('Stopping Python backend...');
      
      const killTimeout = setTimeout(() => {
        log.warn('Python backend did not exit gracefully, forcing termination');
        this.process.kill('SIGKILL');
        resolve();
      }, 5000);
      
      this.process.on('exit', () => {
        clearTimeout(killTimeout);
        log.info('Python backend stopped');
        this.process = null;
        resolve();
      });
      
      // Send SIGTERM
      this.process.kill('SIGTERM');
    });
  }
  
  isRunning() {
    return this.process !== null && !this.process.killed;
  }
}

module.exports = { PythonRunner };