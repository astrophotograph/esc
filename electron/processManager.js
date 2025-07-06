const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');
const { app } = require('electron');

class ProcessManager {
  constructor() {
    this.processes = {
      backend: null,
      frontend: null
    };
    this.isShuttingDown = false;
  }

  async startBackend() {
    return new Promise((resolve, reject) => {
      try {
        // Determine the backend executable path
        let backendPath;
        let backendArgs = ['server'];
        
        if (app.isPackaged) {
          // In production, use the bundled backend
          const resourcesPath = process.resourcesPath;
          if (process.platform === 'win32') {
            backendPath = path.join(resourcesPath, 'server', 'main.exe');
            backendArgs = ['server'];
          } else {
            backendPath = path.join(resourcesPath, 'server', 'main');
            backendArgs = ['server'];
          }
        } else {
          // In development, run with Python
          backendPath = 'uv';
          backendArgs = ['run', path.join(__dirname, '..', 'server', 'main.py'), 'server'];
        }

        log.info(`Starting backend: ${backendPath} ${backendArgs.join(' ')}`);

        // Set environment variables
        const env = { ...process.env };
        env.PYTHONUNBUFFERED = '1'; // Ensure Python output is not buffered
        env.HOST = '127.0.0.1';
        env.PORT = '8000';

        // Spawn the backend process
        this.processes.backend = spawn(backendPath, backendArgs, {
          env,
          cwd: app.isPackaged ? undefined : path.join(__dirname, '..', 'server')
        });

        // Handle stdout
        this.processes.backend.stdout.on('data', (data) => {
          const output = data.toString();
          log.info(`Backend: ${output}`);
        });

        // Handle stderr
        this.processes.backend.stderr.on('data', (data) => {
          log.error(`Backend Error: ${data.toString()}`);
        });

        // Handle process exit
        this.processes.backend.on('error', (error) => {
          log.error('Failed to start backend:', error);
          reject(error);
        });

        this.processes.backend.on('exit', (code, signal) => {
          log.info(`Backend process exited with code ${code} and signal ${signal}`);
          this.processes.backend = null;
          
          if (!this.isShuttingDown) {
            log.error('Backend process exited unexpectedly');
            // Could implement auto-restart here
          }
        });

        // Poll health endpoint to check if server is ready
        const checkHealth = async () => {
          try {
            const response = await fetch('http://127.0.0.1:8000/health');
            if (response.ok) {
              log.info('Backend server is ready (health check passed)');
              resolve();
              return true;
            }
          } catch (error) {
            // Server not ready yet
          }
          return false;
        };

        // Wait a bit before starting health checks
        setTimeout(() => {
          // Poll every 500ms
          const pollInterval = setInterval(async () => {
            if (await checkHealth()) {
              clearInterval(pollInterval);
            }
          }, 500);

          // Store interval reference for cleanup
          this.healthCheckInterval = pollInterval;
        }, 1000); // Wait 1 second before starting health checks

        // Set a timeout for server startup
        setTimeout(() => {
          if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
          }
          if (this.processes.backend && !this.isShuttingDown) {
            reject(new Error('Backend server startup timeout'));
          }
        }, 60000); // 60 second timeout

      } catch (error) {
        log.error('Error starting backend:', error);
        reject(error);
      }
    });
  }

  async startFrontend() {
    return new Promise((resolve, reject) => {
      try {
        // In production, the frontend should be served as static files
        // This method is mainly for development where Next.js dev server might be needed
        
        if (app.isPackaged) {
          // In production, start the built Next.js server
          log.info('Starting production frontend server...');
          
          const frontendPath = path.join(process.resourcesPath, 'ui');
          
          this.processes.frontend = spawn('node', ['server.js'], {
            cwd: frontendPath,
            env: { ...process.env, PORT: '3000', NODE_ENV: 'production' }
          });

          this.processes.frontend.stdout.on('data', (data) => {
            const output = data.toString();
            log.info(`Frontend: ${output}`);
            
            if (output.includes('Ready on') || output.includes('started on')) {
              log.info('Production frontend server is ready');
              resolve();
            }
          });

          this.processes.frontend.stderr.on('data', (data) => {
            log.error(`Frontend Error: ${data.toString()}`);
          });

          this.processes.frontend.on('error', (error) => {
            log.error('Failed to start production frontend:', error);
            reject(error);
          });

          this.processes.frontend.on('exit', (code) => {
            log.info(`Frontend process exited with code ${code}`);
            this.processes.frontend = null;
          });
          
          return;
        }

        // In development, start Next.js dev server if needed
        const frontendPath = path.join(__dirname, '..', 'ui');
        
        // Check if Next.js dev server is already running
        const http = require('http');
        const req = http.get('http://localhost:3000', (res) => {
          log.info('Frontend dev server is already running');
          resolve();
        });
        
        req.on('error', () => {
          // Dev server not running, start it
          log.info('Starting frontend dev server...');
          
          this.processes.frontend = spawn('pnpm', ['run', 'dev'], {
            cwd: frontendPath,
            shell: true,
            env: { ...process.env, BROWSER: 'none' } // Prevent opening browser
          });

          this.processes.frontend.stdout.on('data', (data) => {
            const output = data.toString();
            log.info(`Frontend: ${output}`);
            
            if (output.includes('Ready in') || output.includes('compiled successfully')) {
              log.info('Frontend server is ready');
              resolve();
            }
          });

          this.processes.frontend.stderr.on('data', (data) => {
            log.error(`Frontend Error: ${data.toString()}`);
          });

          this.processes.frontend.on('error', (error) => {
            log.error('Failed to start frontend:', error);
            reject(error);
          });

          this.processes.frontend.on('exit', (code) => {
            log.info(`Frontend process exited with code ${code}`);
            this.processes.frontend = null;
          });

          // Set a timeout for server startup
          setTimeout(() => {
            if (this.processes.frontend && !this.isShuttingDown) {
              reject(new Error('Frontend server startup timeout'));
            }
          }, 60000); // 60 second timeout for Next.js
        });

      } catch (error) {
        log.error('Error starting frontend:', error);
        reject(error);
      }
    });
  }

  async stopProcess(name) {
    const process = this.processes[name];
    
    if (!process) {
      log.info(`${name} process is not running`);
      return;
    }

    return new Promise((resolve) => {
      log.info(`Stopping ${name} process...`);
      
      // Set a timeout to force kill if graceful shutdown fails
      const killTimeout = setTimeout(() => {
        log.warn(`${name} process did not exit gracefully, forcing termination`);
        process.kill('SIGKILL');
        resolve();
      }, 5000);

      process.on('exit', () => {
        clearTimeout(killTimeout);
        log.info(`${name} process stopped`);
        this.processes[name] = null;
        resolve();
      });

      // Try graceful shutdown first
      if (process.platform === 'win32') {
        // On Windows, use taskkill for graceful shutdown
        spawn('taskkill', ['/pid', process.pid, '/t']);
      } else {
        // On Unix-like systems, send SIGTERM
        process.kill('SIGTERM');
      }
    });
  }

  async stopAll() {
    this.isShuttingDown = true;
    
    log.info('Stopping all processes...');
    
    // Stop processes in parallel
    await Promise.all([
      this.stopProcess('frontend'),
      this.stopProcess('backend')
    ]);
    
    log.info('All processes stopped');
  }

  // Check if a process is running
  isRunning(name) {
    return this.processes[name] !== null && !this.processes[name].killed;
  }

  // Get process status
  getStatus() {
    return {
      backend: this.isRunning('backend'),
      frontend: this.isRunning('frontend')
    };
  }
}

module.exports = { ProcessManager };
