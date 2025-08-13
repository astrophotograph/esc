/**
 * Memory and performance monitoring utilities for NextJS
 */

interface MemoryStats {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  deltaHeapUsed?: number;
  deltaHeapTotal?: number;
}

interface PerformanceStats {
  loadTime?: number;
  domContentLoadedTime?: number;
  firstPaintTime?: number;
  firstContentfulPaintTime?: number;
  largestContentfulPaintTime?: number;
  cumulativeLayoutShift?: number;
  totalBlockingTime?: number;
  interactionToNextPaint?: number;
}

class MemoryMonitor {
  private interval: number = 60000; // Default 1 minute
  private intervalId?: NodeJS.Timeout;
  private lastStats?: MemoryStats;
  private peakHeapUsed: number = 0;
  private initialHeapUsed: number = 0;
  private logLevel: 'debug' | 'info' | 'warn' | 'error' = 'debug';

  constructor(intervalSeconds: number = 60) {
    this.interval = intervalSeconds * 1000;
    
    // Only run in browser
    if (typeof window === 'undefined') {
      return;
    }
    
    // Check if memory API is available
    if (!('memory' in performance)) {
      console.warn('Performance memory API not available in this browser');
    }
  }

  start() {
    if (typeof window === 'undefined') return;
    
    // Get initial stats
    const stats = this.getMemoryStats();
    if (stats) {
      this.initialHeapUsed = stats.heapUsed;
      this.peakHeapUsed = stats.heapUsed;
      this.lastStats = stats;
      
      this.log('info', `Memory monitor started (interval: ${this.interval / 1000}s, initial: ${this.formatBytes(stats.heapUsed)})`);
    }
    
    // Start monitoring
    this.intervalId = setInterval(() => {
      this.checkMemory();
    }, this.interval);
    
    // Also monitor on page visibility change
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.checkMemory();
      }
    });
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      this.log('info', 'Memory monitor stopped');
    }
  }

  private getMemoryStats(): MemoryStats | null {
    if (typeof window === 'undefined') return null;
    
    // Check if performance.memory is available (Chrome only)
    const perf = performance as any;
    if (!perf.memory) return null;
    
    const stats: MemoryStats = {
      timestamp: Date.now(),
      heapUsed: perf.memory.usedJSHeapSize,
      heapTotal: perf.memory.totalJSHeapSize,
      external: perf.memory.jsHeapSizeLimit,
      arrayBuffers: 0, // Not directly available in browser
    };
    
    // Calculate deltas if we have previous stats
    if (this.lastStats) {
      stats.deltaHeapUsed = stats.heapUsed - this.lastStats.heapUsed;
      stats.deltaHeapTotal = stats.heapTotal - this.lastStats.heapTotal;
    }
    
    return stats;
  }

  private checkMemory() {
    const stats = this.getMemoryStats();
    if (!stats) return;
    
    // Update peak memory
    if (stats.heapUsed > this.peakHeapUsed) {
      this.peakHeapUsed = stats.heapUsed;
      this.log('warn', `New peak memory: ${this.formatBytes(this.peakHeapUsed)}`);
    }
    
    // Determine log level based on memory growth
    const deltaFromInitial = stats.heapUsed - this.initialHeapUsed;
    const deltaFromInitialMB = deltaFromInitial / 1024 / 1024;
    
    let logLevel: 'debug' | 'info' | 'warn' | 'error' = 'debug';
    if (Math.abs(deltaFromInitialMB) > 100) {
      logLevel = 'error';
    } else if (Math.abs(deltaFromInitialMB) > 50) {
      logLevel = 'warn';
    } else if (Math.abs(deltaFromInitialMB) > 10) {
      logLevel = 'info';
    }
    
    // Log memory stats
    this.log(logLevel, 
      `Memory: ${this.formatBytes(stats.heapUsed)} / ${this.formatBytes(stats.heapTotal)} ` +
      `(Δ${this.formatBytes(deltaFromInitial)}, peak: ${this.formatBytes(this.peakHeapUsed)})`
    );
    
    // Check for potential memory leak
    if (deltaFromInitialMB > 100) {
      this.log('error', `Potential memory leak detected! Memory increased by ${deltaFromInitialMB.toFixed(1)}MB`);
      
      // Force garbage collection if available (requires --enable-precise-memory-info flag)
      if ('gc' in window) {
        (window as any).gc();
        this.log('info', 'Forced garbage collection');
      }
    }
    
    this.lastStats = stats;
  }

  private formatBytes(bytes: number): string {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(1)}MB`;
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [MemoryMonitor]`;
    
    switch (level) {
      case 'debug':
        console.debug(prefix, message);
        break;
      case 'info':
        console.info(prefix, message);
        break;
      case 'warn':
        console.warn(prefix, message);
        break;
      case 'error':
        console.error(prefix, message);
        break;
    }
  }

  getPrometheusMetrics(): string {
    const stats = this.getMemoryStats();
    if (!stats) return '';
    
    const metrics: string[] = [];
    
    metrics.push('# HELP browser_memory_heap_used_bytes JavaScript heap memory used');
    metrics.push('# TYPE browser_memory_heap_used_bytes gauge');
    metrics.push(`browser_memory_heap_used_bytes ${stats.heapUsed}`);
    
    metrics.push('# HELP browser_memory_heap_total_bytes JavaScript heap memory total');
    metrics.push('# TYPE browser_memory_heap_total_bytes gauge');
    metrics.push(`browser_memory_heap_total_bytes ${stats.heapTotal}`);
    
    metrics.push('# HELP browser_memory_heap_limit_bytes JavaScript heap memory limit');
    metrics.push('# TYPE browser_memory_heap_limit_bytes gauge');
    metrics.push(`browser_memory_heap_limit_bytes ${stats.external}`);
    
    metrics.push('# HELP browser_memory_peak_heap_bytes Peak JavaScript heap memory used');
    metrics.push('# TYPE browser_memory_peak_heap_bytes gauge');
    metrics.push(`browser_memory_peak_heap_bytes ${this.peakHeapUsed}`);
    
    return metrics.join('\n');
  }
}

// Performance monitoring
class PerformanceMonitor {
  getWebVitals(): PerformanceStats {
    const stats: PerformanceStats = {};
    
    if (typeof window === 'undefined') return stats;
    
    // Get navigation timing
    const navTiming = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (navTiming) {
      stats.loadTime = navTiming.loadEventEnd - navTiming.fetchStart;
      stats.domContentLoadedTime = navTiming.domContentLoadedEventEnd - navTiming.fetchStart;
    }
    
    // Get paint timing
    const paintEntries = performance.getEntriesByType('paint');
    paintEntries.forEach(entry => {
      if (entry.name === 'first-paint') {
        stats.firstPaintTime = entry.startTime;
      } else if (entry.name === 'first-contentful-paint') {
        stats.firstContentfulPaintTime = entry.startTime;
      }
    });
    
    // Get LCP
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
    if (lcpEntries.length > 0) {
      const lastEntry = lcpEntries[lcpEntries.length - 1] as any;
      stats.largestContentfulPaintTime = lastEntry.startTime;
    }
    
    return stats;
  }
  
  getPrometheusMetrics(): string {
    const stats = this.getWebVitals();
    const metrics: string[] = [];
    
    if (stats.loadTime !== undefined) {
      metrics.push('# HELP browser_load_time_ms Page load time in milliseconds');
      metrics.push('# TYPE browser_load_time_ms gauge');
      metrics.push(`browser_load_time_ms ${stats.loadTime}`);
    }
    
    if (stats.firstContentfulPaintTime !== undefined) {
      metrics.push('# HELP browser_fcp_ms First Contentful Paint in milliseconds');
      metrics.push('# TYPE browser_fcp_ms gauge');
      metrics.push(`browser_fcp_ms ${stats.firstContentfulPaintTime}`);
    }
    
    if (stats.largestContentfulPaintTime !== undefined) {
      metrics.push('# HELP browser_lcp_ms Largest Contentful Paint in milliseconds');
      metrics.push('# TYPE browser_lcp_ms gauge');
      metrics.push(`browser_lcp_ms ${stats.largestContentfulPaintTime}`);
    }
    
    return metrics.join('\n');
  }
}

// Singleton instances
let memoryMonitor: MemoryMonitor | null = null;
let performanceMonitor: PerformanceMonitor | null = null;

export function startMonitoring(intervalSeconds: number = 60) {
  if (typeof window === 'undefined') return;
  
  if (!memoryMonitor) {
    memoryMonitor = new MemoryMonitor(intervalSeconds);
    memoryMonitor.start();
  }
  
  if (!performanceMonitor) {
    performanceMonitor = new PerformanceMonitor();
  }
}

export function stopMonitoring() {
  if (memoryMonitor) {
    memoryMonitor.stop();
    memoryMonitor = null;
  }
}

export function getMemoryMonitor(): MemoryMonitor | null {
  return memoryMonitor;
}

export function getPerformanceMonitor(): PerformanceMonitor | null {
  return performanceMonitor;
}

export function getAllMetrics(): string {
  const metrics: string[] = [];
  
  if (memoryMonitor) {
    metrics.push(memoryMonitor.getPrometheusMetrics());
  }
  
  if (performanceMonitor) {
    metrics.push(performanceMonitor.getPrometheusMetrics());
  }
  
  return metrics.filter(m => m).join('\n\n');
}