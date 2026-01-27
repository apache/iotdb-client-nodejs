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

import { Session, QueryResult, Tablet } from './Session';
import { PoolConfig, DEFAULT_POOL_CONFIG, EndPoint } from '../utils/Config';
import { logger } from '../utils/Logger';

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
  protected waitQueue: Array<(session: Session) => void> = [];
  protected currentEndPointIndex = 0;
  protected cleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    hosts: string | string[],
    port: number,
    config: Partial<PoolConfig> = {}
  ) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config, port } as PoolConfig;

    // Support multiple nodes
    const hostList = Array.isArray(hosts) ? hosts : [hosts];
    this.endPoints = hostList.map((host) => ({ host, port }));

    logger.info(
      `${this.getPoolName()} created with ${this.endPoints.length} endpoints, max pool size: ${this.config.maxPoolSize}`
    );
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
    // Create minimum pool size connections
    const minSize = this.config.minPoolSize || 1;
    for (let i = 0; i < minSize; i++) {
      await this.createSession();
    }

    // Start cleanup interval with proper async handling
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleSessions().catch((error) => {
        logger.error('Error during scheduled session cleanup:', error);
      });
    }, 30000); // Check every 30 seconds

    logger.info(`${this.getPoolName()} initialized with ${minSize} sessions`);
  }

  private async createSession(): Promise<Session> {
    const session = await this.createPoolSession();

    this.pool.push({
      session,
      lastUsed: Date.now(),
      inUse: false,
    });

    return session;
  }

  protected getNextEndPoint(): EndPoint {
    // Round-robin selection
    const endPoint = this.endPoints[this.currentEndPointIndex];
    this.currentEndPointIndex = (this.currentEndPointIndex + 1) % this.endPoints.length;
    return endPoint;
  }

  protected async getSession(): Promise<Session> {
    // Try to find an available session
    const available = this.pool.find((ps) => !ps.inUse && ps.session.isOpen());
    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();
      return available.session;
    }

    // Create new session if pool is not full
    if (this.pool.length < (this.config.maxPoolSize || 10)) {
      const session = await this.createSession();
      const pooledSession = this.pool.find((ps) => ps.session === session);
      if (pooledSession) {
        pooledSession.inUse = true;
      }
      return session;
    }

    // Wait for a session to become available
    const waitTimeout = this.config.waitTimeout || 60000;
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.waitQueue.indexOf(resolve);
        if (index > -1) {
          this.waitQueue.splice(index, 1);
        }
        reject(new Error('Timeout waiting for available session'));
      }, waitTimeout);

      this.waitQueue.push((session: Session) => {
        clearTimeout(timeoutId);
        resolve(session);
      });
    });
  }

  protected releaseSession(session: Session): void {
    const pooledSession = this.pool.find((ps) => ps.session === session);
    if (pooledSession) {
      pooledSession.inUse = false;
      pooledSession.lastUsed = Date.now();

      // Notify waiting requests
      if (this.waitQueue.length > 0) {
        const waiter = this.waitQueue.shift();
        if (waiter) {
          pooledSession.inUse = true;
          waiter(session);
        }
      }
    }
  }

  private async cleanupIdleSessions(): Promise<void> {
    const now = Date.now();
    const maxIdleTime = this.config.maxIdleTime || 60000;
    const minSize = this.config.minPoolSize || 1;

    const sessionsToRemove = this.pool.filter(
      (ps) =>
        !ps.inUse &&
        now - ps.lastUsed > maxIdleTime &&
        this.pool.length > minSize
    );

    // Properly await async operations
    await Promise.all(
      sessionsToRemove.map(async (ps) => {
        try {
          await ps.session.close();
          const index = this.pool.indexOf(ps);
          if (index > -1) {
            this.pool.splice(index, 1);
          }
          logger.debug(`Removed idle session from ${this.getPoolName()}`);
        } catch (error) {
          logger.error('Error closing idle session:', error);
        }
      })
    );
  }

  async executeQueryStatement(sql: string, timeoutMs: number = 60000): Promise<QueryResult> {
    const session = await this.getSession();
    try {
      return await session.executeQueryStatement(sql, timeoutMs);
    } finally {
      this.releaseSession(session);
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

  async insertTablet(tablet: Tablet): Promise<void> {
    const session = await this.getSession();
    try {
      return await session.insertTablet(tablet);
    } finally {
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
          logger.error('Error closing session:', error);
        }
      })
    );

    this.pool = [];
    this.waitQueue = [];
    logger.info(`${this.getPoolName()} closed`);
  }

  getPoolSize(): number {
    return this.pool.length;
  }

  getAvailableSize(): number {
    return this.pool.filter((ps) => !ps.inUse).length;
  }

  getInUseSize(): number {
    return this.pool.filter((ps) => ps.inUse).length;
  }
}
