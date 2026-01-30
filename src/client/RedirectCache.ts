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

import { EndPoint } from "../utils/Config";
import { logger } from "../utils/Logger";

interface CacheEntry {
  endpoint: EndPoint;
  timestamp: number;
}

/**
 * Cache for device-to-endpoint redirect mappings.
 * Supports TTL-based expiration and LRU eviction.
 */
export class RedirectCache {
  private deviceToEndpoint: Map<string, CacheEntry> = new Map();
  private ttl: number;
  private maxSize: number;

  constructor(ttl: number = 300000, maxSize: number = 10000) {
    this.ttl = ttl;
    this.maxSize = maxSize;
  }

  /**
   * Get cached endpoint for a device.
   * Returns null if not cached or expired.
   */
  get(deviceId: string): EndPoint | null {
    const entry = this.deviceToEndpoint.get(deviceId);

    if (!entry) {
      return null;
    }

    // Check expiration
    if (this.ttl > 0 && Date.now() - entry.timestamp > this.ttl) {
      this.deviceToEndpoint.delete(deviceId);
      logger.debug(`Redirect cache expired for device: ${deviceId}`);
      return null;
    }

    return entry.endpoint;
  }

  /**
   * Cache endpoint for a device.
   */
  set(deviceId: string, endpoint: EndPoint): void {
    // Check if key already exists - if so, delete it first to maintain LRU order
    const exists = this.deviceToEndpoint.has(deviceId);
    if (exists) {
      this.deviceToEndpoint.delete(deviceId);
    }

    // Evict oldest entry if cache is full and we're adding a new entry (not updating)
    if (!exists && this.deviceToEndpoint.size >= this.maxSize) {
      const firstKey = this.deviceToEndpoint.keys().next().value;
      if (firstKey) {
        this.deviceToEndpoint.delete(firstKey);
        logger.debug(`Evicted oldest redirect cache entry: ${firstKey}`);
      }
    }

    // Add the entry (will be at the end of the Map, maintaining LRU order)
    this.deviceToEndpoint.set(deviceId, {
      endpoint,
      timestamp: Date.now(),
    });

    logger.debug(
      `Cached redirect: ${deviceId} -> ${endpoint.host}:${endpoint.port}`,
    );
  }

  /**
   * Remove cached endpoint for a device.
   */
  remove(deviceId: string): void {
    this.deviceToEndpoint.delete(deviceId);
    logger.debug(`Removed redirect cache for device: ${deviceId}`);
  }

  /**
   * Clear all cached mappings.
   */
  clear(): void {
    this.deviceToEndpoint.clear();
    logger.debug("Cleared all redirect cache entries");
  }

  /**
   * Get cache statistics.
   */
  getStats(): { size: number; maxSize: number; ttl: number } {
    return {
      size: this.deviceToEndpoint.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
    };
  }
}
