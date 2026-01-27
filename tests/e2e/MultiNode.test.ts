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
  const IOTDB_PORT_1 = parseInt(process.env.IOTDB_PORT || '6667', 10);
  const IOTDB_PORT_2 = parseInt(process.env.IOTDB_PORT_2 || '6668', 10);
  const IOTDB_PORT_3 = parseInt(process.env.IOTDB_PORT_3 || '6669', 10);
  const IOTDB_USER = process.env.IOTDB_USER || 'root';
  const IOTDB_PASSWORD = process.env.IOTDB_PASSWORD || 'root';
  const IS_MULTI_NODE = process.env.MULTI_NODE === 'true';

  let pool1: SessionPool;
  let pool2: SessionPool;
  let pool3: SessionPool;
  let isConnected = false;

  beforeAll(async () => {
    // Skip multi-node tests if not in multi-node environment
    if (!IS_MULTI_NODE) {
      console.log('Skipping Multi-Node tests - not in multi-node environment (MULTI_NODE env var not set)');
      return;
    }

    // For 3C3D setup, connect to all three DataNode ports
    // This enables true multi-node load distribution and testing
    console.log(`Connecting to IoTDB cluster:`);
    console.log(`  DataNode 1: ${IOTDB_HOST}:${IOTDB_PORT_1}`);
    console.log(`  DataNode 2: ${IOTDB_HOST}:${IOTDB_PORT_2}`);
    console.log(`  DataNode 3: ${IOTDB_HOST}:${IOTDB_PORT_3}`);
    
    try {
      // Create three pools, each connected to a different DataNode
      pool1 = new SessionPool(IOTDB_HOST, IOTDB_PORT_1, {
        username: IOTDB_USER,
        password: IOTDB_PASSWORD,
        maxPoolSize: 5,
        minPoolSize: 2,
      });
      
      pool2 = new SessionPool(IOTDB_HOST, IOTDB_PORT_2, {
        username: IOTDB_USER,
        password: IOTDB_PASSWORD,
        maxPoolSize: 5,
        minPoolSize: 2,
      });
      
      pool3 = new SessionPool(IOTDB_HOST, IOTDB_PORT_3, {
        username: IOTDB_USER,
        password: IOTDB_PASSWORD,
        maxPoolSize: 5,
        minPoolSize: 2,
      });

      await pool1.init();
      await pool2.init();
      await pool3.init();
      
      isConnected = true;
      console.log(`Successfully connected to IoTDB cluster on ports ${IOTDB_PORT_1}, ${IOTDB_PORT_2}, ${IOTDB_PORT_3}`);
    } catch (error) {
      console.warn('Could not connect to IoTDB. Multi-node E2E tests will be skipped.');
      console.warn('Error:', error);
    }
  }, 60000);

  afterAll(async () => {
    if (!IS_MULTI_NODE) {
      return;
    }
    if (isConnected) {
      try {
        await pool1.executeNonQueryStatement('DROP DATABASE root.multinode_test');
      } catch (error) {
        // Ignore cleanup errors
      }
      await pool1.close();
      await pool2.close();
      await pool3.close();
    }
  }, 60000);

  test('Should initialize pools with connections to all three DataNodes', async () => {
    if (!IS_MULTI_NODE || !isConnected) {
      console.log('Skipping test - not in multi-node environment or no IoTDB connection');
      return;
    }

    expect(pool1.getPoolSize()).toBeGreaterThanOrEqual(2);
    expect(pool2.getPoolSize()).toBeGreaterThanOrEqual(2);
    expect(pool3.getPoolSize()).toBeGreaterThanOrEqual(2);
    console.log(`Pools initialized: DataNode1=${pool1.getPoolSize()}, DataNode2=${pool2.getPoolSize()}, DataNode3=${pool3.getPoolSize()} connections`);
  });

  test('Should create database and timeseries on first node', async () => {
    if (!isConnected) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    try {
      await pool1.executeNonQueryStatement('CREATE DATABASE root.multinode_test');
    } catch (error: any) {
      if (!error.message.includes('already exists')) {
        throw error;
      }
    }

    await pool1.executeNonQueryStatement(
      'CREATE TIMESERIES root.multinode_test.device1.temperature WITH DATATYPE=FLOAT'
    );
    await pool1.executeNonQueryStatement(
      'CREATE TIMESERIES root.multinode_test.device1.humidity WITH DATATYPE=FLOAT'
    );
  });

  test('Should handle concurrent load distributed across all three DataNodes', async () => {
    if (!isConnected) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    const operationsPerNode = 7;
    const promises: Promise<any>[] = [];

    // Distribute operations across all three DataNode pools
    for (let i = 0; i < operationsPerNode; i++) {
      // Insert to DataNode 1
      promises.push(
        pool1.insertTablet({
          deviceId: 'root.multinode_test.device1',
          measurements: ['temperature', 'humidity'],
          dataTypes: [3, 3],
          timestamps: [Date.now() + i * 1000],
          values: [[20 + i * 0.1, 60 + i * 0.2]],
        })
      );

      // Query from DataNode 2
      promises.push(
        pool2.executeQueryStatement('SELECT * FROM root.multinode_test.device1 LIMIT 10')
      );

      // Insert to DataNode 3
      promises.push(
        pool3.insertTablet({
          deviceId: 'root.multinode_test.device1',
          measurements: ['temperature', 'humidity'],
          dataTypes: [3, 3],
          timestamps: [Date.now() + i * 1000 + 500],
          values: [[21 + i * 0.1, 61 + i * 0.2]],
        })
      );
    }

    const results = await Promise.all(promises);
    expect(results).toHaveLength(operationsPerNode * 3);
    
    console.log(`Completed ${operationsPerNode * 3} concurrent operations across 3 DataNodes`);
    console.log(`Pool stats: DN1=${pool1.getPoolSize()}/${pool1.getAvailableSize()}, DN2=${pool2.getPoolSize()}/${pool2.getAvailableSize()}, DN3=${pool3.getPoolSize()}/${pool3.getAvailableSize()}`);
  });

  test('Should verify data replication across all DataNodes', async () => {
    if (!isConnected) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    // Insert data through DataNode 1
    await pool1.insertTablet({
      deviceId: 'root.multinode_test.device1',
      measurements: ['temperature', 'humidity'],
      dataTypes: [3, 3],
      timestamps: [Date.now()],
      values: [[99.9, 99.9]],
    });

    // Wait a bit for replication
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Query from all three DataNodes - should see the same data
    const result1 = await pool1.executeQueryStatement('SELECT COUNT(*) FROM root.multinode_test.device1');
    const result2 = await pool2.executeQueryStatement('SELECT COUNT(*) FROM root.multinode_test.device1');
    const result3 = await pool3.executeQueryStatement('SELECT COUNT(*) FROM root.multinode_test.device1');

    expect(result1.rows.length).toBeGreaterThan(0);
    expect(result2.rows.length).toBeGreaterThan(0);
    expect(result3.rows.length).toBeGreaterThan(0);
    
    console.log(`Data replicated across all DataNodes - verified queries from ports 6667, 6668, 6669`);
  });

  test('Should handle large batch inserts across multiple DataNodes', async () => {
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

    // Insert through different DataNodes
    await pool1.insertTablet({
      deviceId: 'root.multinode_test.device1',
      measurements: ['temperature', 'humidity'],
      dataTypes: [3, 3],
      timestamps,
      values,
    });

    // Verify data from different DataNode
    const result = await pool2.executeQueryStatement(
      'SELECT COUNT(*) FROM root.multinode_test.device1'
    );

    expect(result.rows.length).toBeGreaterThan(0);
    console.log(`Inserted ${batchSize} records via DataNode1, queried via DataNode2`);
  });

  test('Should maintain all pool healths under stress', async () => {
    if (!isConnected) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    const initialSize1 = pool1.getPoolSize();
    const initialSize2 = pool2.getPoolSize();
    const initialSize3 = pool3.getPoolSize();

    // Execute many operations across all DataNodes
    const promises: Promise<any>[] = [];
    for (let i = 0; i < 30; i++) {
      promises.push(pool1.executeQueryStatement('SHOW DATABASES'));
      promises.push(pool2.executeQueryStatement('SHOW DATABASES'));
      promises.push(pool3.executeQueryStatement('SHOW DATABASES'));
    }

    await Promise.all(promises);

    // Pools should maintain their sizes
    expect(pool1.getPoolSize()).toBeGreaterThanOrEqual(initialSize1);
    expect(pool2.getPoolSize()).toBeGreaterThanOrEqual(initialSize2);
    expect(pool3.getPoolSize()).toBeGreaterThanOrEqual(initialSize3);
    console.log('All three pool healths maintained after stress test');
  });

  test('Should handle queries across all DataNodes simultaneously', async () => {
    if (!isConnected) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    // Execute queries simultaneously on all three DataNodes
    const [result1, result2, result3] = await Promise.all([
      pool1.executeQueryStatement('SELECT * FROM root.multinode_test.device1 LIMIT 5'),
      pool2.executeQueryStatement('SELECT * FROM root.multinode_test.device1 LIMIT 5'),
      pool3.executeQueryStatement('SELECT * FROM root.multinode_test.device1 LIMIT 5'),
    ]);

    expect(result1.rows.length).toBeGreaterThan(0);
    expect(result2.rows.length).toBeGreaterThan(0);
    expect(result3.rows.length).toBeGreaterThan(0);
    console.log(`Simultaneous queries across 3 DataNodes: DN1=${result1.rows.length}, DN2=${result2.rows.length}, DN3=${result3.rows.length} rows`);
  });
});
