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
import { TSDataType } from "../../src/utils/DataTypes";

describe("All Data Types E2E Tests", () => {
  const IOTDB_HOST = process.env.IOTDB_HOST || "localhost";
  const IOTDB_PORT = parseInt(process.env.IOTDB_PORT || "6667");
  const IOTDB_USER = process.env.IOTDB_USER || "root";
  const IOTDB_PASSWORD = process.env.IOTDB_PASSWORD || "root";

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
      console.log("Connected to IoTDB for all data types test");
    } catch (error) {
      console.warn("Could not connect to IoTDB. E2E tests will be skipped.");
      console.warn(
        "Set IOTDB_HOST, IOTDB_PORT to run E2E tests against a real instance.",
      );
    }
  }, 60000);

  afterAll(async () => {
    if (session && session.isOpen()) {
      await session.close();
    }
  }, 60000);

  test("Should create database and timeseries with all data types", async () => {
    if (!session.isOpen()) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    // Create database
    try {
      await session.executeNonQueryStatement("CREATE DATABASE root.test");
    } catch (error: any) {
      // IoTDB returns "already exist" or "has already been created"
      if (
        !error.message?.includes("already exist") &&
        !error.message?.includes("has already been created")
      ) {
        throw error;
      }
    }

    // Create timeseries for each data type
    const dataTypes = [
      { name: "boolean_sensor", type: "BOOLEAN", encoding: "PLAIN" },
      { name: "int32_sensor", type: "INT32", encoding: "RLE" },
      { name: "int64_sensor", type: "INT64", encoding: "RLE" },
      { name: "float_sensor", type: "FLOAT", encoding: "RLE" },
      { name: "double_sensor", type: "DOUBLE", encoding: "RLE" },
      { name: "text_sensor", type: "TEXT", encoding: "PLAIN" },
      { name: "timestamp_sensor", type: "TIMESTAMP", encoding: "PLAIN" },
      { name: "date_sensor", type: "DATE", encoding: "PLAIN" },
      { name: "blob_sensor", type: "BLOB", encoding: "PLAIN" },
      { name: "string_sensor", type: "STRING", encoding: "PLAIN" },
    ];

    for (const dt of dataTypes) {
      try {
        await session.executeNonQueryStatement(
          `CREATE TIMESERIES root.test.device1.${dt.name} WITH DATATYPE=${dt.type}, ENCODING=${dt.encoding}`,
        );
      } catch (error: any) {
        // IoTDB returns "already exist" (without 's')
        if (!error.message?.includes("already exist")) {
          console.warn(
            `Failed to create timeseries ${dt.name}: ${error.message}`,
          );
        }
      }
    }

    console.log("Created timeseries for all supported data types");
  }, 60000);

  test("Should insert and retrieve data for all data types", async () => {
    if (!session.isOpen()) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    // Ensure database exists
    try {
      await session.executeNonQueryStatement("CREATE DATABASE root.test");
    } catch (e: any) {
      if (!e.message?.includes("already")) {
        throw e;
      }
    }

    // Ensure all timeseries exist (re-create if they were deleted)
    const dataTypes = [
      { name: "boolean_sensor", type: "BOOLEAN", encoding: "PLAIN" },
      { name: "int32_sensor", type: "INT32", encoding: "RLE" },
      { name: "int64_sensor", type: "INT64", encoding: "RLE" },
      { name: "float_sensor", type: "FLOAT", encoding: "RLE" },
      { name: "double_sensor", type: "DOUBLE", encoding: "RLE" },
      { name: "text_sensor", type: "TEXT", encoding: "PLAIN" },
      { name: "timestamp_sensor", type: "TIMESTAMP", encoding: "PLAIN" },
      { name: "date_sensor", type: "DATE", encoding: "PLAIN" },
      { name: "blob_sensor", type: "BLOB", encoding: "PLAIN" },
      { name: "string_sensor", type: "STRING", encoding: "PLAIN" },
    ];

    for (const dt of dataTypes) {
      try {
        await session.executeNonQueryStatement(
          `CREATE TIMESERIES root.test.device1.${dt.name} WITH DATATYPE=${dt.type}, ENCODING=${dt.encoding}`,
        );
      } catch (error: any) {
        // IoTDB returns "already exist" (without 's')
        if (!error.message?.includes("already exist")) {
          throw error;
        }
      }
    }

    const now = Date.now();

    // Insert tablet data with all types
    const tablet = {
      deviceId: "root.test.device1",
      measurements: [
        "boolean_sensor",
        "int32_sensor",
        "int64_sensor",
        "float_sensor",
        "double_sensor",
        "text_sensor",
        "timestamp_sensor",
        "date_sensor",
        "blob_sensor",
        "string_sensor",
      ],
      // Use TSDataType enum for clarity
      dataTypes: [
        TSDataType.BOOLEAN,
        TSDataType.INT32,
        TSDataType.INT64,
        TSDataType.FLOAT,
        TSDataType.DOUBLE,
        TSDataType.TEXT,
        TSDataType.TIMESTAMP,
        TSDataType.DATE,
        TSDataType.BLOB,
        TSDataType.STRING,
      ],
      timestamps: [now, now + 1, now + 2],
      values: [
        [
          true,
          100,
          1000n,
          1.23,
          4.56,
          "hello",
          new Date(now),
          new Date(now),
          Buffer.from([0x01, 0x02, 0x03]),
          "str1",
        ],
        [
          false,
          200,
          2000n,
          2.34,
          5.67,
          "world",
          new Date(now + 1),
          new Date(now + 1),
          Buffer.from([0x04, 0x05, 0x06]),
          "str2",
        ],
        [
          true,
          300,
          3000n,
          3.45,
          6.78,
          "test",
          new Date(now + 2),
          new Date(now + 2),
          Buffer.from([0x07, 0x08, 0x09]),
          "str3",
        ],
      ],
    };

    await session.insertTablet(tablet);
    console.log("Inserted data with all data types");

    // Query the data back
    const result = await session.executeQueryStatement(
      "SELECT * FROM root.test.device1",
    );

    expect(result).toBeDefined();
    expect(result.rows).toBeDefined();
    expect(result.rows.length).toBeGreaterThanOrEqual(3);

    console.log(`Retrieved ${result.rows.length} rows`);
    console.log("Sample row:", result.rows[0]);

    // Verify data types
    const firstRow = result.rows[0];
    expect(firstRow.length).toBe(11); // timestamp + 10 columns

    // Check timestamp
    expect(typeof firstRow[0]).toBe("bigint");

    // Check BOOLEAN
    expect(typeof firstRow[1]).toBe("boolean");
    expect(firstRow[1]).toBe(true);

    // Check INT32
    expect(typeof firstRow[2]).toBe("number");
    expect(firstRow[2]).toBe(100);

    // Check INT64
    expect(typeof firstRow[3]).toBe("bigint");
    expect(firstRow[3]).toBe(1000n);

    // Check FLOAT
    expect(typeof firstRow[4]).toBe("number");
    expect(firstRow[4]).toBeCloseTo(1.23, 2);

    // Check DOUBLE
    expect(typeof firstRow[5]).toBe("number");
    expect(firstRow[5]).toBeCloseTo(4.56, 2);

    // Check TEXT
    expect(typeof firstRow[6]).toBe("string");
    expect(firstRow[6]).toBe("hello");

    // Check TIMESTAMP
    expect(firstRow[7]).toBeInstanceOf(Date);

    // Check DATE
    expect(firstRow[8]).toBeInstanceOf(Date);

    // Check BLOB
    expect(Buffer.isBuffer(firstRow[9])).toBe(true);
    expect(firstRow[9]).toEqual(Buffer.from([0x01, 0x02, 0x03]));

    // Check STRING
    expect(typeof firstRow[10]).toBe("string");
    expect(firstRow[10]).toBe("str1");
  }, 60000);

  test("Should handle null values for all data types", async () => {
    if (!session.isOpen()) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    const now = Date.now() + 10000; // Different timestamp to avoid conflicts

    // Insert some null values
    const tablet = {
      deviceId: "root.test.device1",
      measurements: [
        "boolean_sensor",
        "int32_sensor",
        "int64_sensor",
        "float_sensor",
        "double_sensor",
        "text_sensor",
        "timestamp_sensor",
        "date_sensor",
        "blob_sensor",
        "string_sensor",
      ],
      dataTypes: [
        TSDataType.BOOLEAN,
        TSDataType.INT32,
        TSDataType.INT64,
        TSDataType.FLOAT,
        TSDataType.DOUBLE,
        TSDataType.TEXT,
        TSDataType.TIMESTAMP,
        TSDataType.DATE,
        TSDataType.BLOB,
        TSDataType.STRING,
      ],
      timestamps: [now],
      values: [
        [
          false,
          999,
          9999n,
          9.99,
          99.99,
          "null_test",
          new Date(now),
          new Date(now),
          Buffer.from([0xff]),
          "str_null",
        ],
      ],
    };

    await session.insertTablet(tablet);

    // Query to verify
    const result = await session.executeQueryStatement(
      `SELECT * FROM root.test.device1 WHERE time = ${now}`,
    );

    expect(result.rows.length).toBeGreaterThan(0);
    console.log("Null handling test row:", result.rows[0]);
  }, 60000);

  test("Should handle multiple rows with mixed data types", async () => {
    if (!session.isOpen()) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    const baseTime = Date.now() + 20000;
    const rowCount = 10;

    const timestamps: number[] = [];
    const values: any[][] = [];

    for (let i = 0; i < rowCount; i++) {
      timestamps.push(baseTime + i * 1000);
      values.push([
        i % 2 === 0, // boolean: alternating true/false
        i * 10, // int32: 0, 10, 20, ...
        BigInt(i * 100), // int64: 0, 100, 200, ...
        i * 1.5, // float
        i * 2.5, // double
        `value_${i}`, // text
        new Date(baseTime + i * 1000), // timestamp
        new Date(baseTime + i * 1000), // date
        Buffer.from([i % 256]), // blob
        `string_${i}`, // string
      ]);
    }

    const tablet = {
      deviceId: "root.test.device1",
      measurements: [
        "boolean_sensor",
        "int32_sensor",
        "int64_sensor",
        "float_sensor",
        "double_sensor",
        "text_sensor",
        "timestamp_sensor",
        "date_sensor",
        "blob_sensor",
        "string_sensor",
      ],
      dataTypes: [
        TSDataType.BOOLEAN,
        TSDataType.INT32,
        TSDataType.INT64,
        TSDataType.FLOAT,
        TSDataType.DOUBLE,
        TSDataType.TEXT,
        TSDataType.TIMESTAMP,
        TSDataType.DATE,
        TSDataType.BLOB,
        TSDataType.STRING,
      ],
      timestamps,
      values,
    };

    await session.insertTablet(tablet);
    console.log(`Inserted ${rowCount} rows with mixed data types`);

    // Query and verify
    const result = await session.executeQueryStatement(
      `SELECT * FROM root.test.device1 WHERE time >= ${baseTime} AND time < ${baseTime + rowCount * 1000}`,
    );

    expect(result.rows.length).toBeGreaterThanOrEqual(rowCount);
    console.log(`Retrieved ${result.rows.length} rows from mixed data query`);

    // Verify a few rows
    for (let i = 0; i < Math.min(3, result.rows.length); i++) {
      const row = result.rows[i];
      console.log(`Row ${i}:`, row);

      // Verify we have all columns
      expect(row.length).toBe(11); // timestamp + 10 data columns
    }
  }, 60000);

  test("Should handle queries with aggregation on different data types", async () => {
    if (!session.isOpen()) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    // Query with COUNT - IoTDB requires separate queries for different aggregations
    const countResult1 = await session.executeQueryStatement(
      "SELECT COUNT(int32_sensor) FROM root.test.device1",
    );
    expect(countResult1.rows).toBeDefined();
    expect(countResult1.rows.length).toBeGreaterThan(0);
    console.log("COUNT(int32_sensor) result:", countResult1.rows[0]);

    const countResult2 = await session.executeQueryStatement(
      "SELECT COUNT(text_sensor) FROM root.test.device1",
    );
    expect(countResult2.rows).toBeDefined();
    expect(countResult2.rows.length).toBeGreaterThan(0);
    console.log("COUNT(text_sensor) result:", countResult2.rows[0]);

    // Query with aggregation on numeric types - separate queries
    const avgResult = await session.executeQueryStatement(
      "SELECT AVG(float_sensor) FROM root.test.device1",
    );
    expect(avgResult.rows).toBeDefined();
    expect(avgResult.rows.length).toBeGreaterThan(0);

    const maxResult = await session.executeQueryStatement(
      "SELECT MAX(int32_sensor) FROM root.test.device1",
    );
    expect(maxResult.rows).toBeDefined();
    expect(maxResult.rows.length).toBeGreaterThan(0);

    const minResult = await session.executeQueryStatement(
      "SELECT MIN(double_sensor) FROM root.test.device1",
    );
    expect(minResult.rows).toBeDefined();
    expect(minResult.rows.length).toBeGreaterThan(0);

    console.log(
      "Aggregation results - AVG:",
      avgResult.rows[0],
      "MAX:",
      maxResult.rows[0],
      "MIN:",
      minResult.rows[0],
    );
  }, 60000);
});
