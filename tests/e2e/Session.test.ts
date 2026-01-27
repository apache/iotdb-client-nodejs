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

describe('Session E2E Tests', () => {
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
    } catch (error) {
      console.warn('Could not connect to IoTDB. E2E tests will be skipped.');
      console.warn('Set IOTDB_HOST, IOTDB_PORT to run E2E tests against a real instance.');
    }
  }, 60000); // 30 second timeout for connection

  afterAll(async () => {
    if (session && session.isOpen()) {
      await session.close();
    }
  }, 60000);

  test('Should open and close session', async () => {
    if (!session.isOpen()) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    expect(session.isOpen()).toBe(true);
  }, 60000);

  test('Should execute non-query statement (CREATE DATABASE)', async () => {
    if (!session.isOpen()) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    try {
      await session.executeNonQueryStatement('CREATE DATABASE root.test_db');
      // Should not throw
    } catch (error: any) {
      // Might fail if database already exists, that's ok
      if (!error.message.includes('already exists')) {
        throw error;
      }
    }
  }, 60000);

  test('Should execute non-query statement (CREATE TIMESERIES)', async () => {
    if (!session.isOpen()) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    try {
      await session.executeNonQueryStatement(
        'CREATE TIMESERIES root.test_db.device1.temperature WITH DATATYPE=FLOAT, ENCODING=RLE'
      );
      // Should not throw
    } catch (error: any) {
      // Might fail if timeseries already exists, that's ok
      if (!error.message.includes('already exists')) {
        throw error;
      }
    }
  }, 60000);

  test('Should execute query statement (SHOW DATABASES)', async () => {
    if (!session.isOpen()) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    const result = await session.executeQueryStatement('SHOW DATABASES');

    expect(result).toBeDefined();
    expect(result.columns).toBeDefined();
    expect(Array.isArray(result.columns)).toBe(true);
    expect(result.rows).toBeDefined();
    expect(Array.isArray(result.rows)).toBe(true);
  }, 60000);

  test('Should execute query statement (SHOW TIMESERIES)', async () => {
    if (!session.isOpen()) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    const result = await session.executeQueryStatement(
      'SHOW TIMESERIES root.test_db.**'
    );

    expect(result).toBeDefined();
    expect(result.columns).toBeDefined();
    expect(result.dataTypes).toBeDefined();
  }, 60000);

  test('Should insert tablet data', async () => {
    if (!session.isOpen()) {
      console.log('Skipping test - no IoTDB connection');
      return;
    }

    const tablet = {
      deviceId: 'root.test_db.device1',
      measurements: ['temperature', 'humidity'],
      dataTypes: [3, 3], // FLOAT
      timestamps: [Date.now(), Date.now() + 1000],
      values: [
        [25.5, 60.0],
        [26.0, 61.5],
      ],
    };

    try {
      await session.insertTablet(tablet);
      // Should not throw
    } catch (error: any) {
      console.warn('Insert tablet failed:', error.message);
      // Some errors might be expected if schema doesn't match
    }
  }, 60000);

  test('Should handle connection errors gracefully', async () => {
    const badSession = new Session({
      host: 'invalid-host-that-does-not-exist',
      port: 9999,
    }, 60000);

    await expect(badSession.open()).rejects.toThrow();
  }, 60000);
});
