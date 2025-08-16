/**
 * Server-side monitoring for NextJS
 */

interface ServerMemoryStats {
  timestamp: string;
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
  cpu: NodeJS.CpuUsage;
}

class ServerMemoryMonitor {
  private intervalMs: number;
  private intervalId?: NodeJS.Timeout;
  private initialMemory?: NodeJS.MemoryUsage;
  private peakMemory: number = 0;
  private lastStats?: ServerMemoryStats;

  constructor(intervalSeconds: number = 60) {
    this.intervalMs = intervalSeconds * 1000;
  }

  start() {
    if (typeof window !== 'undefined') {
      console.warn('ServerMemoryMonitor should only run on server side');
      return;
    }

    this.initialMemory = process.memoryUsage();
    this.peakMemory = this.initialMemory.heapUsed;
    
    console.log(`${new Date().toISOString()} [ServerMemoryMonitor] Started (interval: ${this.intervalMs / 1000}s, initial heap: ${this.formatBytes(this.initialMemory.heapUsed)})`);
    
    this.intervalId = setInterval(() => {
      this.checkMemory();
    }, this.intervalMs);
    
    // Also log on process exit
    process.on('exit', () => {
      this.logFinalStats();
    });
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      console.log(`${new Date().toISOString()} [ServerMemoryMonitor] Stopped`);
    }
  }

  private checkMemory() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    const stats: ServerMemoryStats = {
      timestamp: new Date().toISOString(),
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers,
      cpu: cpuUsage,
    };
    
    // Update peak memory
    if (stats.heapUsed > this.peakMemory) {
      this.peakMemory = stats.heapUsed;
      console.warn(`${new Date().toISOString()} [ServerMemoryMonitor] New peak memory: ${this.formatBytes(this.peakMemory)}`);
    }
    
    // Calculate delta from initial
    const deltaBytes = this.initialMemory ? stats.heapUsed - this.initialMemory.heapUsed : 0;
    const deltaMB = deltaBytes / 1024 / 1024;
    
    // Determine log level
    let logFn = console.debug;
    if (Math.abs(deltaMB) > 100) {
      logFn = console.error;
    } else if (Math.abs(deltaMB) > 50) {
      logFn = console.warn;
    } else if (Math.abs(deltaMB) > 10) {
      logFn = console.info;
    }
    
    logFn(
      `${stats.timestamp} [ServerMemoryMonitor] RSS: ${this.formatBytes(stats.rss)}, ` +
      `Heap: ${this.formatBytes(stats.heapUsed)}/${this.formatBytes(stats.heapTotal)} ` +
      `(Δ${deltaMB > 0 ? '+' : ''}${deltaMB.toFixed(1)}MB), ` +
      `External: ${this.formatBytes(stats.external)}, ` +
      `CPU: ${(cpuUsage.user / 1000).toFixed(0)}ms user, ${(cpuUsage.system / 1000).toFixed(0)}ms system`
    );
    
    // Check for potential memory leak
    if (deltaMB > 100) {
      console.error(`${stats.timestamp} [ServerMemoryMonitor] Potential memory leak! Memory increased by ${deltaMB.toFixed(1)}MB`);
      
      // Force garbage collection if exposed
      if (global.gc) {
        global.gc();
        const afterGC = process.memoryUsage();
        const freed = stats.heapUsed - afterGC.heapUsed;
        console.info(`${new Date().toISOString()} [ServerMemoryMonitor] After GC: freed ${this.formatBytes(freed)}`);
      }
    }
    
    this.lastStats = stats;
  }

  private logFinalStats() {
    if (!this.initialMemory) return;
    
    const final = process.memoryUsage();
    const totalDelta = final.heapUsed - this.initialMemory.heapUsed;
    
    console.info(
      `${new Date().toISOString()} [ServerMemoryMonitor] Final stats - ` +
      `Peak: ${this.formatBytes(this.peakMemory)}, ` +
      `Final: ${this.formatBytes(final.heapUsed)}, ` +
      `Total delta: ${this.formatBytes(totalDelta)}`
    );
  }

  private formatBytes(bytes: number): string {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(1)}MB`;
  }

  getStats(): ServerMemoryStats | undefined {
    return this.lastStats;
  }

  getPrometheusMetrics(): string {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    const metrics: string[] = [];
    
    metrics.push('# HELP nodejs_memory_rss_bytes Resident Set Size');
    metrics.push('# TYPE nodejs_memory_rss_bytes gauge');
    metrics.push(`nodejs_memory_rss_bytes ${memUsage.rss}`);
    
    metrics.push('# HELP nodejs_memory_heap_total_bytes Total heap size');
    metrics.push('# TYPE nodejs_memory_heap_total_bytes gauge');
    metrics.push(`nodejs_memory_heap_total_bytes ${memUsage.heapTotal}`);
    
    metrics.push('# HELP nodejs_memory_heap_used_bytes Used heap size');
    metrics.push('# TYPE nodejs_memory_heap_used_bytes gauge');
    metrics.push(`nodejs_memory_heap_used_bytes ${memUsage.heapUsed}`);
    
    metrics.push('# HELP nodejs_memory_external_bytes External memory');
    metrics.push('# TYPE nodejs_memory_external_bytes gauge');
    metrics.push(`nodejs_memory_external_bytes ${memUsage.external}`);
    
    metrics.push('# HELP nodejs_memory_peak_heap_bytes Peak heap memory used');
    metrics.push('# TYPE nodejs_memory_peak_heap_bytes gauge');
    metrics.push(`nodejs_memory_peak_heap_bytes ${this.peakMemory}`);
    
    metrics.push('# HELP nodejs_cpu_user_seconds_total User CPU time');
    metrics.push('# TYPE nodejs_cpu_user_seconds_total counter');
    metrics.push(`nodejs_cpu_user_seconds_total ${cpuUsage.user / 1000000}`);
    
    metrics.push('# HELP nodejs_cpu_system_seconds_total System CPU time');
    metrics.push('# TYPE nodejs_cpu_system_seconds_total counter');
    metrics.push(`nodejs_cpu_system_seconds_total ${cpuUsage.system / 1000000}`);
    
    // Add process info
    metrics.push('# HELP nodejs_process_uptime_seconds Process uptime');
    metrics.push('# TYPE nodejs_process_uptime_seconds gauge');
    metrics.push(`nodejs_process_uptime_seconds ${process.uptime()}`);
    
    return metrics.join('\n');
  }
}

// Singleton instance
let serverMonitor: ServerMemoryMonitor | null = null;

export function getServerMonitor(): ServerMemoryMonitor {
  if (!serverMonitor) {
    serverMonitor = new ServerMemoryMonitor(60);
  }
  return serverMonitor;
}

export function startServerMonitoring(intervalSeconds: number = 60) {
  if (typeof window !== 'undefined') {
    console.warn('Server monitoring should only run on server side');
    return;
  }
  
  const monitor = getServerMonitor();
  monitor.start();
}

export function stopServerMonitoring() {
  if (serverMonitor) {
    serverMonitor.stop();
    serverMonitor = null;
  }
}