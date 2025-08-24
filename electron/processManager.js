const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');
const { app } = require('electron');
const net = require('net');

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
    this.ports = {
      backend: 8000,
      frontend: 3000
    };
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

  // Find an available port
  async findAvailablePort(startPort = 8000, maxPort = 9999) {
    return new Promise((resolve, reject) => {
      const tryPort = (port) => {
        if (port > maxPort) {
          reject(new Error(`No available ports between ${startPort} and ${maxPort}`));
          return;
        }

        const server = net.createServer();
        
        server.listen(port, '127.0.0.1', () => {
          server.close(() => {
            log.info(`Found available port: ${port}`);
            resolve(port);
          });
        });

        server.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            // Port is in use, try the next one
            tryPort(port + 1);
          } else {
            reject(err);
          }
        });
      };

      tryPort(startPort);
    });
  }

  // Get the ports being used
  getPorts() {
    return this.ports;
  }

  setupBackendHandlers(resolve, reject) {
    let hasStarted = false;
    let hasResolved = false;
    
    const safeResolve = (source) => {
      if (!hasResolved) {
        hasResolved = true;
        log.info(`Backend startup resolved by: ${source}`);
        resolve();
      } else {
        log.info(`Backend startup already resolved, ignoring: ${source}`);
      }
    };
    
    // Handle stdout
    this.processes.backend.stdout.on('data', (data) => {
      const output = data.toString();
      log.info(`Backend: ${output}`);
      
      // Add to logs
      this.addLog('backend', output);
      
      // Try to parse as JSON for better structured logging
      try {
        const jsonLog = JSON.parse(output.trim());
        if (!hasStarted && (jsonLog.event === 'server_started' || 
                           jsonLog.event === 'startup_complete' ||
                           (jsonLog.level === 'INFO' && (
                             jsonLog.message?.includes('Application startup complete') ||
                             jsonLog.message?.includes('Uvicorn running on')
                           )))) {
          hasStarted = true;
          log.info('Backend server started successfully (JSON event from stdout)');
          safeResolve('JSON event from stdout');
        }
      } catch (e) {
        // Not JSON, check for text patterns
        if (!hasStarted && (output.includes('Uvicorn running on') || 
                            output.includes('Application startup complete') ||
                            output.includes('Starting Seestar API server') ||
                            output.includes('✨ Server starting on'))) {
          hasStarted = true;
          log.info('Backend server detected as started via stdout');
          safeResolve('text pattern from stdout');
        }
      }
    });

    // Handle stderr (Python logs often go to stderr even for INFO messages)
    this.processes.backend.stderr.on('data', (data) => {
      const output = data.toString();
      
      // Add to logs
      this.addLog('backend', output);
      
      // Try to parse as JSON log
      try {
        const jsonLog = JSON.parse(output.trim());
        
        // Check for startup success
        if (!hasStarted && (jsonLog.event === 'server_started' || 
                           jsonLog.level === 'INFO' && (
                             jsonLog.message?.includes('Application startup complete') ||
                             jsonLog.message?.includes('Uvicorn running on') ||
                             jsonLog.message?.includes('Server starting on')
                           ))) {
          hasStarted = true;
          log.info('Backend server started successfully (JSON from stderr)');
          safeResolve('JSON from stderr');
          return;
        }
        
        // Check for errors
        if (jsonLog.level === 'ERROR' || jsonLog.level === 'CRITICAL') {
          log.error(`Backend Error: ${jsonLog.message || output}`);
          if (jsonLog.message?.includes('Address already in use') || jsonLog.message?.includes('[errno 48]')) {
            if (!hasStarted) {
              hasStarted = true; // Prevent multiple rejections
              reject(new Error('Port 8000 is already in use. Please close any other instances of the server.'));
            }
          } else if (jsonLog.error || jsonLog.exception) {
            if (!hasStarted) {
              hasStarted = true;
              reject(new Error(jsonLog.message || 'Backend startup failed'));
            }
          }
        } else {
          log.info(`Backend: ${jsonLog.message || output}`);
        }
      } catch (e) {
        // Not JSON, parse as text
        if (!hasStarted && (output.includes('Uvicorn running on') || 
                           output.includes('Server starting on') ||
                           output.includes('Application startup complete'))) {
          hasStarted = true;
          log.info('Backend server detected as started via stderr');
          safeResolve('text pattern from stderr');
        } else if (output.includes('ERROR') || output.includes('CRITICAL') || 
                  output.includes('Exception') || output.includes('Traceback')) {
          log.error(`Backend Error: ${output}`);
          if (output.includes('Address already in use') || output.includes('[Errno 48]')) {
            if (!hasStarted) {
              hasStarted = true;
              log.error('Port 8000 is already in use');
              reject(new Error('Port 8000 is already in use. The port kill attempt may have failed.'));
            }
          } else if (output.includes('ModuleNotFoundError') || output.includes('ImportError')) {
            if (!hasStarted) {
              hasStarted = true;
              reject(new Error('Python dependencies missing: ' + output.substring(0, 200)));
            }
          } else if (output.includes('OSError') && !hasStarted) {
            hasStarted = true;
            reject(new Error('Backend failed with OS error: ' + output.substring(0, 200)));
          }
        } else {
          log.info(`Backend: ${output}`);
        }
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
        const response = await fetch(`http://127.0.0.1:${this.ports.backend}/health`);
        if (response.ok) {
          log.info('Backend server is ready (health check passed)');
          if (!hasStarted) {
            hasStarted = true;
            safeResolve('health check');
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
        safeResolve('timeout - proceeding anyway'); // Proceed even if backend isn't ready
      }
    }, 85000); // Extended timeout to 85 seconds (slightly less than loading screen timeout)
  }

  async startBackend() {
    return new Promise(async (resolve, reject) => {
      try {
        // Find an available port for the backend, starting from a random port in range
        // Never use default port 8000 to avoid conflicts
        const randomStart = 8001 + Math.floor(Math.random() * 900); // Random port between 8001-8900
        this.ports.backend = await this.findAvailablePort(randomStart, 8999);
        log.info(`Backend will use port ${this.ports.backend}`);
        
        // No need to kill processes since we found an available port
        
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
            backendArgs = ['server', '--server-port', String(this.ports.backend), '--no-color', '--json-logs'];  // Add port and JSON logging flag
            log.info('Using PyInstaller backend from python-server directory');
          } else if (fs.existsSync(legacyPyinstaller)) {
            // Fall back to legacy PyInstaller location
            backendPath = legacyPyinstaller;
            backendArgs = ['server', '--server-port', String(this.ports.backend), '--no-color'];  // Add port and --no-color flag
            log.info('Using PyInstaller backend from legacy location');
          } else if (fs.existsSync(pythonBundle)) {
            // Use Python bundle with launcher script (slowest but most flexible)
            backendPath = pythonBundle;
            backendArgs = ['server', '--server-port', String(this.ports.backend), '--json-logs'];  // Add port and JSON logging flag
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
            
            // Check if server is already running on the selected port
            const checkExistingHealth = async () => {
              try {
                const response = await fetch(`http://127.0.0.1:${this.ports.backend}/health`); 
                if (response.ok) {
                  log.info(`Found existing backend server at port ${this.ports.backend}`);
                  return true;
                }
              } catch (error) {
                // Server not running
              }
              return false;
            };
            
            checkExistingHealth().then(isRunning => {
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
          backendArgs = ['run', 'python', path.join(__dirname, '..', 'server', 'main.py'), 'server', '--server-port', String(this.ports.backend), '--no-color'];  // Add port and --no-color flag
        }

        log.info(`Starting backend: ${backendPath} ${backendArgs.join(' ')}`);

        // Set environment variables
        const env = { ...process.env };
        env.PYTHONUNBUFFERED = '1'; // Ensure Python output is not buffered
        env.HOST = '127.0.0.1';
        env.PORT = String(this.ports.backend);

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
    return new Promise(async (resolve, reject) => {
      try {
        // Find an available port for the frontend, starting from a random port in range
        // Never use default port 3000 to avoid conflicts
        const randomStart = 3001 + Math.floor(Math.random() * 900); // Random port between 3001-3900
        this.ports.frontend = await this.findAvailablePort(randomStart, 3999);
        log.info(`Frontend will use port ${this.ports.frontend}`);
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
              env: { ...process.env, PORT: String(this.ports.frontend), NODE_ENV: 'production', HOSTNAME: 'localhost', BACKEND_HOST: `localhost:${this.ports.backend}` }
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
          }, 30000); // Extended to 30 seconds for production frontend startup

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
        const req = http.get(`http://localhost:${this.ports.frontend}`, (res) => {
          log.info(`Frontend dev server is already running on port ${this.ports.frontend}`);
          resolve();
        });
        
        req.on('error', () => {
          // Dev server not running, start it
          log.info('Starting frontend dev server...');
          
          this.processes.frontend = spawn('pnpm', ['run', 'dev'], {
            cwd: frontendPath,
            shell: true,
            env: { ...process.env, BROWSER: 'none', PORT: String(this.ports.frontend), BACKEND_HOST: `localhost:${this.ports.backend}` } // Prevent opening browser
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
          }, 85000); // Extended timeout to 85 seconds for Next.js
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
