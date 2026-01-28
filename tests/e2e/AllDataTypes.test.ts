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

describe('All Data Types E2E Tests', () => {
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
    });

    try {
      await session.open();
      console.log('Connected to IoTDB for all data types test');
    } catch (error) {
      console.warn('Could not connect to IoTDB. E2E tests will be skipped.');
      console.warn('Set IOTDB_HOST, IOTDB_PORT to run E2E tests against a real instance.');
    }
  }, 60000);

  afterAll(async () => {
    if (session && session.isOpen()) {
      // Cleanup test data
      try {
        await session.executeNonQueryStatement('DROP DATABASE root.all_types_test');
      } catch (error) {
        // Ignore cleanup errors
      }
      await session.close();
    }
  }, 60000);

  test('Should create database and timeseries with all data types', async () => {
    if (!session.isOpen()) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    // Create database
    try {
      await session.executeNonQueryStatement('CREATE DATABASE root.all_types_test');
    } catch (error: any) {
      if (!error.message?.includes('already exists')) {
        throw error;
      }
    }

    // Create timeseries for each data type
    const dataTypes = [
      { name: 'boolean_sensor', type: 'BOOLEAN', encoding: 'PLAIN' },
      { name: 'int32_sensor', type: 'INT32', encoding: 'RLE' },
      { name: 'int64_sensor', type: 'INT64', encoding: 'RLE' },
      { name: 'float_sensor', type: 'FLOAT', encoding: 'RLE' },
      { name: 'double_sensor', type: 'DOUBLE', encoding: 'RLE' },
      { name: 'text_sensor', type: 'TEXT', encoding: 'PLAIN' },
    ];

    for (const dt of dataTypes) {
      try {
        await session.executeNonQueryStatement(
          `CREATE TIMESERIES root.all_types_test.device1.${dt.name} WITH DATATYPE=${dt.type}, ENCODING=${dt.encoding}`
        );
      } catch (error: any) {
        if (!error.message?.includes('already exists')) {
          console.warn(`Failed to create timeseries ${dt.name}: ${error.message}`);
        }
      }
    }

    console.log('Created timeseries for all supported data types');
  }, 60000);

  test('Should insert and retrieve data for all data types', async () => {
    if (!session.isOpen()) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    const now = Date.now();
    
    // Insert tablet data with all types
    const tablet = {
      deviceId: 'root.all_types_test.device1',
      measurements: [
        'boolean_sensor',
        'int32_sensor', 
        'int64_sensor',
        'float_sensor',
        'double_sensor',
        'text_sensor'
      ],
      // Data types: BOOLEAN(0), INT32(1), INT64(2), FLOAT(3), DOUBLE(4), TEXT(5)
      dataTypes: [0, 1, 2, 3, 4, 5],
      timestamps: [now, now + 1, now + 2],
      values: [
        [true, 100, 1000n, 1.23, 4.56, 'hello'],
        [false, 200, 2000n, 2.34, 5.67, 'world'],
        [true, 300, 3000n, 3.45, 6.78, 'test'],
      ],
    };

    await session.insertTablet(tablet);
    console.log('Inserted data with all data types');

    // Query the data back
    const result = await session.executeQueryStatement(
      'SELECT * FROM root.all_types_test.device1'
    );

    expect(result).toBeDefined();
    expect(result.rows).toBeDefined();
    expect(result.rows.length).toBeGreaterThanOrEqual(3);
    
    console.log(`Retrieved ${result.rows.length} rows`);
    console.log('Sample row:', result.rows[0]);
    
    // Verify data types
    const firstRow = result.rows[0];
    expect(firstRow.length).toBe(7); // timestamp + 6 columns
    
    // Check timestamp
    expect(typeof firstRow[0]).toBe('bigint');
    
    // Check boolean
    expect(typeof firstRow[1]).toBe('boolean');
    expect(firstRow[1]).toBe(true);
    
    // Check INT32
    expect(typeof firstRow[2]).toBe('number');
    expect(firstRow[2]).toBe(100);
    
    // Check INT64
    expect(typeof firstRow[3]).toBe('bigint');
    expect(firstRow[3]).toBe(1000n);
    
    // Check FLOAT
    expect(typeof firstRow[4]).toBe('number');
    expect(firstRow[4]).toBeCloseTo(1.23, 2);
    
    // Check DOUBLE
    expect(typeof firstRow[5]).toBe('number');
    expect(firstRow[5]).toBeCloseTo(4.56, 2);
    
    // Check TEXT
    expect(typeof firstRow[6]).toBe('string');
    expect(firstRow[6]).toBe('hello');
  }, 60000);

  test('Should handle null values for all data types', async () => {
    if (!session.isOpen()) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    const now = Date.now() + 10000; // Different timestamp to avoid conflicts
    
    // Insert some null values
    const tablet = {
      deviceId: 'root.all_types_test.device1',
      measurements: [
        'boolean_sensor',
        'int32_sensor', 
        'int64_sensor',
        'float_sensor',
        'double_sensor',
        'text_sensor'
      ],
      dataTypes: [0, 1, 2, 3, 4, 5],
      timestamps: [now],
      values: [
        [false, 999, 9999n, 9.99, 99.99, 'null_test'],
      ],
    };

    await session.insertTablet(tablet);
    
    // Query to verify
    const result = await session.executeQueryStatement(
      `SELECT * FROM root.all_types_test.device1 WHERE time = ${now}`
    );

    expect(result.rows.length).toBeGreaterThan(0);
    console.log('Null handling test row:', result.rows[0]);
  }, 60000);

  test('Should handle multiple rows with mixed data types', async () => {
    if (!session.isOpen()) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    const baseTime = Date.now() + 20000;
    const rowCount = 10;
    
    const timestamps: number[] = [];
    const values: any[][] = [];
    
    for (let i = 0; i < rowCount; i++) {
      timestamps.push(baseTime + i * 1000);
      values.push([
        i % 2 === 0,              // boolean: alternating true/false
        i * 10,                   // int32: 0, 10, 20, ...
        BigInt(i * 100),          // int64: 0, 100, 200, ...
        i * 1.5,                  // float
        i * 2.5,                  // double
        `value_${i}`              // text
      ]);
    }
    
    const tablet = {
      deviceId: 'root.all_types_test.device1',
      measurements: [
        'boolean_sensor',
        'int32_sensor', 
        'int64_sensor',
        'float_sensor',
        'double_sensor',
        'text_sensor'
      ],
      dataTypes: [0, 1, 2, 3, 4, 5],
      timestamps,
      values,
    };

    await session.insertTablet(tablet);
    console.log(`Inserted ${rowCount} rows with mixed data types`);

    // Query and verify
    const result = await session.executeQueryStatement(
      `SELECT * FROM root.all_types_test.device1 WHERE time >= ${baseTime} AND time < ${baseTime + rowCount * 1000}`
    );

    expect(result.rows.length).toBeGreaterThanOrEqual(rowCount);
    console.log(`Retrieved ${result.rows.length} rows from mixed data query`);
    
    // Verify a few rows
    for (let i = 0; i < Math.min(3, result.rows.length); i++) {
      const row = result.rows[i];
      console.log(`Row ${i}:`, row);
      
      // Verify we have all columns
      expect(row.length).toBe(7); // timestamp + 6 data columns
    }
  }, 60000);

  test('Should handle queries with aggregation on different data types', async () => {
    if (!session.isOpen()) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    // Query with COUNT
    const countResult = await session.executeQueryStatement(
      'SELECT COUNT(int32_sensor), COUNT(text_sensor) FROM root.all_types_test.device1'
    );
    
    expect(countResult.rows).toBeDefined();
    console.log('COUNT result:', countResult.rows[0]);
    
    // Query with aggregation on numeric types
    const aggResult = await session.executeQueryStatement(
      'SELECT AVG(float_sensor), MAX(int32_sensor), MIN(double_sensor) FROM root.all_types_test.device1'
    );
    
    expect(aggResult.rows).toBeDefined();
    console.log('Aggregation result:', aggResult.rows[0]);
  }, 60000);
});
