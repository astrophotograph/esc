/**
 * Connection pool to limit concurrent connections and prevent memory exhaustion
 */

interface Connection {
  id: string;
  type: 'sse' | 'websocket' | 'stream';
  created: Date;
  lastActivity: Date;
  scope?: string;
}

class ConnectionPool {
  private connections = new Map<string, Connection>();
  private maxConnections: number;
  private maxConnectionAge: number; // milliseconds
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(maxConnections = 50, maxConnectionAgeMs = 5 * 60 * 1000) {
    this.maxConnections = maxConnections;
    this.maxConnectionAge = maxConnectionAgeMs;
    
    // Start cleanup interval
    this.startCleanup();
  }

  private startCleanup() {
    // Clean up stale connections every 30 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanupStale();
    }, 30000);
  }

  private cleanupStale() {
    const now = Date.now();
    const staleIds: string[] = [];
    
    for (const [id, conn] of this.connections) {
      const age = now - conn.created.getTime();
      const idle = now - conn.lastActivity.getTime();
      
      // Remove if too old or idle for too long
      if (age > this.maxConnectionAge || idle > 60000) {
        staleIds.push(id);
      }
    }
    
    for (const id of staleIds) {
      this.remove(id);
      console.log(`Cleaned up stale connection: ${id}`);
    }
    
    if (staleIds.length > 0) {
      console.log(`ConnectionPool: Cleaned ${staleIds.length} stale connections. Active: ${this.connections.size}`);
    }
  }

  canAccept(): boolean {
    this.cleanupStale(); // Clean before checking
    return this.connections.size < this.maxConnections;
  }

  add(id: string, type: Connection['type'], scope?: string): boolean {
    if (!this.canAccept()) {
      // Try to make room by removing oldest connection
      const oldest = this.getOldestConnection();
      if (oldest) {
        console.warn(`ConnectionPool: At capacity, removing oldest connection: ${oldest.id}`);
        this.remove(oldest.id);
      } else {
        console.error(`ConnectionPool: Maximum connections (${this.maxConnections}) reached`);
        return false;
      }
    }
    
    this.connections.set(id, {
      id,
      type,
      created: new Date(),
      lastActivity: new Date(),
      scope,
    });
    
    console.log(`ConnectionPool: Added ${type} connection ${id}. Active: ${this.connections.size}`);
    return true;
  }

  remove(id: string): void {
    if (this.connections.delete(id)) {
      console.log(`ConnectionPool: Removed connection ${id}. Active: ${this.connections.size}`);
    }
  }

  touch(id: string): void {
    const conn = this.connections.get(id);
    if (conn) {
      conn.lastActivity = new Date();
    }
  }

  getOldestConnection(): Connection | undefined {
    let oldest: Connection | undefined;
    let oldestTime = Date.now();
    
    for (const conn of this.connections.values()) {
      if (conn.created.getTime() < oldestTime) {
        oldest = conn;
        oldestTime = conn.created.getTime();
      }
    }
    
    return oldest;
  }

  getStats() {
    const types = { sse: 0, websocket: 0, stream: 0 };
    for (const conn of this.connections.values()) {
      types[conn.type]++;
    }
    
    return {
      total: this.connections.size,
      max: this.maxConnections,
      types,
      usage: (this.connections.size / this.maxConnections) * 100,
    };
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.connections.clear();
  }
}

// Global singleton instance
let globalPool: ConnectionPool | null = null;

export function getConnectionPool(): ConnectionPool {
  if (!globalPool) {
    // Limit based on environment
    const maxConnections = process.env.NODE_ENV === 'production' ? 100 : 50;
    globalPool = new ConnectionPool(maxConnections);
  }
  return globalPool;
}

export function resetConnectionPool(): void {
  if (globalPool) {
    globalPool.destroy();
    globalPool = null;
  }
}