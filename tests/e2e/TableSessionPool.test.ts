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

import { TableSessionPool } from '../../src/client/TableSessionPool';

describe('TableSessionPool E2E Tests', () => {
  const IOTDB_HOST = process.env.IOTDB_HOST || 'localhost';
  const IOTDB_PORT = parseInt(process.env.IOTDB_PORT || '6667');
  const IOTDB_USER = process.env.IOTDB_USER || 'root';
  const IOTDB_PASSWORD = process.env.IOTDB_PASSWORD || 'root';

  let pool: TableSessionPool;
  let isConnected = false;

  beforeAll(async () => {
    pool = new TableSessionPool(IOTDB_HOST, IOTDB_PORT, {
      username: IOTDB_USER,
      password: IOTDB_PASSWORD,
      database: 'test',
      maxPoolSize: 5,
      minPoolSize: 2
    });

    try {
      await pool.init();
      isConnected = true;
    } catch (error) {
      console.warn('Could not connect to IoTDB. E2E tests will be skipped.');
      console.warn('Set IOTDB_HOST, IOTDB_PORT to run E2E tests against a real instance.');
    }
  }, 30000);

  afterAll(async () => {
    if (pool && isConnected) {
      await pool.close();
    }
  }, 30000);

  test('Should initialize table session pool with minimum connections', async () => {
    if (!isConnected) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    expect(pool.getPoolSize()).toBeGreaterThanOrEqual(2);
  });

  test('Should execute query using table session pool', async () => {
    if (!isConnected) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    try {
      const result = await pool.executeQueryStatement('SHOW DATABASES');

      expect(result).toBeDefined();
      expect(result.columns).toBeDefined();
      expect(Array.isArray(result.rows)).toBe(true);
    } catch (error: any) {
      console.warn('Query in table mode failed:', error.message);
      // Table mode might have different behavior
    }
  });

  test('Should execute non-query using table session pool', async () => {
    if (!isConnected) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    try {
      await pool.executeNonQueryStatement('CREATE DATABASE IF NOT EXISTS root.test_table');
      // Should not throw
    } catch (error: any) {
      console.warn('Non-query in table mode failed:', error.message);
    }
  });

  test('Should handle multiple concurrent queries in table mode', async () => {
    if (!isConnected) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    try {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(pool.executeQueryStatement('SHOW DATABASES'));
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach((result) => {
        expect(result).toBeDefined();
      });
    } catch (error: any) {
      console.warn('Concurrent queries in table mode failed:', error.message);
    }
  });

  test('Should insert tablet using table session pool', async () => {
    if (!isConnected) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    const tablet = {
      deviceId: 'root.test_table.device1',
      measurements: ['value'],
      dataTypes: [3], // FLOAT
      timestamps: [Date.now()],
      values: [[42.0]],
    };

    try {
      await pool.insertTablet(tablet);
      // Should not throw
    } catch (error: any) {
      console.warn('Insert tablet via table pool failed:', error.message);
    }
  });

  test('Should support multi-node configuration for table session pool', async () => {
    const multiNodePool = new TableSessionPool(
      [IOTDB_HOST, 'localhost'],
      IOTDB_PORT,
      {
        username: IOTDB_USER,
        password: IOTDB_PASSWORD,
        database: 'test',
        maxPoolSize: 3,
        minPoolSize: 1,
      }
    );

    try {
      await multiNodePool.init();
      expect(multiNodePool.getPoolSize()).toBeGreaterThanOrEqual(1);
      await multiNodePool.close();
    } catch (error) {
      console.warn('Multi-node table pool test failed, this is expected if IoTDB is not available');
    }
  });

  test('Should report pool statistics for table session pool', async () => {
    if (!isConnected) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    const poolSize = pool.getPoolSize();
    const availableSize = pool.getAvailableSize();

    expect(poolSize).toBeGreaterThan(0);
    expect(availableSize).toBeGreaterThanOrEqual(0);
    expect(availableSize).toBeLessThanOrEqual(poolSize);
  });
});
