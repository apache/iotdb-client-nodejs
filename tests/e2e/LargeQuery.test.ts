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

describe("Large Query E2E Tests", () => {
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
      fetchSize: 100, // Small fetch size to force multiple fetchResult calls
    });

    try {
      await session.open();
      console.log("Connected to IoTDB for large query tests");
    } catch (error) {
      console.warn("Could not connect to IoTDB. E2E tests will be skipped.");
      console.warn(
        "Set IOTDB_HOST, IOTDB_PORT to run E2E tests against a real instance.",
      );
      try {
        await session.close();
      } catch {
        // Ignore cleanup errors
      }
    }
  }, 60000);

  afterAll(async () => {
    if (session && session.isOpen()) {
      // Cleanup test data
      try {
        await session.executeNonQueryStatement("DROP DATABASE root.test");
      } catch (error) {
        // Ignore cleanup errors
      }
      await session.close();
    }
  }, 60000);

  test("Should prepare test database and timeseries", async () => {
    if (!session.isOpen()) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    try {
      await session.executeNonQueryStatement("CREATE DATABASE root.test");
    } catch (error: any) {
      if (!error.message?.includes("already")) {
        throw error;
      }
    }

    // Create timeseries for large dataset - handle if they already exist
    try {
      await session.executeNonQueryStatement(
        "CREATE TIMESERIES root.test.device1.sensor1 WITH DATATYPE=FLOAT, ENCODING=RLE",
      );
    } catch (error: any) {
      if (!error.message?.includes("already exists")) {
        throw error;
      }
    }

    try {
      await session.executeNonQueryStatement(
        "CREATE TIMESERIES root.test.device1.sensor2 WITH DATATYPE=FLOAT, ENCODING=RLE",
      );
    } catch (error: any) {
      if (!error.message?.includes("already exists")) {
        throw error;
      }
    }

    try {
      await session.executeNonQueryStatement(
        "CREATE TIMESERIES root.test.device1.sensor3 WITH DATATYPE=FLOAT, ENCODING=RLE",
      );
    } catch (error: any) {
      if (!error.message?.includes("already exists")) {
        throw error;
      }
    }
  });

  test("Should insert large dataset (5,000 records)", async () => {
    if (!session.isOpen()) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    const batchSize = 250;
    const totalRecords = 5000;
    const baseTime = Date.now();

    // Insert data in batches
    for (let i = 0; i < totalRecords; i += batchSize) {
      const timestamps: number[] = [];
      const values: number[][] = [];

      for (let j = 0; j < batchSize && i + j < totalRecords; j++) {
        timestamps.push(baseTime + (i + j)); // 1ms interval
        values.push([
          20 + Math.random() * 10, // sensor1
          50 + Math.random() * 20, // sensor2
          100 + Math.random() * 50, // sensor3
        ]);
      }

      await session.insertTablet({
        deviceId: "root.test.device1",
        measurements: ["sensor1", "sensor2", "sensor3"],
        dataTypes: [TSDataType.FLOAT, TSDataType.FLOAT, TSDataType.FLOAT],
        timestamps,
        values,
      });
    }

    console.log(`Inserted ${totalRecords} records for large query test`);
  });

  test("Should query large dataset requiring multiple fetchResult calls", async () => {
    if (!session.isOpen()) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    // Query all data - with fetchSize=100, this should require multiple fetchResult calls
    const dataSet = await session.executeQueryStatement(
      "SELECT * FROM root.test.device1",
    );

    expect(dataSet).toBeDefined();
    const columnNames = dataSet.getColumnNames();
    expect(columnNames).toBeDefined();
    expect(columnNames.length).toBeGreaterThan(0);

    const rows = [];
    while (await dataSet.hasNext()) {
      const row = await dataSet.next();
      rows.push(row);
    }
    await dataSet.close();

    expect(rows.length).toBeGreaterThanOrEqual(5000);

    console.log(`Retrieved ${rows.length} rows with fetchSize=100`);
    console.log(`Columns: ${columnNames.join(", ")}`);
  }, 30000);

  test("Should query with filters on large dataset", async () => {
    if (!session.isOpen()) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    const dataSet = await session.executeQueryStatement(
      "SELECT sensor1, sensor2 FROM root.test.device1 WHERE sensor1 > 25",
    );

    expect(dataSet).toBeDefined();
    const columnNames = dataSet.getColumnNames();
    expect(columnNames).toBeDefined();

    const rows = [];
    while (await dataSet.hasNext()) {
      const row = await dataSet.next();
      rows.push(row);
    }
    await dataSet.close();

    expect(rows.length).toBeGreaterThan(0);

    console.log(`Filtered query returned ${rows.length} rows`);
  }, 30000);

  test("Should query with aggregation on large dataset", async () => {
    if (!session.isOpen()) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    // IoTDB 2.x requires separate aggregation queries
    const countDataSet = await session.executeQueryStatement(
      "SELECT COUNT(sensor1) FROM root.test.device1",
    );

    expect(countDataSet).toBeDefined();
    const countColumns = countDataSet.getColumnNames();
    expect(countColumns).toBeDefined();

    const countRows = [];
    while (await countDataSet.hasNext()) {
      const row = await countDataSet.next();
      countRows.push(row);
    }
    await countDataSet.close();

    expect(countRows.length).toBeGreaterThan(0);

    console.log("COUNT result:", countRows[0]);

    const avgDataSet = await session.executeQueryStatement(
      "SELECT AVG(sensor1) FROM root.test.device1",
    );

    expect(avgDataSet).toBeDefined();

    const avgRows = [];
    while (await avgDataSet.hasNext()) {
      const row = await avgDataSet.next();
      avgRows.push(row);
    }
    await avgDataSet.close();

    expect(avgRows.length).toBeGreaterThan(0);

    console.log("AVG result:", avgRows[0]);
  }, 30000);

  test("Should query with LIMIT on large dataset", async () => {
    if (!session.isOpen()) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    // Query the first 100 records using LIMIT
    const dataSet = await session.executeQueryStatement(
      `SELECT * FROM root.test.device1 LIMIT 100`,
    );

    expect(dataSet).toBeDefined();

    const rows = [];
    while (await dataSet.hasNext()) {
      const row = await dataSet.next();
      rows.push(row);
    }
    await dataSet.close();

    expect(rows.length).toBeGreaterThan(0);

    console.log(`LIMIT query returned ${rows.length} rows`);
  }, 30000);

  test("Should handle multiple concurrent large queries", async () => {
    if (!session.isOpen()) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    const queries = [
      "SELECT sensor1 FROM root.test.device1",
      "SELECT sensor2 FROM root.test.device1",
      "SELECT sensor3 FROM root.test.device1",
      "SELECT COUNT(*) FROM root.test.device1",
    ];

    const dataSets = await Promise.all(
      queries.map((query) => session.executeQueryStatement(query)),
    );

    expect(dataSets).toHaveLength(4);

    for (let index = 0; index < dataSets.length; index++) {
      const dataSet = dataSets[index];
      expect(dataSet).toBeDefined();

      const rows = [];
      while (await dataSet.hasNext()) {
        const row = await dataSet.next();
        rows.push(row);
      }
      await dataSet.close();

      console.log(`Query ${index + 1} returned ${rows.length} rows`);
    }
  }, 60000); // Increased timeout for concurrent queries
});
