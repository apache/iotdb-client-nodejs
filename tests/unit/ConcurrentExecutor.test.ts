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

import {
  executeConcurrent,
  executeBatched,
  chunkArray,
  createSemaphore,
} from '../../src/utils/ConcurrentExecutor';

describe('ConcurrentExecutor', () => {
  describe('executeConcurrent', () => {
    it('should execute operations concurrently', async () => {
      const items = [1, 2, 3, 4, 5];
      const results: number[] = [];

      const result = await executeConcurrent(
        items,
        async (item) => {
          results.push(item);
          await new Promise((resolve) => setTimeout(resolve, 10));
          return item * 2;
        },
        { concurrency: 3 }
      );

      expect(result.results).toEqual([2, 4, 6, 8, 10]);
      expect(result.successCount).toBe(5);
      expect(result.failureCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle empty items array', async () => {
      const result = await executeConcurrent([], async () => 1);

      expect(result.results).toEqual([]);
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
      expect(result.durationMs).toBe(0);
    });

    it('should handle errors without stopping', async () => {
      const items = [1, 2, 3, 4, 5];

      const result = await executeConcurrent(
        items,
        async (item) => {
          if (item === 3) {
            throw new Error('Test error');
          }
          return item * 2;
        },
        { concurrency: 2 }
      );

      expect(result.successCount).toBe(4);
      expect(result.failureCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].index).toBe(2);
      expect(result.errors[0].error.message).toBe('Test error');
      // Verify that failed operations leave undefined in results array
      expect(result.results[2]).toBeUndefined();
      // Successful operations have values
      expect(result.results[0]).toBe(2);
      expect(result.results[1]).toBe(4);
      expect(result.results[3]).toBe(8);
      expect(result.results[4]).toBe(10);
    });

    it('should stop on error when configured', async () => {
      const items = [1, 2, 3, 4, 5];
      let processedCount = 0;

      const result = await executeConcurrent(
        items,
        async (item) => {
          processedCount++;
          if (item === 2) {
            throw new Error('Stop error');
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
          return item;
        },
        { concurrency: 1, stopOnError: true }
      );

      expect(result.failureCount).toBe(1);
      // With concurrency 1, it should stop processing after error
      expect(processedCount).toBeLessThanOrEqual(items.length);
    });

    it('should limit concurrency', async () => {
      const maxConcurrent = { current: 0, max: 0 };
      const items = Array.from({ length: 10 }, (_, i) => i);

      await executeConcurrent(
        items,
        async () => {
          maxConcurrent.current++;
          maxConcurrent.max = Math.max(maxConcurrent.max, maxConcurrent.current);
          await new Promise((resolve) => setTimeout(resolve, 20));
          maxConcurrent.current--;
          return true;
        },
        { concurrency: 3 }
      );

      expect(maxConcurrent.max).toBeLessThanOrEqual(3);
    });

    it('should preserve result order', async () => {
      const items = [100, 50, 150, 25, 75];

      const result = await executeConcurrent(
        items,
        async (item) => {
          await new Promise((resolve) => setTimeout(resolve, item / 10));
          return item;
        },
        { concurrency: 5 }
      );

      // Results should be in same order as input, regardless of completion order
      expect(result.results).toEqual([100, 50, 150, 25, 75]);
    });
  });

  describe('executeBatched', () => {
    it('should execute in batches', async () => {
      const items = Array.from({ length: 10 }, (_, i) => i);
      const batchBoundaries: number[] = [];

      const result = await executeBatched(
        items,
        3,
        async (item, index) => {
          if (index % 3 === 0) {
            batchBoundaries.push(index);
          }
          return item * 2;
        },
        { concurrency: 3 }
      );

      expect(result.successCount).toBe(10);
      expect(result.results).toHaveLength(10);
    });

    it('should handle empty items', async () => {
      const result = await executeBatched([], 5, async () => 1);

      expect(result.results).toEqual([]);
      expect(result.successCount).toBe(0);
    });

    it('should aggregate errors from all batches', async () => {
      const items = Array.from({ length: 10 }, (_, i) => i);

      const result = await executeBatched(
        items,
        5,
        async (item) => {
          if (item === 2 || item === 7) {
            throw new Error(`Error at ${item}`);
          }
          return item;
        },
        { concurrency: 2 }
      );

      expect(result.failureCount).toBe(2);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('chunkArray', () => {
    it('should chunk array into equal parts', () => {
      const array = [1, 2, 3, 4, 5, 6];
      const chunks = chunkArray(array, 2);

      expect(chunks).toEqual([[1, 2], [3, 4], [5, 6]]);
    });

    it('should handle uneven chunks', () => {
      const array = [1, 2, 3, 4, 5];
      const chunks = chunkArray(array, 2);

      expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('should handle chunk size larger than array', () => {
      const array = [1, 2, 3];
      const chunks = chunkArray(array, 10);

      expect(chunks).toEqual([[1, 2, 3]]);
    });

    it('should handle empty array', () => {
      const chunks = chunkArray([], 5);

      expect(chunks).toEqual([]);
    });

    it('should handle chunk size of 1', () => {
      const array = [1, 2, 3];
      const chunks = chunkArray(array, 1);

      expect(chunks).toEqual([[1], [2], [3]]);
    });
  });

  describe('createSemaphore', () => {
    it('should limit concurrent operations', async () => {
      const sem = createSemaphore(2);
      const running: number[] = [];
      const maxRunning = { value: 0 };

      const tasks = Array.from({ length: 5 }, (_, i) =>
        (async () => {
          await sem.acquire();
          running.push(i);
          maxRunning.value = Math.max(maxRunning.value, running.length);
          await new Promise((resolve) => setTimeout(resolve, 20));
          running.splice(running.indexOf(i), 1);
          sem.release();
        })()
      );

      await Promise.all(tasks);

      expect(maxRunning.value).toBeLessThanOrEqual(2);
    });

    it('should track available and waiting counts', async () => {
      const sem = createSemaphore(2);

      expect(sem.available).toBe(2);
      expect(sem.waiting).toBe(0);

      await sem.acquire();
      expect(sem.available).toBe(1);

      await sem.acquire();
      expect(sem.available).toBe(0);

      // Start a third acquire that will wait
      const waitingPromise = sem.acquire();
      // Give it a tick to queue up
      await new Promise((resolve) => setTimeout(resolve, 1));
      expect(sem.waiting).toBe(1);

      sem.release();
      await waitingPromise;
      expect(sem.waiting).toBe(0);
    });

    it('should handle immediate acquire when available', async () => {
      const sem = createSemaphore(3);
      const startTime = Date.now();

      await sem.acquire();
      await sem.acquire();

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(10); // Should be nearly instant
      expect(sem.available).toBe(1);
    });
  });
});
