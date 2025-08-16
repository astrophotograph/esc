/**
 * Utilities for safe stream handling with memory management
 */

export interface StreamOptions {
  maxSize?: number; // Maximum bytes to process
  timeout?: number; // Timeout in milliseconds
  chunkSize?: number; // Size of chunks to process
}

const DEFAULT_OPTIONS: StreamOptions = {
  maxSize: 10 * 1024 * 1024, // 10MB default max
  timeout: 30000, // 30 seconds
  chunkSize: 64 * 1024, // 64KB chunks
};

/**
 * Create a memory-safe transform stream with size limits and cleanup
 */
export function createSafeTransformStream(options: StreamOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let totalBytes = 0;
  let aborted = false;

  const transformer = new TransformStream({
    async transform(chunk, controller) {
      if (aborted) {
        controller.terminate();
        return;
      }

      // Check size limit
      totalBytes += chunk.byteLength;
      if (opts.maxSize && totalBytes > opts.maxSize) {
        aborted = true;
        controller.error(new Error(`Stream exceeded maximum size of ${opts.maxSize} bytes`));
        return;
      }

      // Process in smaller chunks if needed
      if (opts.chunkSize && chunk.byteLength > opts.chunkSize) {
        let offset = 0;
        while (offset < chunk.byteLength && !aborted) {
          const size = Math.min(opts.chunkSize, chunk.byteLength - offset);
          const subChunk = chunk.slice(offset, offset + size);
          controller.enqueue(subChunk);
          offset += size;
          
          // Yield to event loop periodically
          if (offset % (opts.chunkSize * 10) === 0) {
            await new Promise(resolve => setImmediate(resolve));
          }
        }
      } else {
        controller.enqueue(chunk);
      }
    },

    flush(controller) {
      console.log(`Stream completed: ${totalBytes} bytes processed`);
    },
  });

  return {
    transformer,
    abort: () => {
      aborted = true;
    },
    bytesProcessed: () => totalBytes,
  };
}

/**
 * Safely pipe a stream with automatic cleanup and memory management
 */
export async function safePipeStream(
  source: ReadableStream,
  destination: WritableStream,
  options: StreamOptions = {}
): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const reader = source.getReader();
  const writer = destination.getWriter();
  
  let totalBytes = 0;
  let timeoutId: NodeJS.Timeout | undefined;
  
  // Set timeout
  if (opts.timeout) {
    timeoutId = setTimeout(() => {
      reader.cancel('Timeout').catch(() => {});
      writer.abort('Timeout').catch(() => {});
    }, opts.timeout);
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Check size limit
      totalBytes += value.byteLength;
      if (opts.maxSize && totalBytes > opts.maxSize) {
        throw new Error(`Stream exceeded maximum size of ${opts.maxSize} bytes`);
      }

      // Write with backpressure handling
      await writer.ready;
      await writer.write(value);
      
      // Yield to event loop periodically to prevent blocking
      if (totalBytes % (1024 * 1024) === 0) { // Every 1MB
        await new Promise(resolve => setImmediate(resolve));
      }
    }
  } finally {
    // Clean up
    if (timeoutId) clearTimeout(timeoutId);
    
    try {
      await reader.cancel();
    } catch (e) {
      // Ignore cleanup errors
    }
    
    try {
      await writer.close();
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Create a stream that automatically cleans up after a timeout
 */
export function createAutoCleanupStream(
  stream: ReadableStream,
  timeoutMs: number = 60000
): ReadableStream {
  let cleaned = false;
  const reader = stream.getReader();
  
  // Auto cleanup after timeout
  const cleanupTimeout = setTimeout(() => {
    if (!cleaned) {
      cleaned = true;
      reader.cancel('Auto cleanup timeout').catch(() => {});
    }
  }, timeoutMs);

  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          clearTimeout(cleanupTimeout);
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        clearTimeout(cleanupTimeout);
        controller.error(error);
      }
    },
    
    cancel(reason) {
      clearTimeout(cleanupTimeout);
      cleaned = true;
      return reader.cancel(reason);
    },
  });
}

/**
 * Monitor memory usage and trigger GC if available
 */
export function checkMemoryPressure(): boolean {
  if (typeof process === 'undefined') return false;
  
  const memUsage = process.memoryUsage();
  const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
  const externalMB = memUsage.external / 1024 / 1024;
  const totalMB = heapUsedMB + externalMB;
  
  // Check if we're under memory pressure
  const underPressure = totalMB > 300;
  
  if (underPressure) {
    console.warn(`Memory pressure detected: Heap ${heapUsedMB.toFixed(1)}MB, External ${externalMB.toFixed(1)}MB`);
    
    // Try to trigger GC if available
    if (global.gc) {
      console.log('Triggering garbage collection...');
      global.gc();
      
      // Check memory after GC
      const afterGC = process.memoryUsage();
      const freedMB = (memUsage.heapUsed - afterGC.heapUsed) / 1024 / 1024;
      console.log(`GC freed ${freedMB.toFixed(1)}MB`);
    }
  }
  
  return underPressure;
}