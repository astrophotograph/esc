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
    this.logs = {
      backend: [],
      frontend: []
    };
    this.logListeners = new Set();
    this.maxLogLines = 10000; // Keep last 10000 lines per process
  }
  
  // Add a log listener
  addLogListener(callback) {
    this.logListeners.add(callback);
  }
  
  // Remove a log listener
  removeLogListener(callback) {
    this.logListeners.delete(callback);
  }
  
  // Add log entry and notify listeners
  addLog(type, text) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, text };
    
    // Add to buffer
    this.logs[type].push(logEntry);
    
    // Trim if too many logs
    if (this.logs[type].length > this.maxLogLines) {
      this.logs[type] = this.logs[type].slice(-this.maxLogLines);
    }
    
    // Notify listeners
    this.logListeners.forEach(listener => {
      listener({ type, text, timestamp });
    });
  }
  
  // Get logs for a specific type
  getLogs(type) {
    return this.logs[type] || [];
  }

  setupBackendHandlers(resolve, reject) {
    let hasStarted = false;
    
    // Handle stdout
    this.processes.backend.stdout.on('data', (data) => {
      const output = data.toString();
      log.info(`Backend: ${output}`);
      
      // Add to logs
      this.addLog('backend', output);
      
      // Check for successful startup indicators
      if (!hasStarted && (output.includes('Uvicorn running on') || 
                          output.includes('Application startup complete') ||
                          output.includes('Starting Seestar API server'))) {
        hasStarted = true;
        log.info('Backend server detected as started via stdout');
      }
    });

    // Handle stderr (Python logs often go to stderr even for INFO messages)
    this.processes.backend.stderr.on('data', (data) => {
      const output = data.toString();
      
      // Add to logs
      this.addLog('backend', output);
      
      // Check if it's actually an error or just regular Python logging
      if (output.includes('ERROR') || output.includes('CRITICAL') || output.includes('Exception')) {
        log.error(`Backend Error: ${output}`);
        if (output.includes('Address already in use')) {
          log.error('Port 8000 is already in use. Attempting to connect to existing server...');
          // Try to connect to existing server
          this.checkHealth().then((isHealthy) => {
            if (isHealthy) {
              resolve();
            } else {
              reject(new Error('Port 8000 is in use but server is not responding'));
            }
          });
        }
      } else {
        log.info(`Backend: ${output}`);
      }
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
      }
    });

    // Poll health endpoint
    const checkHealth = async () => {
      try {
        const response = await fetch('http://127.0.0.1:8000/health');
        if (response.ok) {
          log.info('Backend server is ready (health check passed)');
          if (!hasStarted) {
            hasStarted = true;
            resolve();
          }
          return true;
        }
      } catch (error) {
        // Server not ready yet
        log.debug('Health check failed:', error.message);
      }
      return false;
    };
    
    this.checkHealth = checkHealth;

    // Wait a bit before starting health checks
    setTimeout(() => {
      const pollInterval = setInterval(async () => {
        if (await checkHealth()) {
          clearInterval(pollInterval);
        }
      }, 500);
      this.healthCheckInterval = pollInterval;
    }, 1000);

    // Set a timeout for server startup
    setTimeout(() => {
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }
      if (this.processes.backend && !this.isShuttingDown) {
        log.warn('Backend server startup timeout - proceeding anyway');
        resolve(); // Proceed even if backend isn't ready
      }
    }, 15000); // Reduced timeout to 15 seconds
  }

  async startBackend() {
    return new Promise((resolve, reject) => {
      try {
        // Determine the backend executable path
        let backendPath;
        let backendArgs = ['server'];
        
        if (app.isPackaged) {
          // In production, check for different backend builds
          const resourcesPath = process.resourcesPath;
          
          // PyInstaller build (primary option)
          const pyinstallerBackend = process.platform === 'win32' 
            ? path.join(resourcesPath, 'python-server', 'esc-server.exe')
            : path.join(resourcesPath, 'python-server', 'esc-server');
          
          // Python bundle with launcher script (fallback)
          const pythonBundle = path.join(resourcesPath, 'python-bundle', 'launch.sh');
          
          // Legacy location for PyInstaller
          const legacyPyinstaller = process.platform === 'win32' 
            ? path.join(resourcesPath, 'server', 'main.exe')
            : path.join(resourcesPath, 'server', 'main');
          
          if (fs.existsSync(pyinstallerBackend)) {
            // Use PyInstaller build (preferred for speed and reliability)
            backendPath = pyinstallerBackend;
            backendArgs = ['server', '--no-color'];  // Add --no-color flag
            log.info('Using PyInstaller backend from python-server directory');
          } else if (fs.existsSync(legacyPyinstaller)) {
            // Fall back to legacy PyInstaller location
            backendPath = legacyPyinstaller;
            backendArgs = ['server', '--no-color'];  // Add --no-color flag
            log.info('Using PyInstaller backend from legacy location');
          } else if (fs.existsSync(pythonBundle)) {
            // Use Python bundle with launcher script (slowest but most flexible)
            backendPath = pythonBundle;
            backendArgs = ['server', '--no-color'];  // Add --no-color flag
            log.info('Using Python bundle launcher');
          } else {
            // For production builds without bundled backend, 
            // we need the user to have the server running separately
            log.error('Bundled backend not found. Please ensure the Python server is running separately.');
            log.info('Run the following in a terminal:');
            log.info('cd server && uv run python main.py server');
            
            // Still try to connect to see if it's already running
            const checkHealth = async () => {
              try {
                const response = await fetch('http://127.0.0.1:8000/health');
                if (response.ok) {
                  log.info('Found existing backend server at port 8000');
                  return true;
                }
              } catch (error) {
                // Server not running
              }
              return false;
            };
            
            // Check if server is already running
            checkHealth().then(isRunning => {
              if (isRunning) {
                resolve();
              } else {
                // If not running, we can't start it from the sandboxed app
                reject(new Error('Backend server is not running. Please start it manually.'));
              }
            }).catch(error => {
              reject(error);
            });
            
            return;
          }
        } else {
          // In development, run with Python
          backendPath = 'uv';
          backendArgs = ['run', 'python', path.join(__dirname, '..', 'server', 'main.py'), 'server', '--no-color'];  // Add --no-color flag
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

        // Set up handlers
        this.setupBackendHandlers(resolve, reject);

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
          log.info(`Frontend path: ${frontendPath}`);
          
          // Check if the Next.js standalone output exists
          const standaloneDir = path.join(frontendPath, '.next', 'standalone');
          const serverJsPath = path.join(standaloneDir, 'server.js');
          
          // Check both possible locations
          let finalServerPath = serverJsPath;
          let finalCwd = standaloneDir;
          
          if (!fs.existsSync(serverJsPath)) {
            // Try the frontendPath directly
            const altServerPath = path.join(frontendPath, 'server.js');
            if (fs.existsSync(altServerPath)) {
              finalServerPath = altServerPath;
              finalCwd = frontendPath;
            } else {
              log.error(`server.js not found at ${serverJsPath} or ${altServerPath}`);
              reject(new Error('Frontend server.js not found'));
              return;
            }
          }
          
          log.info(`Starting Node.js server from ${finalServerPath}`);
          
          try {
            this.processes.frontend = spawn('node', ['server.js'], {
              cwd: finalCwd,
              env: { ...process.env, PORT: '3000', NODE_ENV: 'production', HOSTNAME: 'localhost', BACKEND_HOST: 'localhost:8000' }
            });
            
            log.info(`Frontend process spawned with PID: ${this.processes.frontend.pid}`);
          } catch (error) {
            log.error('Failed to spawn frontend process:', error);
            reject(error);
            return;
          }

          let hasResolved = false;
          
          this.processes.frontend.stdout.on('data', (data) => {
            const output = data.toString();
            log.info(`Frontend: ${output}`);
            
            // Add to logs
            this.addLog('frontend', output);
            
            if (!hasResolved && (output.includes('Ready on') || output.includes('Ready in') || output.includes('started on') || output.includes('Listening on'))) {
              log.info('Production frontend server is ready');
              hasResolved = true;
              resolve();
            }
          });
          
          // Set a timeout to resolve even if we don't see the ready message
          setTimeout(() => {
            if (!hasResolved) {
              log.info('Frontend server startup timeout reached, assuming ready');
              hasResolved = true;
              resolve();
            }
          }, 5000);

          this.processes.frontend.stderr.on('data', (data) => {
            const output = data.toString();
            log.error(`Frontend Error: ${output}`);
            
            // Add to logs
            this.addLog('frontend', output);
          });

          this.processes.frontend.on('error', (error) => {
            log.error('Failed to start production frontend:', error);
            if (!hasResolved) {
              hasResolved = true;
              reject(error);
            }
          });

          this.processes.frontend.on('exit', (code, signal) => {
            log.info(`Frontend process exited with code ${code} and signal ${signal}`);
            this.processes.frontend = null;
            if (!hasResolved && !this.isShuttingDown) {
              log.error('Frontend process exited unexpectedly during startup');
              hasResolved = true;
              reject(new Error(`Frontend exited with code ${code}`));
            }
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
            
            // Add to logs
            this.addLog('frontend', output);
            
            if (output.includes('Ready in') || output.includes('compiled successfully')) {
              log.info('Frontend server is ready');
              resolve();
            }
          });

          this.processes.frontend.stderr.on('data', (data) => {
            const output = data.toString();
            log.error(`Frontend Error: ${output}`);
            
            // Add to logs
            this.addLog('frontend', output);
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
