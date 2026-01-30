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

import { TableSession } from "./TableSession";
import { Session, TableTablet, TreeTablet } from "./Session";
import { PoolConfig, SQL_DIALECT_TABLE, InternalConfig } from "../utils/Config";
import { BaseSessionPool } from "./BaseSessionPool";
import { logger } from "../utils/Logger";

/**
 * TableSessionPool provides connection pooling optimized for table model operations
 * Automatically configures sessions for table mode by setting sql_dialect to 'table'
 * Uses TableSession instances which extend Session
 * Tracks database context across all sessions in the pool for table model operations
 */
export class TableSessionPool extends BaseSessionPool {
  private currentDatabase?: string; // Track database context across pool (table model only)

  constructor(
    hostsOrConfig: string | string[] | PoolConfig,
    port?: number,
    config?: Partial<PoolConfig>,
  ) {
    super(hostsOrConfig, port, config);
  }

  protected getPoolName(): string {
    return "TableSessionPool";
  }

  protected async createPoolSession(): Promise<Session> {
    const endPoint = this.getNextEndPoint();

    // Create internal config with sql_dialect set to 'table'
    const internalConfig: InternalConfig = {
      ...this.config,
      host: endPoint.host,
      port: endPoint.port,
      sqlDialect: SQL_DIALECT_TABLE,
    };

    try {
      // Create TableSession instance instead of Session
      const session = new TableSession(internalConfig);
      await session.open();

      // Apply current database context to new session if set
      if (this.currentDatabase) {
        try {
          await session.executeNonQueryStatement(`USE ${this.currentDatabase}`);
          logger.debug(
            `Applied database context ${this.currentDatabase} to new session`,
          );
        } catch (error: any) {
          logger.warn(
            `Failed to apply database context to new session: ${error.message}`,
          );
        }
      }

      // If database is configured in config, try to USE it (ignore errors)
      if (!this.currentDatabase && this.config.database) {
        try {
          logger.debug(`Attempting to USE database: ${this.config.database}`);
          await session.executeNonQueryStatement(`USE ${this.config.database}`);
          this.currentDatabase = this.config.database;
          logger.debug(
            `Successfully set database context to: ${this.config.database}`,
          );
        } catch (error: any) {
          // Ignore errors - database might not exist yet or other issues
          // This is acceptable as operations can still work without pre-set database
          logger.debug(
            `Failed to USE database ${this.config.database}, ignoring error: ${error.message}`,
          );
        }
      }

      return session;
    } catch (error: any) {
      const errorMsg = `Failed to create pool session for ${endPoint.host}:${endPoint.port} - ${error.message}`;
      throw new Error(errorMsg);
    }
  }

  /**
   * Override executeNonQueryStatement to track USE statements and sync database context
   * This is specific to table model - tree model doesn't need this
   */
  async executeNonQueryStatement(sql: string): Promise<void> {
    const session = await this.getSession();
    try {
      await session.executeNonQueryStatement(sql);

      // Track database context changes from USE statements (table model only)
      // IoTDB database names can include letters, digits, underscores, dots, and hyphens
      const usePattern = /^\s*USE\s+([a-zA-Z0-9_.-]+)\s*;?\s*$/i;
      const match = sql.match(usePattern);
      if (match) {
        const newDatabase = match[1];
        const previousDatabase = this.currentDatabase;
        this.currentDatabase = newDatabase;
        logger.debug(
          `Pool database context changed from ${previousDatabase || "none"} to ${this.currentDatabase}`,
        );

        // Synchronize database context to all sessions in pool
        await this.syncDatabaseContextToPool(newDatabase);
      }
    } finally {
      this.releaseSession(session);
    }
  }

  /**
   * Synchronize database context to all idle sessions in the pool
   * This ensures all sessions use the same database after a USE statement
   * Only applies to table model - tree model doesn't need this
   * @param database - Database name to switch to
   */
  private async syncDatabaseContextToPool(database: string): Promise<void> {
    const syncPromises = this.pool
      .filter((ps) => !ps.inUse) // Only sync idle sessions to avoid interfering
      .map(async (ps) => {
        try {
          await ps.session.executeNonQueryStatement(`USE ${database}`);
          logger.debug(`Synced database context to idle session`);
        } catch (error) {
          logger.warn(`Failed to sync database context to session: ${error}`);
        }
      });

    await Promise.all(syncPromises);
  }

  /**
   * Override getSession to ensure returned session has correct database context
   * This is specific to table model
   */
  async getSession(): Promise<Session> {
    const session = await super.getSession();

    // Ensure session has correct database context (table model only)
    if (this.currentDatabase) {
      try {
        await session.executeNonQueryStatement(`USE ${this.currentDatabase}`);
        logger.debug(
          `Ensured database context ${this.currentDatabase} for session`,
        );
      } catch (error) {
        logger.warn(`Failed to ensure database context: ${error}`);
      }
    }

    return session;
  }

  /**
   * Get current database context
   * @returns Current database name or undefined
   */
  getCurrentDatabase(): string | undefined {
    return this.currentDatabase;
  }

  /**
   * Insert tablet (supports both tree and table models, but typically used for TableTablet)
   * @param tablet TreeTablet or TableTablet
   */
  async insertTablet(tablet: TreeTablet | TableTablet): Promise<void> {
    const session = await this.getSession();
    try {
      return await session.insertTablet(tablet);
    } finally {
      this.releaseSession(session);
    }
  }
}

// Re-export types for backward compatibility and new types
export type {
  QueryResult,
  Tablet,
  TreeTablet,
  TableTablet,
  ColumnCategory,
} from "./Session";
export { TableSession } from "./TableSession";
