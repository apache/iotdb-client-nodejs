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

import { Config, DEFAULT_CONFIG, DEFAULT_POOL_CONFIG, PoolConfig } from '../../src/utils/Config';

describe('Config', () => {
  test('DEFAULT_CONFIG should have correct values', () => {
    expect(DEFAULT_CONFIG.port).toBe(6667);
    expect(DEFAULT_CONFIG.username).toBe('root');
    expect(DEFAULT_CONFIG.password).toBe('root');
    expect(DEFAULT_CONFIG.fetchSize).toBe(1024);
    expect(DEFAULT_CONFIG.enableSSL).toBe(false);
  });

  test('DEFAULT_POOL_CONFIG should have correct values', () => {
    expect(DEFAULT_POOL_CONFIG.maxPoolSize).toBe(10);
    expect(DEFAULT_POOL_CONFIG.minPoolSize).toBe(1);
    expect(DEFAULT_POOL_CONFIG.maxIdleTime).toBe(60000);
    expect(DEFAULT_POOL_CONFIG.waitTimeout).toBe(60000);
  });

  test('Should merge config with defaults', () => {
    const customConfig: Partial<Config> = {
      host: 'localhost',
      port: 8080,
      username: 'admin',
    };

    const merged = { ...DEFAULT_CONFIG, ...customConfig };

    expect(merged.host).toBe('localhost');
    expect(merged.port).toBe(8080);
    expect(merged.username).toBe('admin');
    expect(merged.password).toBe('root'); // Should keep default
  });

  test('Should support SSL options', () => {
    const sslConfig: Partial<Config> = {
      host: 'localhost',
      enableSSL: true,
      sslOptions: {
        rejectUnauthorized: false,
      },
    };

    expect(sslConfig.enableSSL).toBe(true);
    expect(sslConfig.sslOptions?.rejectUnauthorized).toBe(false);
  });

  test('PoolConfig should extend Config', () => {
    const poolConfig: Partial<PoolConfig> = {
      host: 'localhost',
      maxPoolSize: 20,
      minPoolSize: 5,
      maxIdleTime: 30000,
    };

    expect(poolConfig.host).toBe('localhost');
    expect(poolConfig.maxPoolSize).toBe(20);
    expect(poolConfig.minPoolSize).toBe(5);
  });
});
