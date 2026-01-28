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
  Config, 
  DEFAULT_CONFIG, 
  DEFAULT_POOL_CONFIG, 
  PoolConfig,
  ConfigBuilder,
  PoolConfigBuilder,
  EndPoint
} from '../../src/utils/Config';

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

  test('Should support nodeUrls configuration', () => {
    const nodeUrls: EndPoint[] = [
      { host: 'node1.example.com', port: 6667 },
      { host: 'node2.example.com', port: 6668 },
      { host: 'node3.example.com', port: 6669 },
    ];

    const config: Partial<Config> = {
      nodeUrls,
      username: 'root',
      password: 'root',
    };

    expect(config.nodeUrls).toBeDefined();
    expect(config.nodeUrls?.length).toBe(3);
    expect(config.nodeUrls?.[0].host).toBe('node1.example.com');
    expect(config.nodeUrls?.[1].port).toBe(6668);
  });

  test('Should validate empty nodeUrls array', () => {
    const config: Partial<Config> = {
      nodeUrls: [],
      username: 'root',
      password: 'root',
    };

    expect(config.nodeUrls).toBeDefined();
    expect(config.nodeUrls?.length).toBe(0);
  });
});

describe('ConfigBuilder', () => {
  test('Should build config with host and port', () => {
    const config = new ConfigBuilder()
      .host('localhost')
      .port(6667)
      .username('root')
      .password('root')
      .build();

    expect(config.host).toBe('localhost');
    expect(config.port).toBe(6667);
    expect(config.username).toBe('root');
    expect(config.password).toBe('root');
  });

  test('Should build config with nodeUrls', () => {
    const nodeUrls: EndPoint[] = [
      { host: 'node1', port: 6667 },
      { host: 'node2', port: 6668 },
    ];

    const config = new ConfigBuilder()
      .nodeUrls(nodeUrls)
      .username('admin')
      .password('admin123')
      .build();

    expect(config.nodeUrls).toEqual(nodeUrls);
    expect(config.username).toBe('admin');
    expect(config.password).toBe('admin123');
  });

  test('Should build config with SSL options', () => {
    const config = new ConfigBuilder()
      .host('secure.example.com')
      .port(6667)
      .enableSSL(true)
      .sslOptions({ rejectUnauthorized: true })
      .build();

    expect(config.enableSSL).toBe(true);
    expect(config.sslOptions?.rejectUnauthorized).toBe(true);
  });

  test('Should build config with all options', () => {
    const config = new ConfigBuilder()
      .host('myhost')
      .port(8080)
      .username('user')
      .password('pass')
      .database('mydb')
      .timezone('UTC')
      .fetchSize(2048)
      .enableSSL(false)
      .build();

    expect(config.host).toBe('myhost');
    expect(config.port).toBe(8080);
    expect(config.username).toBe('user');
    expect(config.password).toBe('pass');
    expect(config.database).toBe('mydb');
    expect(config.timezone).toBe('UTC');
    expect(config.fetchSize).toBe(2048);
    expect(config.enableSSL).toBe(false);
  });

  test('Should allow method chaining', () => {
    const builder = new ConfigBuilder();
    const result = builder.host('test');
    expect(result).toBe(builder); // Should return the same instance
  });
});

describe('PoolConfigBuilder', () => {
  test('Should build pool config with host and port', () => {
    const config = new PoolConfigBuilder()
      .host('localhost')
      .port(6667)
      .username('root')
      .password('root')
      .maxPoolSize(20)
      .minPoolSize(5)
      .build();

    expect(config.host).toBe('localhost');
    expect(config.port).toBe(6667);
    expect(config.maxPoolSize).toBe(20);
    expect(config.minPoolSize).toBe(5);
  });

  test('Should build pool config with nodeUrls', () => {
    const nodeUrls: EndPoint[] = [
      { host: 'node1', port: 6667 },
      { host: 'node2', port: 6668 },
      { host: 'node3', port: 6669 },
    ];

    const config = new PoolConfigBuilder()
      .nodeUrls(nodeUrls)
      .username('root')
      .password('root')
      .maxPoolSize(30)
      .minPoolSize(10)
      .build();

    expect(config.nodeUrls).toEqual(nodeUrls);
    expect(config.maxPoolSize).toBe(30);
    expect(config.minPoolSize).toBe(10);
  });

  test('Should build pool config with all pool options', () => {
    const config = new PoolConfigBuilder()
      .host('myhost')
      .port(6667)
      .maxPoolSize(15)
      .minPoolSize(3)
      .maxIdleTime(30000)
      .waitTimeout(45000)
      .build();

    expect(config.maxPoolSize).toBe(15);
    expect(config.minPoolSize).toBe(3);
    expect(config.maxIdleTime).toBe(30000);
    expect(config.waitTimeout).toBe(45000);
  });

  test('Should allow method chaining', () => {
    const builder = new PoolConfigBuilder();
    const result = builder.maxPoolSize(10);
    expect(result).toBe(builder); // Should return the same instance
  });

  test('Should inherit all Config options', () => {
    const config = new PoolConfigBuilder()
      .host('myhost')
      .port(6667)
      .username('user')
      .password('pass')
      .database('mydb')
      .timezone('UTC+8')
      .fetchSize(512)
      .enableSSL(true)
      .maxPoolSize(10)
      .build();

    expect(config.host).toBe('myhost');
    expect(config.username).toBe('user');
    expect(config.database).toBe('mydb');
    expect(config.timezone).toBe('UTC+8');
    expect(config.maxPoolSize).toBe(10);
  });
});
