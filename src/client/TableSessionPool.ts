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

import { Session } from './Session';
import { PoolConfig, SQL_DIALECT_TABLE, InternalConfig } from '../utils/Config';
import { BaseSessionPool } from './BaseSessionPool';

/**
 * TableSessionPool provides connection pooling optimized for table model operations
 * Automatically configures sessions for table mode by setting sql_dialect to 'table'
 */
export class TableSessionPool extends BaseSessionPool {
  constructor(
    hostsOrConfig: string | string[] | PoolConfig,
    port?: number,
    config?: Partial<PoolConfig>
  ) {
    super(hostsOrConfig, port, config);
  }

  protected getPoolName(): string {
    return 'TableSessionPool';
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
    
    const session = new Session(internalConfig);
    await session.open();

    // Set session to table model by executing a USE DATABASE command if database is specified
    if (this.config.database) {
      // Validate database name to prevent SQL injection
      // IoTDB database names should only contain alphanumeric characters, underscores, hyphens, and dots
      const databaseNameRegex = /^[a-zA-Z0-9_.-]+$/;
      if (!databaseNameRegex.test(this.config.database)) {
        throw new Error(`Invalid database name: ${this.config.database}. Database names must only contain alphanumeric characters, underscores, hyphens, and dots.`);
      }
      await session.executeNonQueryStatement(`USE ${this.config.database}`);
    }

    return session;
  }
}

// Re-export types for backward compatibility
export type { QueryResult, Tablet } from './Session';
