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

import { Session } from '../../src/client/Session';

describe('Large Query E2E Tests', () => {
  const IOTDB_HOST = process.env.IOTDB_HOST || 'localhost';
  const IOTDB_PORT = parseInt(process.env.IOTDB_PORT || '6667');
  const IOTDB_USER = process.env.IOTDB_USER || 'root';
  const IOTDB_PASSWORD = process.env.IOTDB_PASSWORD || 'root';

  let session: Session;

  beforeAll(async () => {
    session = new Session({
      host: IOTDB_HOST,
      port: IOTDB_PORT,
      username: IOTDB_USER,
      password: IOTDB_PASSWORD,
      fetchSize: 100, // Small fetch size to force multiple fetchResult calls
    });

    try {
      await session.open();
      console.log('Connected to IoTDB for large query tests');
    } catch (error) {
      console.warn('Could not connect to IoTDB. E2E tests will be skipped.');
      console.warn('Set IOTDB_HOST, IOTDB_PORT to run E2E tests against a real instance.');
    }
  }, 30000);

  afterAll(async () => {
    if (session && session.isOpen()) {
      // Cleanup test data
      try {
        await session.executeNonQueryStatement('DROP DATABASE root.large_query_test');
      } catch (error) {
        // Ignore cleanup errors
      }
      await session.close();
    }
  }, 30000);

  test('Should prepare test database and timeseries', async () => {
    if (!session.isOpen()) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    try {
      await session.executeNonQueryStatement('CREATE DATABASE root.large_query_test');
    } catch (error: any) {
      if (!error.message.includes('already exists')) {
        throw error;
      }
    }

    // Create timeseries for large dataset
    await session.executeNonQueryStatement(
      'CREATE TIMESERIES root.large_query_test.device1.sensor1 WITH DATATYPE=FLOAT, ENCODING=RLE'
    );
    await session.executeNonQueryStatement(
      'CREATE TIMESERIES root.large_query_test.device1.sensor2 WITH DATATYPE=FLOAT, ENCODING=RLE'
    );
    await session.executeNonQueryStatement(
      'CREATE TIMESERIES root.large_query_test.device1.sensor3 WITH DATATYPE=FLOAT, ENCODING=RLE'
    );
  });

  test('Should insert large dataset (1000+ records)', async () => {
    if (!session.isOpen()) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    const batchSize = 100;
    const totalRecords = 1000;
    const baseTime = Date.now();

    // Insert data in batches
    for (let i = 0; i < totalRecords; i += batchSize) {
      const timestamps: number[] = [];
      const values: number[][] = [];

      for (let j = 0; j < batchSize && (i + j) < totalRecords; j++) {
        timestamps.push(baseTime + (i + j) * 1000);
        values.push([
          20 + Math.random() * 10, // sensor1
          50 + Math.random() * 20, // sensor2
          100 + Math.random() * 50, // sensor3
        ]);
      }

      await session.insertTablet({
        deviceId: 'root.large_query_test.device1',
        measurements: ['sensor1', 'sensor2', 'sensor3'],
        dataTypes: [3, 3, 3], // FLOAT
        timestamps,
        values,
      });
    }

    console.log(`Inserted ${totalRecords} records for large query test`);
  });

  test('Should query large dataset requiring multiple fetchResult calls', async () => {
    if (!session.isOpen()) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    // Query all data - with fetchSize=100, this should require multiple fetchResult calls
    const result = await session.executeQueryStatement(
      'SELECT * FROM root.large_query_test.device1'
    );

    expect(result).toBeDefined();
    expect(result.columns).toBeDefined();
    expect(result.columns.length).toBeGreaterThan(0);
    expect(result.rows).toBeDefined();
    expect(result.rows.length).toBeGreaterThanOrEqual(1000);

    console.log(`Retrieved ${result.rows.length} rows with fetchSize=100`);
    console.log(`Columns: ${result.columns.join(', ')}`);
  });

  test('Should query with filters on large dataset', async () => {
    if (!session.isOpen()) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    const result = await session.executeQueryStatement(
      'SELECT sensor1, sensor2 FROM root.large_query_test.device1 WHERE sensor1 > 25'
    );

    expect(result).toBeDefined();
    expect(result.columns).toBeDefined();
    expect(result.rows).toBeDefined();
    expect(result.rows.length).toBeGreaterThan(0);

    console.log(`Filtered query returned ${result.rows.length} rows`);
  });

  test('Should query with aggregation on large dataset', async () => {
    if (!session.isOpen()) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    const result = await session.executeQueryStatement(
      'SELECT COUNT(sensor1), AVG(sensor1), MAX(sensor1), MIN(sensor1) FROM root.large_query_test.device1'
    );

    expect(result).toBeDefined();
    expect(result.columns).toBeDefined();
    expect(result.rows).toBeDefined();
    expect(result.rows.length).toBeGreaterThan(0);

    console.log('Aggregation results:', result.rows[0]);
  });

  test('Should query with time range on large dataset', async () => {
    if (!session.isOpen()) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    const now = Date.now();
    const oneHourAgo = now - 3600000;

    const result = await session.executeQueryStatement(
      `SELECT * FROM root.large_query_test.device1 WHERE time >= ${oneHourAgo} AND time <= ${now}`
    );

    expect(result).toBeDefined();
    expect(result.rows).toBeDefined();

    console.log(`Time range query returned ${result.rows.length} rows`);
  });

  test('Should handle multiple concurrent large queries', async () => {
    if (!session.isOpen()) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    const queries = [
      'SELECT sensor1 FROM root.large_query_test.device1',
      'SELECT sensor2 FROM root.large_query_test.device1',
      'SELECT sensor3 FROM root.large_query_test.device1',
      'SELECT COUNT(*) FROM root.large_query_test.device1',
    ];

    const results = await Promise.all(
      queries.map(query => session.executeQueryStatement(query))
    );

    expect(results).toHaveLength(4);
    results.forEach((result, index) => {
      expect(result).toBeDefined();
      expect(result.rows).toBeDefined();
      console.log(`Query ${index + 1} returned ${result.rows.length} rows`);
    });
  });
});
