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

import { TableSessionPool } from "../../src/client/TableSessionPool";
import { TSDataType } from "../../src/utils/DataTypes";

describe("TableSessionPool E2E Tests", () => {
  const IOTDB_HOST = process.env.IOTDB_HOST || "localhost";
  const IOTDB_PORT = parseInt(process.env.IOTDB_PORT || "6667");
  const IOTDB_USER = process.env.IOTDB_USER || "root";
  const IOTDB_PASSWORD = process.env.IOTDB_PASSWORD || "root";

  let pool: TableSessionPool;
  let isConnected = false;

  beforeAll(async () => {
    pool = new TableSessionPool(IOTDB_HOST, IOTDB_PORT, {
      username: IOTDB_USER,
      password: IOTDB_PASSWORD,
      database: "test",
      maxPoolSize: 5,
      minPoolSize: 2,
    });

    try {
      await pool.init();
      isConnected = true;
      // Cleanup from previous runs
      try {
        await pool.executeNonQueryStatement("DROP DATABASE test");
      } catch (e) {
        // Ignore errors if database doesn't exist
      }
    } catch (error) {
      console.warn("Could not connect to IoTDB. E2E tests will be skipped.");
      console.warn(
        "Set IOTDB_HOST, IOTDB_PORT to run E2E tests against a real instance.",
      );
    }
  }, 60000);

  afterAll(async () => {
    if (pool && isConnected) {
      // Cleanup
      try {
        await pool.executeNonQueryStatement("DROP DATABASE test");
      } catch (e) {
        // Ignore cleanup errors
      }
      await pool.close();
    }
  }, 60000);

  test("Should create database and tables", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    // Create database
    await pool.executeNonQueryStatement("CREATE DATABASE test");

    // Use test database
    await pool.executeNonQueryStatement("USE test");

    // Create table1
    await pool.executeNonQueryStatement(
      "CREATE TABLE table1(" +
        "region_id STRING TAG, " +
        "plant_id STRING TAG, " +
        "device_id STRING TAG, " +
        "model STRING ATTRIBUTE, " +
        "temperature FLOAT FIELD, " +
        "humidity DOUBLE FIELD) " +
        "WITH (TTL=3600000)",
    );

    // Create table2
    await pool.executeNonQueryStatement(
      "CREATE TABLE table2(" +
        "region_id STRING TAG, " +
        "plant_id STRING TAG, " +
        "color STRING ATTRIBUTE, " +
        "temperature FLOAT FIELD, " +
        "speed DOUBLE FIELD) " +
        "WITH (TTL=6600000)",
    );

    // Show tables from current database (test)
    const result1 = await pool.executeQueryStatement("SHOW TABLES");
    expect(result1).toBeDefined();
    expect(result1.rows.length).toBeGreaterThanOrEqual(2);
  });

  test("Should insert and query table data (based on C# example)", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    const tableName = "testTable1";

    // Create table
    await pool.executeNonQueryStatement(
      `CREATE TABLE ${tableName}(` +
        "region_id STRING TAG, " +
        "plant_id STRING TAG, " +
        "device_id STRING TAG, " +
        "model STRING ATTRIBUTE, " +
        "temperature FLOAT FIELD, " +
        "humidity DOUBLE FIELD)",
    );

    // Insert data using tablet - simplified to 50 records
    const tablet = {
      deviceId: tableName,
      measurements: [
        "region_id",
        "plant_id",
        "device_id",
        "model",
        "temperature",
        "humidity",
      ],
      dataTypes: [
        TSDataType.STRING,
        TSDataType.STRING,
        TSDataType.STRING,
        TSDataType.STRING,
        TSDataType.FLOAT,
        TSDataType.DOUBLE,
      ],
      timestamps: [] as number[],
      values: [] as any[][],
    };

    for (let i = 0; i < 50; i++) {
      tablet.timestamps.push(i);
      tablet.values.push(["1", "5", "3", "A", 1.23 + i, 111.1 + i]);
    }

    await pool.insertTablet(tablet);

    // Query the data
    const result = await pool.executeQueryStatement(
      `SELECT * FROM ${tableName} WHERE region_id = '1' AND plant_id IN ('3', '5') AND device_id = '3' LIMIT 10`,
    );

    expect(result).toBeDefined();
    expect(result.rows.length).toBeGreaterThan(0);
  });

  test("Should query tables from database context", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    // Show tables from current database (test)
    const result = await pool.executeQueryStatement("SHOW TABLES");
    expect(result).toBeDefined();
    expect(result.rows.length).toBeGreaterThan(0);
  });

  test("Should handle insert with null values (based on C# example)", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    const tableName = "t1";

    // Create table
    await pool.executeNonQueryStatement(
      `CREATE TABLE ${tableName}(t1 STRING TAG, f1 INT32 FIELD)`,
    );

    // Insert data with some null values
    const tablet = {
      deviceId: tableName,
      measurements: ["t1", "f1"],
      dataTypes: [TSDataType.STRING, TSDataType.INT32],
      timestamps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      values: [
        ["t1", 100],
        ["t1", 200],
        ["t1", 300],
        ["t1", 400],
        ["t1", 500],
        ["t1", null],
        ["t1", null],
        ["t1", null],
        ["t1", null],
        ["t1", null],
      ],
    };

    await pool.insertTablet(tablet);

    // Query null count
    const result = await pool.executeQueryStatement(
      `SELECT COUNT(*) FROM ${tableName} WHERE f1 IS NULL`,
    );

    expect(result).toBeDefined();
    expect(result.rows.length).toBeGreaterThan(0);
    // Should have 5 null values
    const count = result.rows[0][0];
    expect(count).toBe(5);
  });

  test("Should report pool statistics", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    const poolSize = pool.getPoolSize();
    const availableSize = pool.getAvailableSize();

    expect(poolSize).toBeGreaterThan(0);
    expect(availableSize).toBeGreaterThanOrEqual(0);
    expect(availableSize).toBeLessThanOrEqual(poolSize);
  });

  test("Should support explicit session management with getSession/releaseSession", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    // Get a session from the pool
    const session = await pool.getSession();
    expect(session).toBeDefined();
    expect(session.isOpen()).toBe(true);

    try {
      // Execute operations with the explicit session
      const result = await session.executeQueryStatement("SHOW DATABASES");
      expect(result).toBeDefined();
      expect(result.columns).toBeDefined();

      // Session should still be open
      expect(session.isOpen()).toBe(true);
    } finally {
      // Release the session back to the pool
      pool.releaseSession(session);
    }

    // Verify session is back in pool
    expect(pool.getAvailableSize()).toBeGreaterThan(0);
  });

  test("Should support nodeUrls in string format", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    // Create a table pool using nodeUrls in string format
    const stringNodeUrlsPool = new TableSessionPool({
      nodeUrls: [`${IOTDB_HOST}:${IOTDB_PORT}`],
      username: IOTDB_USER,
      password: IOTDB_PASSWORD,
      database: "test",
      maxPoolSize: 3,
      minPoolSize: 1,
    });

    try {
      await stringNodeUrlsPool.init();
      expect(stringNodeUrlsPool.getPoolSize()).toBeGreaterThanOrEqual(1);

      const result =
        await stringNodeUrlsPool.executeQueryStatement("SHOW DATABASES");
      expect(result).toBeDefined();

      console.log(
        "TableSessionPool with string format nodeUrls working correctly",
      );
    } finally {
      await stringNodeUrlsPool.close();
    }
  });
});
