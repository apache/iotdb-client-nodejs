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

import { SessionPool } from '../../src/client/SessionPool';

describe('Multi-Node E2E Tests', () => {
  const IOTDB_HOST = process.env.IOTDB_HOST || 'localhost';
  const IOTDB_PORT = parseInt(process.env.IOTDB_PORT || '6667');
  const IOTDB_USER = process.env.IOTDB_USER || 'root';
  const IOTDB_PASSWORD = process.env.IOTDB_PASSWORD || 'root';

  let pool: SessionPool;
  let isConnected = false;

  beforeAll(async () => {
    // Try to connect to multiple nodes if available
    const hosts = process.env.IOTDB_HOSTS 
      ? process.env.IOTDB_HOSTS.split(',') 
      : [IOTDB_HOST];

    pool = new SessionPool(hosts, IOTDB_PORT, {
      username: IOTDB_USER,
      password: IOTDB_PASSWORD,
      maxPoolSize: 10,
      minPoolSize: 3,
    });

    try {
      await pool.init();
      isConnected = true;
      console.log(`Connected to IoTDB nodes: ${hosts.join(', ')}`);
    } catch (error) {
      console.warn('Could not connect to IoTDB. Multi-node E2E tests will be skipped.');
    }
  }, 60000);

  afterAll(async () => {
    if (pool && isConnected) {
      try {
        await pool.executeNonQueryStatement('DROP DATABASE root.multinode_test');
      } catch (error) {
        // Ignore cleanup errors
      }
      await pool.close();
    }
  }, 60000);

  test('Should initialize pool with multiple connections', async () => {
    if (!isConnected) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    expect(pool.getPoolSize()).toBeGreaterThanOrEqual(3);
    console.log(`Pool initialized with ${pool.getPoolSize()} connections`);
  });

  test('Should create database and timeseries', async () => {
    if (!isConnected) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    try {
      await pool.executeNonQueryStatement('CREATE DATABASE root.multinode_test');
    } catch (error: any) {
      if (!error.message.includes('already exists')) {
        throw error;
      }
    }

    await pool.executeNonQueryStatement(
      'CREATE TIMESERIES root.multinode_test.device1.temperature WITH DATATYPE=FLOAT'
    );
    await pool.executeNonQueryStatement(
      'CREATE TIMESERIES root.multinode_test.device1.humidity WITH DATATYPE=FLOAT'
    );
  });

  test('Should handle high concurrent load across nodes', async () => {
    if (!isConnected) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    const concurrentOperations = 20;
    const promises: Promise<any>[] = [];

    // Mix of insert and query operations
    for (let i = 0; i < concurrentOperations; i++) {
      if (i % 2 === 0) {
        // Insert operation
        promises.push(
          pool.insertTablet({
            deviceId: 'root.multinode_test.device1',
            measurements: ['temperature', 'humidity'],
            dataTypes: [3, 3],
            timestamps: [Date.now() + i],
            values: [[20 + i * 0.1, 60 + i * 0.2]],
          })
        );
      } else {
        // Query operation
        promises.push(
          pool.executeQueryStatement('SELECT * FROM root.multinode_test.device1 LIMIT 10')
        );
      }
    }

    const results = await Promise.all(promises);
    expect(results).toHaveLength(concurrentOperations);
    
    console.log(`Completed ${concurrentOperations} concurrent operations`);
    console.log(`Pool stats: ${pool.getPoolSize()} total, ${pool.getAvailableSize()} available`);
  });

  test('Should distribute load across multiple nodes', async () => {
    if (!isConnected) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    const operationCount = 10;
    const promises: Promise<any>[] = [];

    for (let i = 0; i < operationCount; i++) {
      promises.push(
        pool.executeQueryStatement('SHOW DATABASES')
      );
    }

    await Promise.all(promises);
    
    console.log(`Distributed ${operationCount} operations across pool`);
  });

  test('Should handle large batch inserts in multi-node setup', async () => {
    if (!isConnected) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    const batchSize = 100;
    const timestamps: number[] = [];
    const values: number[][] = [];
    const baseTime = Date.now();

    for (let i = 0; i < batchSize; i++) {
      timestamps.push(baseTime + i * 1000);
      values.push([25 + Math.random() * 5, 65 + Math.random() * 10]);
    }

    await pool.insertTablet({
      deviceId: 'root.multinode_test.device1',
      measurements: ['temperature', 'humidity'],
      dataTypes: [3, 3],
      timestamps,
      values,
    });

    // Verify data was inserted
    const result = await pool.executeQueryStatement(
      'SELECT COUNT(*) FROM root.multinode_test.device1'
    );

    expect(result.rows.length).toBeGreaterThan(0);
    console.log(`Inserted ${batchSize} records in multi-node setup`);
  });

  test('Should maintain pool health under stress', async () => {
    if (!isConnected) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    const initialPoolSize = pool.getPoolSize();

    // Execute many operations
    const promises: Promise<any>[] = [];
    for (let i = 0; i < 100; i++) {
      promises.push(
        pool.executeQueryStatement('SHOW DATABASES')
      );
    }

    await Promise.all(promises);

    // Pool should maintain its size
    expect(pool.getPoolSize()).toBeGreaterThanOrEqual(initialPoolSize);
    console.log('Pool health maintained after stress test');
  });

  test('Should handle queries with large result sets in multi-node', async () => {
    if (!isConnected) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    // Insert more data for a larger result set
    for (let batch = 0; batch < 5; batch++) {
      const timestamps: number[] = [];
      const values: number[][] = [];
      const baseTime = Date.now() + batch * 100000;

      for (let i = 0; i < 100; i++) {
        timestamps.push(baseTime + i * 100);
        values.push([20 + Math.random() * 10, 50 + Math.random() * 20]);
      }

      await pool.insertTablet({
        deviceId: 'root.multinode_test.device1',
        measurements: ['temperature', 'humidity'],
        dataTypes: [3, 3],
        timestamps,
        values,
      });
    }

    // Query large result set
    const result = await pool.executeQueryStatement(
      'SELECT * FROM root.multinode_test.device1'
    );

    expect(result.rows.length).toBeGreaterThan(0);
    console.log(`Multi-node large query returned ${result.rows.length} rows`);
  });
});
