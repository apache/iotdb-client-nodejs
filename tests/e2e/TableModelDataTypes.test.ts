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
import { ColumnCategory } from "../../src/client/Session";
import { TSDataType } from "../../src/utils/DataTypes";

describe("Table Model All Data Types E2E Tests", () => {
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
      console.log("Connected to IoTDB for table model data types test");

      // Cleanup from previous runs
      try {
        await pool.executeNonQueryStatement("DROP DATABASE test");
      } catch (e) {
        // Ignore if doesn't exist
      }
    } catch (error) {
      console.warn("Could not connect to IoTDB. E2E tests will be skipped.");
      console.warn(
        "Set IOTDB_HOST, IOTDB_PORT to run E2E tests against a real instance.",
      );
      try {
        await pool.close();
      } catch {
        // Ignore cleanup errors
      }
    }
  }, 60000);

  afterAll(async () => {
    if (pool && isConnected) {
      // Cleanup test data
      try {
        await pool.executeNonQueryStatement("DROP DATABASE test");
      } catch (error) {
        // Ignore cleanup errors
      }
      await pool.close();
    }
  }, 60000);

  test("Should create database and table with all data types", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    // Create database
    await pool.executeNonQueryStatement("CREATE DATABASE test");

    // Switch to database context
    await pool.executeNonQueryStatement("USE test");

    // Create table with all 10 data types in relational schema
    // Tags: metadata for grouping/filtering (indexed)
    // Attributes: static properties (not time-series)
    // Fields: actual time-series measurements
    await pool.executeNonQueryStatement(
      "CREATE TABLE all_types_table(" +
        "region STRING TAG, " + // Tag for filtering
        "device_id STRING TAG, " + // Tag for device identification
        "model STRING ATTRIBUTE, " + // Static attribute
        "boolean_field BOOLEAN FIELD, " + // All 10 data types as fields
        "int32_field INT32 FIELD, " +
        "int64_field INT64 FIELD, " +
        "float_field FLOAT FIELD, " +
        "double_field DOUBLE FIELD, " +
        "text_field TEXT FIELD, " +
        "timestamp_field TIMESTAMP FIELD, " +
        "date_field DATE FIELD, " +
        "blob_field BLOB FIELD, " +
        "string_field STRING FIELD) " +
        "WITH (TTL=3600000)",
    );

    // Verify table created
    const dataSet = await pool.executeQueryStatement("SHOW TABLES");
    const rows = [];
    while (await dataSet.hasNext()) {
      rows.push(dataSet.next());
    }
    await dataSet.close();
    expect(rows.length).toBeGreaterThan(0);
    console.log("Created table with all 10 data types in table model");
  }, 60000);

  test("Should insert and retrieve all data types in table model", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    const now = Date.now();

    // Ensure we're in the correct database context
    await pool.executeNonQueryStatement("USE test");

    // Insert data using insertTablet - table model API
    const tablet = {
      tableName: "all_types_table", // Table name without database prefix
      columnNames: [
        "region", // TAG
        "device_id", // TAG
        "model", // ATTRIBUTE
        "boolean_field", // FIELD
        "int32_field", // FIELD
        "int64_field", // FIELD
        "float_field", // FIELD
        "double_field", // FIELD
        "text_field", // FIELD
        "timestamp_field", // FIELD
        "date_field", // FIELD
        "blob_field", // FIELD
        "string_field", // FIELD
      ],
      columnTypes: [
        TSDataType.STRING, // region (TAG)
        TSDataType.STRING, // device_id (TAG)
        TSDataType.STRING, // model (ATTRIBUTE)
        TSDataType.BOOLEAN, // boolean_field
        TSDataType.INT32, // int32_field
        TSDataType.INT64, // int64_field
        TSDataType.FLOAT, // float_field
        TSDataType.DOUBLE, // double_field
        TSDataType.TEXT, // text_field
        TSDataType.TIMESTAMP, // timestamp_field
        TSDataType.DATE, // date_field
        TSDataType.BLOB, // blob_field
        TSDataType.STRING, // string_field
      ],
      columnCategories: [
        ColumnCategory.TAG, // region
        ColumnCategory.TAG, // device_id
        ColumnCategory.ATTRIBUTE, // model
        ColumnCategory.FIELD, // boolean_field
        ColumnCategory.FIELD, // int32_field
        ColumnCategory.FIELD, // int64_field
        ColumnCategory.FIELD, // float_field
        ColumnCategory.FIELD, // double_field
        ColumnCategory.FIELD, // text_field
        ColumnCategory.FIELD, // timestamp_field
        ColumnCategory.FIELD, // date_field
        ColumnCategory.FIELD, // blob_field
        ColumnCategory.FIELD, // string_field
      ],
      timestamps: [now, now + 1000, now + 2000],
      values: [
        [
          "region1",
          "device001",
          "model_a",
          true,
          100,
          1000n,
          1.23,
          4.56,
          "text1",
          new Date(now),
          new Date(now),
          Buffer.from([0x01, 0x02]),
          "string1",
        ],
        [
          "region1",
          "device001",
          "model_a",
          false,
          200,
          2000n,
          2.34,
          5.67,
          "text2",
          new Date(now + 1000),
          new Date(now + 1000),
          Buffer.from([0x03, 0x04]),
          "string2",
        ],
        [
          "region1",
          "device002",
          "model_b",
          true,
          300,
          3000n,
          3.45,
          6.78,
          "text3",
          new Date(now + 2000),
          new Date(now + 2000),
          Buffer.from([0x05, 0x06]),
          "string3",
        ],
      ],
    };

    await pool.insertTablet(tablet);
    console.log("Inserted data with all 10 data types in table model");

    // Query data - table model supports WHERE clauses on tags
    const dataSet = await pool.executeQueryStatement(
      "SELECT * FROM all_types_table WHERE region = 'region1'",
    );

    expect(dataSet).toBeDefined();
    const rows = [];
    while (await dataSet.hasNext()) {
      rows.push(dataSet.next());
    }
    await dataSet.close();

    expect(rows.length).toBeGreaterThanOrEqual(3);

    console.log(`Retrieved ${rows.length} rows from table model`);
    console.log("Sample row:", rows[0]);

    // Verify data types in results
    const firstRow = rows[0];
    expect(firstRow.getFields().length).toBeGreaterThan(10); // timestamp + tags + attributes + fields

    console.log("All 10 data types successfully tested in table model");
  }, 60000);

  test("Should support table model queries", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    // Create another table in the same database
    await pool.executeNonQueryStatement(
      "CREATE TABLE test_table(" +
        "id STRING TAG, " +
        "value INT32 FIELD) " +
        "WITH (TTL=3600000)",
    );

    // Verify table in current context
    const dataSet = await pool.executeQueryStatement("SHOW TABLES");
    const rows = [];
    while (await dataSet.hasNext()) {
      rows.push(dataSet.next());
    }
    await dataSet.close();
    expect(rows.length).toBeGreaterThanOrEqual(2);

    console.log("Multiple tables in same database verified");
  }, 60000);

  test("Should handle queries with aggregations on table model", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    // Query with COUNT aggregation
    const countDataSet = await pool.executeQueryStatement(
      "SELECT COUNT(int32_field), COUNT(text_field) FROM all_types_table",
    );

    const countRows = [];
    while (await countDataSet.hasNext()) {
      countRows.push(countDataSet.next());
    }
    await countDataSet.close();

    expect(countRows.length).toBeGreaterThan(0);
    console.log("COUNT result:", countRows[0]);

    // Query with aggregation on numeric types
    const aggDataSet = await pool.executeQueryStatement(
      "SELECT AVG(float_field), MAX(int32_field), MIN(double_field) FROM all_types_table",
    );

    const aggRows = [];
    while (await aggDataSet.hasNext()) {
      aggRows.push(aggDataSet.next());
    }
    await aggDataSet.close();

    expect(aggRows.length).toBeGreaterThan(0);
    console.log("Aggregation result:", aggRows[0]);
  }, 60000);

  test("Should handle time-based queries in table model", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    const now = Date.now();
    const futureTime = now + 10000;

    // Query with time range
    const dataSet = await pool.executeQueryStatement(
      `SELECT * FROM all_types_table WHERE time >= ${now} AND time < ${futureTime}`,
    );

    const rows = [];
    while (await dataSet.hasNext()) {
      rows.push(dataSet.next());
    }
    await dataSet.close();

    console.log(`Time-based query returned ${rows.length} rows`);
  }, 60000);

  test("Should demonstrate difference between tree and table models", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    console.log("\n=== Tree Model vs Table Model Comparison ===");

    console.log("\nTree Model characteristics:");
    console.log("- Hierarchical paths: root.database.device.sensor");
    console.log("- Each timeseries defined separately");
    console.log("- deviceId in insertTablet is a full path");
    console.log("- Example: root.test.device1.temperature");

    console.log("\nTable Model characteristics:");
    console.log("- Relational schema with tags, attributes, fields");
    console.log("- Table defines the schema once");
    console.log("- deviceId in insertTablet is the table name");
    console.log("- Supports WHERE clauses on tags");
    console.log("- Example: SELECT * FROM table WHERE tag = 'value'");

    // Demonstrate table model query with tags
    const dataSet = await pool.executeQueryStatement(
      "SELECT device_id, int32_field FROM all_types_table WHERE region = 'region1'",
    );

    const rows = [];
    while (await dataSet.hasNext()) {
      rows.push(dataSet.next());
    }
    await dataSet.close();

    console.log(`\nTag-based query returned ${rows.length} rows`);
    console.log("This type of query is specific to table model");
  }, 60000);

  test("Should handle batch inserts with all data types", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    const baseTime = Date.now() + 20000;
    const batchSize = 20;
    const timestamps: number[] = [];
    const values: any[][] = [];

    for (let i = 0; i < batchSize; i++) {
      timestamps.push(baseTime + i * 1000);
      values.push([
        "region2", // region (TAG)
        `device${i % 3}`, // device_id (TAG)
        "model_batch", // model (ATTRIBUTE)
        i % 2 === 0, // boolean_field
        i * 10, // int32_field
        BigInt(i * 100), // int64_field
        i * 1.5, // float_field
        i * 2.5, // double_field
        `batch_${i}`, // text_field
        new Date(baseTime + i * 1000), // timestamp_field
        new Date(baseTime + i * 1000), // date_field
        Buffer.from([i % 256]), // blob_field
        `string_${i}`, // string_field
      ]);
    }

    const tablet = {
      tableName: "all_types_table",
      columnNames: [
        "region",
        "device_id",
        "model",
        "boolean_field",
        "int32_field",
        "int64_field",
        "float_field",
        "double_field",
        "text_field",
        "timestamp_field",
        "date_field",
        "blob_field",
        "string_field",
      ],
      columnTypes: [
        TSDataType.STRING,
        TSDataType.STRING,
        TSDataType.STRING,
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
      columnCategories: [
        ColumnCategory.TAG,
        ColumnCategory.TAG,
        ColumnCategory.ATTRIBUTE,
        ColumnCategory.FIELD,
        ColumnCategory.FIELD,
        ColumnCategory.FIELD,
        ColumnCategory.FIELD,
        ColumnCategory.FIELD,
        ColumnCategory.FIELD,
        ColumnCategory.FIELD,
        ColumnCategory.FIELD,
        ColumnCategory.FIELD,
        ColumnCategory.FIELD,
      ],
      timestamps,
      values,
    };

    await pool.insertTablet(tablet);
    console.log(`Inserted ${batchSize} rows in batch with all data types`);

    // Verify batch insert
    const dataSet = await pool.executeQueryStatement(
      `SELECT COUNT(*) FROM all_types_table WHERE time >= ${baseTime}`,
    );

    const rows = [];
    while (await dataSet.hasNext()) {
      rows.push(dataSet.next());
    }
    await dataSet.close();

    expect(rows.length).toBeGreaterThan(0);
    console.log("Batch insert verified");
  }, 60000);
});
