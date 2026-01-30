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

import { Session } from "../../src/client/Session";

describe("SessionDataSet E2E Tests", () => {
  let session: Session;
  const IOTDB_HOST = process.env.IOTDB_HOST || "localhost";
  const IOTDB_PORT = parseInt(process.env.IOTDB_PORT || "6667");
  const IOTDB_USER = process.env.IOTDB_USER || "root";
  const IOTDB_PASSWORD = process.env.IOTDB_PASSWORD || "root";

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
      console.warn("Could not connect to IoTDB. Tests will be skipped.");
      try {
        await session.close();
      } catch {
        // Ignore cleanup errors
      }
    }
  }, 60000);

  afterAll(async () => {
    if (session && session.isOpen()) {
      await session.close();
    }
  });

  test("Should iterate through query results using SessionDataSet", async () => {
    if (!session.isOpen()) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    // Setup test data
    try {
      await session.executeNonQueryStatement("DELETE DATABASE root.test");
    } catch (e) {
      // Ignore if doesn't exist
    }

    await session.executeNonQueryStatement("CREATE DATABASE root.test");
    await session.executeNonQueryStatement(
      "CREATE TIMESERIES root.test.d1.s1 WITH DATATYPE=INT32, ENCODING=PLAIN",
    );
    await session.executeNonQueryStatement(
      "CREATE TIMESERIES root.test.d1.s2 WITH DATATYPE=TEXT, ENCODING=PLAIN",
    );

    // Insert test data
    const now = Date.now();
    for (let i = 0; i < 10; i++) {
      await session.executeNonQueryStatement(
        `INSERT INTO root.test.d1(timestamp, s1, s2) VALUES(${now + i}, ${i}, 'value${i}')`,
      );
    }

    // Query using SessionDataSet
    const dataSet = await session.executeQueryStatement(
      "SELECT s1, s2 FROM root.test.d1",
    );

    expect(dataSet).toBeDefined();
    // IoTDB returns fully qualified column names
    expect(dataSet.getColumnNames()).toEqual([
      "root.test.d1.s1",
      "root.test.d1.s2",
    ]);

    let rowCount = 0;
    const rows: any[] = [];

    while (await dataSet.hasNext()) {
      const row = dataSet.next();
      rowCount++;
      rows.push({
        timestamp: row.getTimestamp(),
        s1: row.getInt("root.test.d1.s1"),
        s2: row.getString("root.test.d1.s2"),
      });
    }

    expect(rowCount).toBe(10);
    expect(rows[0].s1).toBe(0);
    expect(rows[0].s2).toBe("value0");
    expect(rows[9].s1).toBe(9);
    expect(rows[9].s2).toBe("value9");

    await dataSet.close();
  }, 60000);

  test("Should handle large result sets with lazy loading", async () => {
    if (!session.isOpen()) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    await session.executeNonQueryStatement(
      "CREATE TIMESERIES root.test.large.d1.value WITH DATATYPE=INT32, ENCODING=PLAIN",
    );

    // Insert 100 rows
    const now = Date.now();
    for (let i = 0; i < 100; i++) {
      await session.executeNonQueryStatement(
        `INSERT INTO root.test.large.d1(timestamp, value) VALUES(${now + i}, ${i})`,
      );
    }

    // Query with small fetch size to test lazy loading
    const smallSession = new Session({
      host: IOTDB_HOST,
      port: IOTDB_PORT,
      username: IOTDB_USER,
      password: IOTDB_PASSWORD,
      fetchSize: 10, // Small fetch size to trigger multiple fetches
    });

    await smallSession.open();

    const dataSet = await smallSession.executeQueryStatement(
      "SELECT value FROM root.test.large.d1",
    );

    let rowCount = 0;
    while (await dataSet.hasNext()) {
      const row = dataSet.next();
      expect(row.getInt("root.test.large.d1.value")).toBe(rowCount);
      rowCount++;
    }

    expect(rowCount).toBe(100);

    await dataSet.close();
    await smallSession.close();
  }, 90000);

  test("Should support column access by name and index", async () => {
    if (!session.isOpen()) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    await session.executeNonQueryStatement(
      "CREATE TIMESERIES root.test.column.d1.temperature WITH DATATYPE=FLOAT, ENCODING=PLAIN",
    );
    await session.executeNonQueryStatement(
      "CREATE TIMESERIES root.test.column.d1.humidity WITH DATATYPE=DOUBLE, ENCODING=PLAIN",
    );

    const now = Date.now();
    await session.executeNonQueryStatement(
      `INSERT INTO root.test.column.d1(timestamp, temperature, humidity) VALUES(${now}, 23.5, 65.2)`,
    );

    const dataSet = await session.executeQueryStatement(
      "SELECT temperature, humidity FROM root.test.column.d1",
    );

    expect(await dataSet.hasNext()).toBe(true);
    const row = dataSet.next();

    // Access by column name (fully qualified)
    expect(row.getFloat("root.test.column.d1.temperature")).toBeCloseTo(
      23.5,
      1,
    );
    expect(row.getDouble("root.test.column.d1.humidity")).toBeCloseTo(65.2, 1);

    // Access by index
    expect(row.getFloatByIndex(0)).toBeCloseTo(23.5, 1);
    expect(row.getDoubleByIndex(1)).toBeCloseTo(65.2, 1);

    // Find column index (using fully qualified names)
    expect(dataSet.findColumn("root.test.column.d1.temperature")).toBe(0);
    expect(dataSet.findColumn("root.test.column.d1.humidity")).toBe(1);

    await dataSet.close();
  }, 60000);

  test("Should handle null values correctly", async () => {
    if (!session.isOpen()) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    await session.executeNonQueryStatement(
      "CREATE TIMESERIES root.test.null_test.d1.s1 WITH DATATYPE=INT32, ENCODING=PLAIN",
    );
    await session.executeNonQueryStatement(
      "CREATE TIMESERIES root.test.null_test.d1.s2 WITH DATATYPE=INT32, ENCODING=PLAIN",
    );

    const now = Date.now();
    // Insert row with one null value
    await session.executeNonQueryStatement(
      `INSERT INTO root.test.null_test.d1(timestamp, s1) VALUES(${now}, 100)`,
    );

    const dataSet = await session.executeQueryStatement(
      "SELECT s1, s2 FROM root.test.null_test.d1",
    );

    expect(await dataSet.hasNext()).toBe(true);
    const row = dataSet.next();

    expect(row.isNull("root.test.null_test.d1.s1")).toBe(false);
    expect(row.isNull("root.test.null_test.d1.s2")).toBe(true);

    expect(row.getInt("root.test.null_test.d1.s1")).toBe(100);

    await dataSet.close();
  }, 60000);

  test("Should support toArray() for backward compatibility", async () => {
    if (!session.isOpen()) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    // Setup test data
    try {
      await session.executeNonQueryStatement("DELETE DATABASE root.test");
    } catch (e) {
      // Ignore
    }

    await session.executeNonQueryStatement("CREATE DATABASE root.test");
    await session.executeNonQueryStatement(
      "CREATE TIMESERIES root.test.d1.value WITH DATATYPE=INT32, ENCODING=PLAIN",
    );

    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await session.executeNonQueryStatement(
        `INSERT INTO root.test.d1(timestamp, value) VALUES(${now + i}, ${i})`,
      );
    }

    const dataSet = await session.executeQueryStatement(
      "SELECT value FROM root.test.d1",
    );

    const allRows = await dataSet.toArray();

    expect(allRows.length).toBe(5);
    expect(allRows[0][1]).toBe(0); // timestamp, value
    expect(allRows[4][1]).toBe(4);

    // Dataset should be closed after toArray()
    expect(await dataSet.hasNext()).toBe(false);
  }, 60000);

  test("Should properly cleanup resources on close", async () => {
    if (!session.isOpen()) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    const dataSet = await session.executeQueryStatement("SHOW DATABASES");

    // Close without iterating through all results
    await dataSet.close();

    // Should not be able to iterate after close
    expect(await dataSet.hasNext()).toBe(false);
    expect(dataSet.isClosed_()).toBe(true);
  }, 60000);
});
