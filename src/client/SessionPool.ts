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
import { PoolConfig } from '../utils/Config';
import { BaseSessionPool } from './BaseSessionPool';

/**
 * SessionPool provides connection pooling for IoTDB sessions
 * Supports multiple nodes with round-robin load balancing
 */
export class SessionPool extends BaseSessionPool {
  constructor(
    hostsOrConfig: string | string[] | PoolConfig,
    port?: number,
    config?: Partial<PoolConfig>
  ) {
    super(hostsOrConfig, port, config);
  }

  protected getPoolName(): string {
    return 'SessionPool';
  }

  protected async createPoolSession(): Promise<Session> {
    const endPoint = this.getNextEndPoint();
    const session = new Session({
      ...this.config,
      host: endPoint.host,
      port: endPoint.port,
    });

    await session.open();
    return session;
  }
}

// Re-export types for backward compatibility
export type { QueryResult, Tablet } from './Session';
