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
  Session,
  TreeTablet,
  TableTablet,
  ITreeTablet,
  ITableTablet,
  SessionDataSet,
} from "./Session";
import {
  PoolConfig,
  DEFAULT_POOL_CONFIG,
  EndPoint,
  parseNodeUrls,
} from "../utils/Config";
import { logger } from "../utils/Logger";
import { registerClosable, unregisterClosable } from "../utils/ProcessCleanup";
import { RedirectCache } from "./RedirectCache";
import Denque from "denque";

interface PooledSession {
  session: Session;
  lastUsed: number;
  inUse: boolean;
}

/**
 * Base class for session pooling with common functionality
 * Provides connection pooling, round-robin load balancing, and automatic cleanup
 */
export abstract class BaseSessionPool {
  protected config: PoolConfig;
  protected endPoints: EndPoint[];
  protected pool: PooledSession[] = [];
  protected waitQueue: Denque<(session: Session) => void> = new Denque();
  protected idleSessions: Denque<PooledSession> = new Denque();
  protected activeSessions: Set<PooledSession> = new Set();
  protected currentEndPointIndex = 0;
  protected cleanupInterval: ReturnType<typeof setInterval> | null = null;
  protected redirectCache: RedirectCache;
  protected endPointToSession: Map<string, PooledSession> = new Map();

  constructor(
    hostsOrConfig: string | string[] | PoolConfig,
    port?: number,
    config?: Partial<PoolConfig>,
  ) {
    // Handle different constructor signatures for backward compatibility
    if (typeof hostsOrConfig === "object" && !Array.isArray(hostsOrConfig)) {
      // New format: constructor(config: PoolConfig)
      const poolConfig = hostsOrConfig as PoolConfig;
      this.config = { ...DEFAULT_POOL_CONFIG, ...poolConfig } as PoolConfig;

      if (poolConfig.nodeUrls) {
        if (poolConfig.nodeUrls.length === 0) {
          throw new Error("nodeUrls array cannot be empty");
        }
        // Parse nodeUrls if in string format
        this.endPoints =
          typeof poolConfig.nodeUrls[0] === "string"
            ? parseNodeUrls(poolConfig.nodeUrls as string[])
            : (poolConfig.nodeUrls as EndPoint[]);
      } else if (poolConfig.host && poolConfig.port) {
        this.endPoints = [{ host: poolConfig.host, port: poolConfig.port }];
      } else {
        throw new Error(
          "Either nodeUrls or host/port must be provided in config",
        );
      }
    } else {
      // Old format: constructor(hosts: string | string[], port: number, config?: Partial<PoolConfig>)
      if (port === undefined) {
        throw new Error(
          "Port must be provided when using host-based constructor",
        );
      }

      this.config = { ...DEFAULT_POOL_CONFIG, ...config, port } as PoolConfig;

      const hostList = Array.isArray(hostsOrConfig)
        ? hostsOrConfig
        : [hostsOrConfig];
      this.endPoints = hostList.map((host) => ({ host, port }));
    }

    // Initialize redirect cache
    this.redirectCache = new RedirectCache(
      this.config.redirectCacheTTL || 300000,
      10000, // max size
    );

    logger.info(
      `${this.getPoolName()} created with ${this.endPoints.length} endpoints, max pool size: ${this.config.maxPoolSize}, redirection: ${this.config.enableRedirection ? "enabled" : "disabled"}`,
    );

    registerClosable(this);
  }

  /**
   * Get the name of the pool for logging purposes
   */
  protected abstract getPoolName(): string;

  /**
   * Create a new session with pool-specific initialization
   */
  protected abstract createPoolSession(): Promise<Session>;

  async init(): Promise<void> {
    // Create minimum pool size connections in parallel
    const minSize = this.config.minPoolSize || 1;

    try {
      await Promise.all(
        Array.from({ length: minSize }, () => this.createSession()),
      );
    } catch (error: any) {
      const errorMsg = `Failed to initialize pool: ${error.message}`;
      logger.error(errorMsg);
      if (error.stack) {
        logger.error(`Stack trace: ${error.stack}`);
      }
      throw new Error(errorMsg);
    }

    // Start cleanup interval with proper async handling
    // Use unref() so it doesn't keep the process alive
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleSessions().catch((error) => {
        logger.error("Error during scheduled session cleanup:", error);
      });
    }, 30000).unref(); // Check every 30 seconds

    logger.info(`${this.getPoolName()} initialized with ${minSize} sessions`);
  }

  private async createSession(): Promise<Session> {
    const session = await this.createPoolSession();

    const pooledSession: PooledSession = {
      session,
      lastUsed: Date.now(),
      inUse: false,
    };

    this.pool.push(pooledSession);
    this.idleSessions.push(pooledSession);

    return session;
  }

  protected getNextEndPoint(): EndPoint {
    // Round-robin selection
    const endPoint = this.endPoints[this.currentEndPointIndex];
    this.currentEndPointIndex =
      (this.currentEndPointIndex + 1) % this.endPoints.length;
    return endPoint;
  }

  /**
   * Extract device ID from tablet for caching
   */
  protected extractDeviceId(
    tablet: TreeTablet | ITreeTablet | TableTablet | ITableTablet,
  ): string {
    if ("deviceId" in tablet) {
      return tablet.deviceId;
    } else if ("tableName" in tablet) {
      return tablet.tableName;
    }
    throw new Error("Unable to extract device ID from tablet");
  }

  /**
   * Get or create a session for a specific endpoint
   */
  protected async getSessionForEndpoint(endpoint: EndPoint): Promise<Session> {
    const key = `${endpoint.host}:${endpoint.port}`;

    // Check if we already have a session for this endpoint
    let pooledSession = this.endPointToSession.get(key);

    if (pooledSession && pooledSession.session.isOpen()) {
      pooledSession.inUse = true;
      pooledSession.lastUsed = Date.now();
      return pooledSession.session;
    }

    // Create new session for this endpoint
    const session = await this.createPoolSession();

    pooledSession = {
      session,
      lastUsed: Date.now(),
      inUse: true,
    };

    this.endPointToSession.set(key, pooledSession);
    this.pool.push(pooledSession);

    logger.info(
      `Created new session for redirect endpoint: ${endpoint.host}:${endpoint.port}`,
    );

    return session;
  }

  /**
   * Get a session from the pool
   * The session must be released back to the pool using releaseSession() after use
   */
  async getSession(): Promise<Session> {
    const startTime = Date.now();

    // Try to get an idle session (O(1) operation)
    if (this.idleSessions.length > 0) {
      const pooledSession = this.idleSessions.shift()!;

      // Verify session is still open
      if (pooledSession.session.isOpen()) {
        this.activeSessions.add(pooledSession);
        pooledSession.lastUsed = Date.now();
        const duration = Date.now() - startTime;
        logger.debug(
          `[PERF] getSession (reuse): ${duration}ms, pool: ${this.pool.length}, available: ${this.getAvailableSize()}, inUse: ${this.getInUseSize()}`,
        );
        return pooledSession.session;
      } else {
        // Session is closed, remove from pool
        const index = this.pool.indexOf(pooledSession);
        if (index > -1) {
          this.pool.splice(index, 1);
        }
        // Continue to create a new session
      }
    }

    // Create new session if pool is not full
    if (this.pool.length < (this.config.maxPoolSize || 10)) {
      logger.debug(
        `[PERF] getSession creating new session, pool: ${this.pool.length}/${this.config.maxPoolSize || 10}`,
      );
      const session = await this.createSession();
      const pooledSession = this.pool.find((ps) => ps.session === session);
      if (pooledSession) {
        this.idleSessions.shift(); // Remove from idle since we just added it
        this.activeSessions.add(pooledSession);
        pooledSession.inUse = true;
      }
      const duration = Date.now() - startTime;
      logger.debug(`[PERF] getSession (new): ${duration}ms`);
      return session;
    }

    // Wait for a session to become available
    logger.debug(
      `[PERF] getSession waiting, pool full: ${this.pool.length}, waitQueue: ${this.waitQueue.length}`,
    );
    const waitTimeout = this.config.waitTimeout || 60000;
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const waiters = this.waitQueue.toArray();
        const index = waiters.indexOf(resolve);
        if (index > -1) {
          this.waitQueue.remove(index, 1);
        }
        reject(new Error("Timeout waiting for available session"));
      }, waitTimeout);

      // Use unref() so timeout doesn't prevent process exit
      if (typeof timeoutId === "object" && "unref" in timeoutId) {
        timeoutId.unref();
      }

      this.waitQueue.push((session: Session) => {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;
        logger.debug(`[PERF] getSession (waited): ${duration}ms`);
        resolve(session);
      });
    });
  }

  /**
   * Release a session back to the pool
   * Should be called after getSession() when the session is no longer needed
   */
  releaseSession(session: Session): void {
    const pooledSession = this.pool.find((ps) => ps.session === session);
    if (pooledSession) {
      // Remove from active sessions
      this.activeSessions.delete(pooledSession);

      // Update tracking state
      pooledSession.inUse = false;
      pooledSession.lastUsed = Date.now();

      // Check if there are waiting requests
      if (this.waitQueue.length > 0) {
        const waiter = this.waitQueue.shift();
        if (waiter) {
          // Move to active for the waiter
          this.activeSessions.add(pooledSession);
          pooledSession.inUse = true;
          waiter(session);
        } else {
          // No waiter actually found, add back to idle
          this.idleSessions.push(pooledSession);
        }
      } else {
        // No waiters, add back to idle
        this.idleSessions.push(pooledSession);
      }
    }
  }

  private async cleanupIdleSessions(): Promise<void> {
    const now = Date.now();
    const maxIdleTime = this.config.maxIdleTime || 60000;
    const minSize = this.config.minPoolSize || 1;

    // Only iterate idle sessions (O(k) where k = idle count, not O(n))
    const sessionsToRemove: PooledSession[] = [];
    const idleArray = this.idleSessions.toArray();

    for (const ps of idleArray) {
      if (now - ps.lastUsed > maxIdleTime && this.pool.length > minSize) {
        sessionsToRemove.push(ps);
      }
    }

    await Promise.all(
      sessionsToRemove.map(async (ps) => {
        try {
          await ps.session.close();
          const poolIndex = this.pool.indexOf(ps);
          if (poolIndex > -1) {
            this.pool.splice(poolIndex, 1);
          }
          // Remove from idle sessions deque
          const idleIndex = this.idleSessions.toArray().indexOf(ps);
          if (idleIndex > -1) {
            this.idleSessions.remove(idleIndex, 1);
          }
          logger.debug(`Removed idle session from ${this.getPoolName()}`);
        } catch (error) {
          logger.error("Error closing idle session:", error);
        }
      }),
    );
  }

  /**
   * Execute a query statement and return SessionDataSet
   * Session is held until dataset.close() is called
   */
  async executeQueryStatement(
    sql: string,
    timeoutMs: number = 60000,
  ): Promise<SessionDataSet> {
    const session = await this.getSession();

    try {
      const dataSet = await session.executeQueryStatement(sql, timeoutMs);

      // Set cleanup callback to release session when dataset is closed
      dataSet.setCleanupCallback(() => {
        this.releaseSession(session);
      });

      return dataSet;
    } catch (error) {
      // If query fails, release session immediately
      this.releaseSession(session);
      throw error;
    }
  }

  async executeNonQueryStatement(sql: string): Promise<void> {
    const session = await this.getSession();
    try {
      return await session.executeNonQueryStatement(sql);
    } finally {
      this.releaseSession(session);
    }
  }

  /**
   * Insert tablet (supports both tree and table models)
   * @param tablet TreeTablet for tree model or TableTablet for table model
   */
  async insertTablet(
    tablet: TreeTablet | ITreeTablet | TableTablet | ITableTablet,
  ): Promise<void> {
    const totalStartTime = Date.now();
    const deviceId = this.extractDeviceId(tablet);

    // Check cache for optimal endpoint if redirection is enabled
    const cachedEndpoint = this.config.enableRedirection
      ? this.redirectCache.get(deviceId)
      : null;

    const sessionStartTime = Date.now();
    let session: Session;

    if (cachedEndpoint) {
      // Use cached endpoint for optimal routing
      session = await this.getSessionForEndpoint(cachedEndpoint);
    } else {
      // Use round-robin selection
      session = await this.getSession();
    }
    const sessionDuration = Date.now() - sessionStartTime;

    try {
      // Attempt insert
      const insertStartTime = Date.now();
      await session.insertTablet(tablet);
      const insertDuration = Date.now() - insertStartTime;
      const totalDuration = Date.now() - totalStartTime;

      logger.debug(
        `[PERF] Pool insertTablet total: ${totalDuration}ms (session: ${sessionDuration}ms, insert: ${insertDuration}ms)`,
      );

      // Check if server recommended a redirect for future operations
      if (this.config.enableRedirection) {
        const redirectEndpoint = session.getAndClearLastRedirect();
        if (redirectEndpoint) {
          // Cache the recommended endpoint for future writes
          this.redirectCache.set(deviceId, redirectEndpoint);
          logger.info(
            `Cached redirect recommendation: ${deviceId} -> ${redirectEndpoint.host}:${redirectEndpoint.port}`,
          );
        }
      }
    } finally {
      // Always release session
      this.releaseSession(session);
    }
  }

  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Close all sessions
    await Promise.all(
      this.pool.map(async (ps) => {
        try {
          await ps.session.close();
        } catch (error) {
          logger.error("Error closing session:", error);
        }
      }),
    );

    this.pool = [];
    this.idleSessions.clear();
    this.activeSessions.clear();
    this.waitQueue.clear();
    this.endPointToSession.clear();
    this.redirectCache.clear();
    unregisterClosable(this);
    logger.info(`${this.getPoolName()} closed`);
  }

  getPoolSize(): number {
    return this.pool.length;
  }

  getAvailableSize(): number {
    return this.idleSessions.length;
  }

  getInUseSize(): number {
    return this.activeSessions.size;
  }

  /**
   * Get total number of sessions in the pool
   * @alias getPoolSize
   */
  get totalCount(): number {
    return this.pool.length;
  }

  /**
   * Get number of idle sessions
   * @alias getAvailableSize
   */
  get idleCount(): number {
    return this.idleSessions.length;
  }

  /**
   * Get number of active (in-use) sessions
   * @alias getInUseSize
   */
  get activeCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Get number of requests waiting for a session
   */
  get waitingCount(): number {
    return this.waitQueue.length;
  }

  /**
   * Get comprehensive pool statistics
   */
  getPoolStats() {
    return {
      total: this.totalCount,
      idle: this.idleCount,
      active: this.activeCount,
      waiting: this.waitingCount,
      endpoints: this.endPoints.length,
      redirectCacheSize: this.redirectCache.getStats().size,
    };
  }

  /**
   * Insert multiple tablets concurrently using the pool.
   * This method optimizes for Node.js async patterns by:
   * 1. Pre-acquiring sessions to avoid contention
   * 2. Distributing tablets across sessions for parallel execution
   * 3. Automatically releasing sessions after completion
   * 
   * This is the recommended way to achieve high throughput in Node.js.
   * 
   * @param tablets Array of tablets to insert
   * @param options Configuration options
   * @param options.concurrency Number of concurrent workers (default: pool size or 10)
   * @returns Promise that resolves when all inserts complete
   * 
   * @example
   * ```typescript
   * const tablets = generateTablets(1000);
   * // Insert 1000 tablets using pool's concurrent execution
   * await pool.insertTabletsParallel(tablets, { concurrency: 20 });
   * ```
   */
  async insertTabletsParallel(
    tablets: (TreeTablet | ITreeTablet | TableTablet | ITableTablet)[],
    options?: { concurrency?: number },
  ): Promise<void> {
    if (tablets.length === 0) {
      return;
    }

    const concurrency = Math.min(
      options?.concurrency || this.config.maxPoolSize || 10,
      tablets.length,
    );

    const totalStartTime = Date.now();
    logger.debug(
      `[PERF] Pool insertTabletsParallel START: ${tablets.length} tablets, concurrency: ${concurrency}`,
    );

    // Pre-acquire sessions to enable true concurrent execution
    const sessions: Session[] = [];
    try {
      for (let i = 0; i < concurrency; i++) {
        sessions.push(await this.getSession());
      }
    } catch (error) {
      // Release any acquired sessions on error
      for (const session of sessions) {
        this.releaseSession(session);
      }
      throw error;
    }

    // Track errors but don't fail fast - continue processing other tablets
    const errors: Error[] = [];
    let tabletIndex = 0;

    try {
      // Create worker promises that consume from the tablet queue
      const workers = sessions.map(async (session) => {
        while (tabletIndex < tablets.length) {
          const idx = tabletIndex++;
          if (idx >= tablets.length) break;

          const tablet = tablets[idx];
          try {
            await session.insertTablet(tablet);
          } catch (err) {
            errors.push(err instanceof Error ? err : new Error(String(err)));
          }
        }
      });

      // Wait for all workers to complete
      await Promise.all(workers);
    } finally {
      // Always release all sessions
      for (const session of sessions) {
        this.releaseSession(session);
      }
    }

    const totalDuration = Date.now() - totalStartTime;
    const throughput = tablets.length / (totalDuration / 1000);
    logger.debug(
      `[PERF] Pool insertTabletsParallel COMPLETE: ${totalDuration}ms, ${throughput.toFixed(2)} tablets/sec`,
    );

    // If there were errors, throw an aggregate error
    if (errors.length > 0) {
      const errorMsg = `${errors.length} of ${tablets.length} tablet inserts failed. First error: ${errors[0].message}`;
      throw new Error(errorMsg);
    }
  }

  /**
   * Execute multiple operations concurrently using the pool.
   * This is a generic utility for running any async operations in parallel
   * while respecting pool size limits.
   * 
   * @param items Array of items to process
   * @param operation Async function to execute for each item
   * @param options Configuration options
   * @param options.concurrency Number of concurrent workers (default: pool size or 10)
   * @param options.stopOnError Whether to stop processing on first error (default: false)
   * @returns Results array (in same order as input items).
   *          Note: When stopOnError=false, failed operations will have `undefined` at their index.
   *          Check array entries for undefined to detect failures.
   * 
   * @example
   * ```typescript
   * const devices = ['d1', 'd2', 'd3'];
   * const results = await pool.executeParallel(
   *   devices,
   *   async (session, deviceId) => {
   *     await session.executeNonQueryStatement(`CREATE TIMESERIES root.sg.${deviceId}...`);
   *     return deviceId;
   *   },
   *   { concurrency: 5 }
   * );
   * // Check for failures
   * const failures = results.filter((r, i) => r === undefined);
   * ```
   */
  async executeParallel<T, R>(
    items: T[],
    operation: (session: Session, item: T, index: number) => Promise<R>,
    options?: { concurrency?: number; stopOnError?: boolean },
  ): Promise<(R | undefined)[]> {
    if (items.length === 0) {
      return [];
    }

    const concurrency = Math.min(
      options?.concurrency || this.config.maxPoolSize || 10,
      items.length,
    );
    const stopOnError = options?.stopOnError ?? false;

    // Pre-acquire sessions
    const sessions: Session[] = [];
    try {
      for (let i = 0; i < concurrency; i++) {
        sessions.push(await this.getSession());
      }
    } catch (error) {
      for (const session of sessions) {
        this.releaseSession(session);
      }
      throw error;
    }

    const results: (R | undefined)[] = new Array(items.length);
    let itemIndex = 0;
    let shouldStop = false;
    const errors: { index: number; error: Error }[] = [];

    try {
      const workers = sessions.map(async (session) => {
        while (!shouldStop && itemIndex < items.length) {
          const idx = itemIndex++;
          if (idx >= items.length) break;

          try {
            results[idx] = await operation(session, items[idx], idx);
          } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            errors.push({ index: idx, error });
            if (stopOnError) {
              shouldStop = true;
              break;
            }
          }
        }
      });

      await Promise.all(workers);
    } finally {
      for (const session of sessions) {
        this.releaseSession(session);
      }
    }

    if (errors.length > 0 && stopOnError) {
      throw errors[0].error;
    }

    return results;
  }
}
