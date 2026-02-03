/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { logger } from "./Logger";

/**
 * Buffer pool for reusing buffers to reduce GC pressure
 * Inspired by pg nodejs client's buffer management strategy
 * 
 * Key design principles:
 * 1. Size classes to minimize waste (powers of 2)
 * 2. Maximum pool size to prevent memory bloat
 * 3. Clear statistics for monitoring
 */
export class BufferPool {
  // Size classes: 1KB, 4KB, 16KB, 64KB, 256KB, 1MB, 4MB
  private static readonly SIZE_CLASSES = [
    1024,       // 1KB
    4096,       // 4KB
    16384,      // 16KB
    65536,      // 64KB
    262144,     // 256KB
    1048576,    // 1MB
    4194304,    // 4MB
  ];
  
  // Maximum buffers per size class
  private static readonly MAX_BUFFERS_PER_CLASS = 10;
  
  // Pools organized by size class
  private pools: Map<number, Buffer[]>;
  
  // Statistics
  private stats = {
    hits: 0,
    misses: 0,
    allocations: 0,
    returns: 0,
  };

  constructor() {
    this.pools = new Map();
    for (const size of BufferPool.SIZE_CLASSES) {
      this.pools.set(size, []);
    }
  }

  /**
   * Get a buffer of at least the requested size
   * Returns a pooled buffer if available, otherwise allocates new
   */
  acquire(minSize: number): Buffer {
    // Find appropriate size class
    const sizeClass = this.getSizeClass(minSize);
    
    if (sizeClass === null) {
      // Size too large for pooling, allocate directly
      this.stats.misses++;
      this.stats.allocations++;
      return Buffer.allocUnsafe(minSize);
    }

    const pool = this.pools.get(sizeClass);
    if (!pool) {
      this.stats.misses++;
      this.stats.allocations++;
      return Buffer.allocUnsafe(sizeClass);
    }

    const buffer = pool.pop();
    if (buffer) {
      this.stats.hits++;
      // Return the full buffer from the pool (will be sized to sizeClass)
      // The caller is responsible for using only minSize bytes
      return buffer.subarray(0, minSize);
    } else {
      this.stats.misses++;
      this.stats.allocations++;
      return Buffer.allocUnsafe(sizeClass);
    }
  }

  /**
   * Return a buffer to the pool for reuse
   * Only pools buffers that fit in size classes
   */
  release(buffer: Buffer): void {
    const sizeClass = this.getSizeClass(buffer.length);
    
    if (sizeClass === null) {
      // Buffer too large for pooling, let GC handle it
      return;
    }

    const pool = this.pools.get(sizeClass);
    if (!pool) {
      return;
    }

    // Only pool if we haven't hit the limit
    if (pool.length < BufferPool.MAX_BUFFERS_PER_CLASS) {
      // Only pool if it matches the size class exactly
      if (buffer.length === sizeClass) {
        pool.push(buffer);
        this.stats.returns++;
      }
    }
  }

  /**
   * Find the appropriate size class for a requested size
   * Returns null if size is too large for pooling
   */
  private getSizeClass(size: number): number | null {
    for (const sizeClass of BufferPool.SIZE_CLASSES) {
      if (size <= sizeClass) {
        return sizeClass;
      }
    }
    return null; // Too large for pooling
  }

  /**
   * Get pool statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : '0.00';
    
    const pooledBuffers = Array.from(this.pools.values()).reduce(
      (sum, pool) => sum + pool.length,
      0
    );

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      pooledBuffers,
    };
  }

  /**
   * Clear all pooled buffers
   */
  clear(): void {
    for (const pool of this.pools.values()) {
      pool.length = 0;
    }
    logger.debug('BufferPool cleared');
  }

  /**
   * Log statistics (for debugging)
   */
  logStats(): void {
    const stats = this.getStats();
    logger.debug(`BufferPool stats: ${JSON.stringify(stats)}`);
  }
}

// Global singleton instance
export const globalBufferPool = new BufferPool();
