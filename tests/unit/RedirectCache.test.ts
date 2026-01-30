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

import { RedirectCache } from '../../src/client/RedirectCache';
import { EndPoint } from '../../src/utils/Config';

describe('RedirectCache', () => {
  let cache: RedirectCache;

  beforeEach(() => {
    cache = new RedirectCache(300000, 10000); // 5 minutes TTL, 10000 max size
  });

  describe('Basic Operations', () => {
    test('should store and retrieve endpoint', () => {
      const endpoint: EndPoint = { host: 'node1', port: 6667 };
      cache.set('device1', endpoint);

      const retrieved = cache.get('device1');
      expect(retrieved).toEqual(endpoint);
    });

    test('should return null for non-existent device', () => {
      const retrieved = cache.get('non-existent');
      expect(retrieved).toBeNull();
    });

    test('should remove cached endpoint', () => {
      const endpoint: EndPoint = { host: 'node1', port: 6667 };
      cache.set('device1', endpoint);

      cache.remove('device1');
      const retrieved = cache.get('device1');
      expect(retrieved).toBeNull();
    });

    test('should clear all cached endpoints', () => {
      cache.set('device1', { host: 'node1', port: 6667 });
      cache.set('device2', { host: 'node2', port: 6668 });
      cache.set('device3', { host: 'node3', port: 6669 });

      cache.clear();

      expect(cache.get('device1')).toBeNull();
      expect(cache.get('device2')).toBeNull();
      expect(cache.get('device3')).toBeNull();
    });

    test('should update existing endpoint', () => {
      const endpoint1: EndPoint = { host: 'node1', port: 6667 };
      const endpoint2: EndPoint = { host: 'node2', port: 6668 };

      cache.set('device1', endpoint1);
      cache.set('device1', endpoint2); // Update

      const retrieved = cache.get('device1');
      expect(retrieved).toEqual(endpoint2);
    });
  });

  describe('TTL Expiration', () => {
    test('should expire entries after TTL', async () => {
      const shortTTLCache = new RedirectCache(100, 10000); // 100ms TTL
      const endpoint: EndPoint = { host: 'node1', port: 6667 };

      shortTTLCache.set('device1', endpoint);
      expect(shortTTLCache.get('device1')).toEqual(endpoint);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150));

      const retrieved = shortTTLCache.get('device1');
      expect(retrieved).toBeNull();
    });

    test('should not expire with TTL=0 (no expiration)', async () => {
      const noExpiryCache = new RedirectCache(0, 10000); // No TTL
      const endpoint: EndPoint = { host: 'node1', port: 6667 };

      noExpiryCache.set('device1', endpoint);

      // Wait some time
      await new Promise((resolve) => setTimeout(resolve, 100));

      const retrieved = noExpiryCache.get('device1');
      expect(retrieved).toEqual(endpoint);
    });

    test('should return null for expired entry', async () => {
      const shortTTLCache = new RedirectCache(50, 10000); // 50ms TTL
      
      shortTTLCache.set('device1', { host: 'node1', port: 6667 });
      
      await new Promise((resolve) => setTimeout(resolve, 100));
      
      expect(shortTTLCache.get('device1')).toBeNull();
    });
  });

  describe('LRU Eviction', () => {
    test('should evict oldest entry when cache is full', () => {
      const smallCache = new RedirectCache(300000, 3); // Max 3 entries

      smallCache.set('device1', { host: 'node1', port: 6667 });
      smallCache.set('device2', { host: 'node2', port: 6668 });
      smallCache.set('device3', { host: 'node3', port: 6669 });

      let stats = smallCache.getStats();
      expect(stats.size).toBe(3);

      // Add 4th entry, should evict device1 (oldest)
      smallCache.set('device4', { host: 'node4', port: 6670 });

      expect(smallCache.get('device1')).toBeNull(); // Evicted
      expect(smallCache.get('device2')).not.toBeNull();
      expect(smallCache.get('device3')).not.toBeNull();
      expect(smallCache.get('device4')).not.toBeNull();
      
      // Get fresh stats after eviction
      stats = smallCache.getStats();
      expect(stats.size).toBe(3); // Still at max size
    });

    test('should handle multiple evictions', () => {
      const smallCache = new RedirectCache(300000, 2); // Max 2 entries

      smallCache.set('device1', { host: 'node1', port: 6667 });
      smallCache.set('device2', { host: 'node2', port: 6668 });
      smallCache.set('device3', { host: 'node3', port: 6669 });
      smallCache.set('device4', { host: 'node4', port: 6670 });

      // device1 and device2 should be evicted
      expect(smallCache.get('device1')).toBeNull();
      expect(smallCache.get('device2')).toBeNull();
      expect(smallCache.get('device3')).not.toBeNull();
      expect(smallCache.get('device4')).not.toBeNull();
    });

    test('should maintain LRU order when updating existing entries', () => {
      const smallCache = new RedirectCache(300000, 3); // Max 3 entries

      // Add 3 entries
      smallCache.set('device1', { host: 'node1', port: 6667 });
      smallCache.set('device2', { host: 'node2', port: 6668 });
      smallCache.set('device3', { host: 'node3', port: 6669 });

      // Update device1 (should move it to end of LRU)
      smallCache.set('device1', { host: 'node1-updated', port: 6670 });

      // Add device4, should evict device2 (now oldest), not device1
      smallCache.set('device4', { host: 'node4', port: 6671 });

      expect(smallCache.get('device1')).not.toBeNull(); // Still there (recently updated)
      expect(smallCache.get('device2')).toBeNull(); // Evicted (oldest)
      expect(smallCache.get('device3')).not.toBeNull(); // Still there
      expect(smallCache.get('device4')).not.toBeNull(); // Newly added

      // Verify device1 has updated endpoint
      const device1Endpoint = smallCache.get('device1');
      expect(device1Endpoint?.port).toBe(6670);
    });
  });

  describe('Statistics', () => {
    test('should return correct cache stats', () => {
      cache.set('device1', { host: 'node1', port: 6667 });
      cache.set('device2', { host: 'node2', port: 6668 });

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(10000);
      expect(stats.ttl).toBe(300000);
    });

    test('should update stats after operations', () => {
      cache.set('device1', { host: 'node1', port: 6667 });
      cache.set('device2', { host: 'node2', port: 6668 });
      cache.set('device3', { host: 'node3', port: 6669 });

      let stats = cache.getStats();
      expect(stats.size).toBe(3);

      cache.remove('device2');
      stats = cache.getStats();
      expect(stats.size).toBe(2);

      cache.clear();
      stats = cache.getStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle removing non-existent device', () => {
      cache.remove('non-existent');
      // Should not throw error
      expect(cache.get('non-existent')).toBeNull();
    });

    test('should handle clearing empty cache', () => {
      cache.clear();
      // Should not throw error
      const stats = cache.getStats();
      expect(stats.size).toBe(0);
    });

    test('should handle same host:port for different devices', () => {
      const endpoint: EndPoint = { host: 'node1', port: 6667 };
      cache.set('device1', endpoint);
      cache.set('device2', endpoint); // Same endpoint, different device

      expect(cache.get('device1')).toEqual(endpoint);
      expect(cache.get('device2')).toEqual(endpoint);

      const stats = cache.getStats();
      expect(stats.size).toBe(2); // Two separate entries
    });

    test('should handle special characters in device ID', () => {
      const deviceId = 'root.sg.d1.s_temp-01';
      const endpoint: EndPoint = { host: 'node1', port: 6667 };
      
      cache.set(deviceId, endpoint);
      const retrieved = cache.get(deviceId);
      
      expect(retrieved).toEqual(endpoint);
    });

    test('should handle very long device IDs', () => {
      const longDeviceId = 'root.' + 'sg.'.repeat(100) + 'device';
      const endpoint: EndPoint = { host: 'node1', port: 6667 };
      
      cache.set(longDeviceId, endpoint);
      const retrieved = cache.get(longDeviceId);
      
      expect(retrieved).toEqual(endpoint);
    });

    test('should handle maxSize=1', () => {
      const tinyCache = new RedirectCache(300000, 1);
      
      tinyCache.set('device1', { host: 'node1', port: 6667 });
      expect(tinyCache.get('device1')).not.toBeNull();
      
      tinyCache.set('device2', { host: 'node2', port: 6668 });
      expect(tinyCache.get('device1')).toBeNull(); // Evicted
      expect(tinyCache.get('device2')).not.toBeNull();
    });
  });

  describe('Concurrent-like Operations', () => {
    test('should handle rapid successive sets', () => {
      for (let i = 0; i < 100; i++) {
        cache.set(`device${i}`, { host: `node${i}`, port: 6667 + i });
      }

      // All should be retrievable (within maxSize limit)
      for (let i = 0; i < 100; i++) {
        const retrieved = cache.get(`device${i}`);
        if (i < 90) {
          // First 90 might be evicted (maxSize is 10000, so all should be there)
          expect(retrieved).not.toBeNull();
        }
      }
    });

    test('should handle rapid successive gets', () => {
      cache.set('device1', { host: 'node1', port: 6667 });

      for (let i = 0; i < 100; i++) {
        const retrieved = cache.get('device1');
        expect(retrieved).toEqual({ host: 'node1', port: 6667 });
      }
    });

    test('should handle mixed operations', () => {
      // Mix of set, get, remove operations
      cache.set('device1', { host: 'node1', port: 6667 });
      expect(cache.get('device1')).not.toBeNull();
      
      cache.set('device2', { host: 'node2', port: 6668 });
      cache.remove('device1');
      expect(cache.get('device1')).toBeNull();
      
      cache.set('device3', { host: 'node3', port: 6669 });
      expect(cache.get('device2')).not.toBeNull();
      expect(cache.get('device3')).not.toBeNull();
    });
  });
});
