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

export const SQL_DIALECT_TREE = 'tree';
export const SQL_DIALECT_TABLE = 'table';

export interface EndPoint {
  host: string;
  port: number;
}

/**
 * Internal config used by Connection class (includes internal-only fields)
 */
export interface InternalConfig extends Config {
  sqlDialect?: string;
}

/**
 * Parse nodeUrls from string array format (e.g., ["host1:6667", "host2:6668"])
 * to EndPoint array format
 */
export function parseNodeUrls(nodeUrls: string[]): EndPoint[] {
  return nodeUrls.map((url) => {
    const parts = url.split(':');
    if (parts.length !== 2) {
      throw new Error(`Invalid nodeUrl format: ${url}. Expected format: "host:port"`);
    }
    const host = parts[0].trim();
    const port = parseInt(parts[1].trim(), 10);
    if (!host || isNaN(port) || port <= 0 || port > 65535) {
      throw new Error(`Invalid nodeUrl format: ${url}. Host must be non-empty and port must be a valid number (1-65535)`);
    }
    return { host, port };
  });
}

export interface Config {
  host?: string;
  port?: number;
  nodeUrls?: string[] | EndPoint[];
  username?: string;
  password?: string;
  database?: string;
  timezone?: string;
  fetchSize?: number;
  enableSSL?: boolean;
  sslOptions?: SSLOptions;
}

export interface SSLOptions {
  ca?: Buffer;
  cert?: Buffer;
  key?: Buffer;
  rejectUnauthorized?: boolean;
}

export interface PoolConfig extends Config {
  maxPoolSize?: number;
  minPoolSize?: number;
  maxIdleTime?: number;
  waitTimeout?: number;
  /**
   * Enable client-side redirection optimization.
   * When enabled, the client caches device→endpoint mappings
   * and routes writes directly to optimal nodes.
   * 
   * @default true
   * @requires Multi-node IoTDB cluster
   */
  enableRedirection?: boolean;
  /**
   * Time-to-live for cached redirect mappings (milliseconds).
   * Set to 0 for no expiration.
   * Recommended: 300000 (5 minutes)
   * 
   * @default 300000
   */
  redirectCacheTTL?: number;
}

export const DEFAULT_CONFIG: Partial<Config> = {
  host: 'localhost',
  port: 6667,
  username: 'root',
  password: 'root',
  fetchSize: 1024,
  enableSSL: false,
};

export const DEFAULT_POOL_CONFIG: Partial<PoolConfig> = {
  ...DEFAULT_CONFIG,
  maxPoolSize: 10,
  minPoolSize: 1,
  maxIdleTime: 60000, // 60 seconds
  waitTimeout: 60000, // 60 seconds
  enableRedirection: true,
  redirectCacheTTL: 300000, // 5 minutes
};

/**
 * Builder class for constructing Session and SessionPool configurations
 */
export class ConfigBuilder {
  private config: Partial<Config>;

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
  }

  host(host: string): this {
    this.config.host = host;
    return this;
  }

  port(port: number): this {
    this.config.port = port;
    return this;
  }

  nodeUrls(nodeUrls: string[] | EndPoint[]): this {
    this.config.nodeUrls = nodeUrls;
    return this;
  }

  username(username: string): this {
    this.config.username = username;
    return this;
  }

  password(password: string): this {
    this.config.password = password;
    return this;
  }

  database(database: string): this {
    this.config.database = database;
    return this;
  }

  timezone(timezone: string): this {
    this.config.timezone = timezone;
    return this;
  }

  fetchSize(fetchSize: number): this {
    this.config.fetchSize = fetchSize;
    return this;
  }

  enableSSL(enable: boolean): this {
    this.config.enableSSL = enable;
    return this;
  }

  sslOptions(sslOptions: SSLOptions): this {
    this.config.sslOptions = sslOptions;
    return this;
  }

  build(): Config {
    return this.config as Config;
  }
}

/**
 * Builder class for constructing SessionPool configurations
 */
export class PoolConfigBuilder extends ConfigBuilder {
  private poolConfig: Partial<PoolConfig>;

  constructor() {
    super();
    this.poolConfig = { ...DEFAULT_POOL_CONFIG };
  }

  override host(host: string): this {
    this.poolConfig.host = host;
    return this;
  }

  override port(port: number): this {
    this.poolConfig.port = port;
    return this;
  }

  override nodeUrls(nodeUrls: string[] | EndPoint[]): this {
    this.poolConfig.nodeUrls = nodeUrls;
    return this;
  }

  override username(username: string): this {
    this.poolConfig.username = username;
    return this;
  }

  override password(password: string): this {
    this.poolConfig.password = password;
    return this;
  }

  override database(database: string): this {
    this.poolConfig.database = database;
    return this;
  }

  override timezone(timezone: string): this {
    this.poolConfig.timezone = timezone;
    return this;
  }

  override fetchSize(fetchSize: number): this {
    this.poolConfig.fetchSize = fetchSize;
    return this;
  }

  override enableSSL(enable: boolean): this {
    this.poolConfig.enableSSL = enable;
    return this;
  }

  override sslOptions(sslOptions: SSLOptions): this {
    this.poolConfig.sslOptions = sslOptions;
    return this;
  }

  maxPoolSize(size: number): this {
    this.poolConfig.maxPoolSize = size;
    return this;
  }

  minPoolSize(size: number): this {
    this.poolConfig.minPoolSize = size;
    return this;
  }

  maxIdleTime(time: number): this {
    this.poolConfig.maxIdleTime = time;
    return this;
  }

  waitTimeout(timeout: number): this {
    this.poolConfig.waitTimeout = timeout;
    return this;
  }

  override build(): PoolConfig {
    return this.poolConfig as PoolConfig;
  }
}
