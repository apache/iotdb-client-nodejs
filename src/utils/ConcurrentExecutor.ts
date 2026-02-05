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

/**
 * Concurrent Execution Utilities for Node.js
 * 
 * This module provides utilities optimized for Node.js async patterns,
 * enabling high-throughput operations with controlled concurrency.
 * 
 * Key differences from Java's multi-threading approach:
 * - Node.js uses event loop + Promise-based concurrency (not threads)
 * - Optimal concurrency depends on I/O-bound vs CPU-bound operations
 * - For IoTDB operations (network I/O bound), high concurrency is beneficial
 */

import { logger } from "./Logger";

/**
 * Options for concurrent execution
 */
export interface ConcurrentOptions {
  /** Maximum concurrent operations (default: 10) */
  concurrency?: number;
  /** Stop on first error (default: false) */
  stopOnError?: boolean;
  /** Log progress every N items (default: 0 = disabled) */
  logProgressEvery?: number;
}

/**
 * Result of concurrent execution with statistics
 */
export interface ConcurrentResult<T> {
  /** 
   * Results array (same order as input).
   * Note: Failed operations will have `undefined` at their index.
   * Use `errors` array to correlate failures with their indices.
   */
  results: (T | undefined)[];
  /** Total execution time in milliseconds */
  durationMs: number;
  /** Number of successful operations */
  successCount: number;
  /** Number of failed operations */
  failureCount: number;
  /** Array of errors with their indices */
  errors: { index: number; error: Error }[];
}

/**
 * Execute async operations concurrently with controlled parallelism.
 * This is the core utility for high-throughput Node.js operations.
 * 
 * Unlike Java's ExecutorService with thread pools, this uses Promise-based
 * concurrency which is more efficient for I/O-bound operations like
 * database writes.
 * 
 * @param items Array of items to process
 * @param operation Async function to execute for each item
 * @param options Concurrency configuration
 * @returns Detailed execution results
 * 
 * @example
 * ```typescript
 * // Process 1000 items with max 20 concurrent operations
 * const result = await executeConcurrent(
 *   items,
 *   async (item, index) => {
 *     await someAsyncOperation(item);
 *     return `Processed ${index}`;
 *   },
 *   { concurrency: 20, logProgressEvery: 100 }
 * );
 * console.log(`Success: ${result.successCount}, Failed: ${result.failureCount}`);
 * ```
 */
export async function executeConcurrent<T, R>(
  items: T[],
  operation: (item: T, index: number) => Promise<R>,
  options?: ConcurrentOptions,
): Promise<ConcurrentResult<R>> {
  const startTime = Date.now();
  
  if (items.length === 0) {
    return {
      results: [],
      durationMs: 0,
      successCount: 0,
      failureCount: 0,
      errors: [],
    };
  }

  const concurrency = Math.min(options?.concurrency || 10, items.length);
  const stopOnError = options?.stopOnError ?? false;
  const logProgressEvery = options?.logProgressEvery ?? 0;

  const results: (R | undefined)[] = new Array(items.length);
  const errors: { index: number; error: Error }[] = [];
  let itemIndex = 0;
  let completedCount = 0;
  let shouldStop = false;

  // Create worker promises
  const workers: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(
      (async () => {
        while (!shouldStop && itemIndex < items.length) {
          const idx = itemIndex++;
          if (idx >= items.length) break;

          try {
            results[idx] = await operation(items[idx], idx);
            completedCount++;

            // Log progress if enabled
            if (logProgressEvery > 0 && completedCount % logProgressEvery === 0) {
              const elapsed = Date.now() - startTime;
              const rate = completedCount / (elapsed / 1000);
              logger.info(
                `[Progress] ${completedCount}/${items.length} (${rate.toFixed(2)} items/sec)`,
              );
            }
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            errors.push({ index: idx, error });
            if (stopOnError) {
              shouldStop = true;
              break;
            }
          }
        }
      })(),
    );
  }

  // Wait for all workers to complete
  await Promise.all(workers);

  const durationMs = Date.now() - startTime;

  return {
    results,
    durationMs,
    successCount: items.length - errors.length,
    failureCount: errors.length,
    errors,
  };
}

/**
 * Execute operations in batches with concurrent execution within each batch.
 * Useful when you need to respect rate limits or ensure ordering between batches.
 * 
 * @param items Array of items to process
 * @param batchSize Number of items per batch
 * @param operation Async function to execute for each item
 * @param options Concurrency configuration (applied within each batch)
 * @returns Combined results from all batches
 * 
 * @example
 * ```typescript
 * // Process items in batches of 100, with 10 concurrent operations per batch
 * const result = await executeBatched(
 *   items,
 *   100,  // batch size
 *   async (item) => await process(item),
 *   { concurrency: 10 }
 * );
 * ```
 */
export async function executeBatched<T, R>(
  items: T[],
  batchSize: number,
  operation: (item: T, index: number) => Promise<R>,
  options?: ConcurrentOptions,
): Promise<ConcurrentResult<R>> {
  const startTime = Date.now();
  
  if (items.length === 0) {
    return {
      results: [],
      durationMs: 0,
      successCount: 0,
      failureCount: 0,
      errors: [],
    };
  }

  const allResults: (R | undefined)[] = [];
  const allErrors: { index: number; error: Error }[] = [];
  let totalSuccess = 0;
  let globalIndex = 0;

  // Process in batches
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchStartIndex = globalIndex;

    const batchResult = await executeConcurrent(
      batch,
      (item, idx) => operation(item, batchStartIndex + idx),
      { ...options, logProgressEvery: 0 }, // Disable per-batch logging
    );

    // Collect results
    allResults.push(...batchResult.results);
    totalSuccess += batchResult.successCount;

    // Adjust error indices to global
    for (const err of batchResult.errors) {
      allErrors.push({ index: batchStartIndex + err.index, error: err.error });
    }

    globalIndex += batch.length;

    // Log batch progress
    if (options?.logProgressEvery && options.logProgressEvery > 0) {
      logger.info(
        `[Batch] Completed ${Math.min(i + batchSize, items.length)}/${items.length} items`,
      );
    }

    // Stop on error if configured
    if (options?.stopOnError && batchResult.errors.length > 0) {
      break;
    }
  }

  return {
    results: allResults,
    durationMs: Date.now() - startTime,
    successCount: totalSuccess,
    failureCount: allErrors.length,
    errors: allErrors,
  };
}

/**
 * Chunk an array into smaller arrays of specified size.
 * Useful for manual batch processing.
 * 
 * @param array Array to chunk
 * @param size Maximum size of each chunk
 * @returns Array of chunks
 * 
 * @example
 * ```typescript
 * const tablets = generateTablets(1000);
 * const chunks = chunkArray(tablets, 100);
 * // chunks.length === 10, each chunk has 100 tablets
 * ```
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Create a promise-based semaphore for limiting concurrent operations.
 * This is useful when you need fine-grained control over concurrency.
 * 
 * @param limit Maximum concurrent operations
 * @returns Semaphore object with acquire/release methods
 * 
 * @example
 * ```typescript
 * const sem = createSemaphore(5);  // Max 5 concurrent
 * 
 * async function processItem(item) {
 *   await sem.acquire();
 *   try {
 *     await doWork(item);
 *   } finally {
 *     sem.release();
 *   }
 * }
 * ```
 */
export function createSemaphore(limit: number) {
  let running = 0;
  const queue: (() => void)[] = [];

  return {
    async acquire(): Promise<void> {
      if (running < limit) {
        running++;
        return;
      }

      return new Promise<void>((resolve) => {
        queue.push(resolve);
      });
    },

    release(): void {
      const next = queue.shift();
      if (next) {
        // Keep running at the same level - transfer slot to queued waiter
        next();
      } else {
        // Only decrement if no queued item waiting
        running--;
      }
    },

    get available(): number {
      return limit - running;
    },

    get waiting(): number {
      return queue.length;
    },
  };
}
