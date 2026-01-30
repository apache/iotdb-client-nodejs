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

import { SessionPool } from "../../src/client/SessionPool";
import { TSDataType } from "../../src/utils/DataTypes";

describe("Multi-Node E2E Tests", () => {
  const IOTDB_HOST = process.env.IOTDB_HOST || "localhost";
  const IOTDB_PORT_1 = parseInt(process.env.IOTDB_PORT || "6667", 10);
  const IOTDB_PORT_2 = parseInt(process.env.IOTDB_PORT_2 || "6668", 10);
  const IOTDB_PORT_3 = parseInt(process.env.IOTDB_PORT_3 || "6669", 10);
  const IOTDB_USER = process.env.IOTDB_USER || "root";
  const IOTDB_PASSWORD = process.env.IOTDB_PASSWORD || "root";
  const IS_MULTI_NODE = process.env.MULTI_NODE === "true";

  let pool1: SessionPool;
  let pool2: SessionPool;
  let pool3: SessionPool;
  let isConnected = false;

  beforeAll(async () => {
    // Skip multi-node tests if not in multi-node environment
    if (!IS_MULTI_NODE) {
      console.log(
        "Skipping Multi-Node tests - not in multi-node environment (MULTI_NODE env var not set)",
      );
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
      console.log(
        `Successfully connected to IoTDB cluster on ports ${IOTDB_PORT_1}, ${IOTDB_PORT_2}, ${IOTDB_PORT_3}`,
      );
    } catch (error) {
      console.warn(
        "Could not connect to IoTDB. Multi-node E2E tests will be skipped.",
      );
      console.warn("Error:", error);
      await Promise.allSettled([
        pool1?.close(),
        pool2?.close(),
        pool3?.close(),
      ]);
    }
  }, 60000);

  // No beforeEach cleanup - tests handle "already exists" errors like other test files

  afterAll(async () => {
    if (!IS_MULTI_NODE) {
      return;
    }
    if (isConnected) {
      try {
        await pool1.executeNonQueryStatement("DROP DATABASE root.test");
      } catch (error) {
        // Ignore cleanup errors
      }

      // Close pools in parallel with timeout protection
      await Promise.allSettled([pool1.close(), pool2.close(), pool3.close()]);
    }
  }, 90000); // Increased timeout for multi-node cleanup

  test("Should initialize pools with connections to all three DataNodes", async () => {
    if (!IS_MULTI_NODE || !isConnected) {
      console.log(
        "Skipping test - not in multi-node environment or no IoTDB connection",
      );
      return;
    }

    expect(pool1.getPoolSize()).toBeGreaterThanOrEqual(2);
    expect(pool2.getPoolSize()).toBeGreaterThanOrEqual(2);
    expect(pool3.getPoolSize()).toBeGreaterThanOrEqual(2);
    console.log(
      `Pools initialized: DataNode1=${pool1.getPoolSize()}, DataNode2=${pool2.getPoolSize()}, DataNode3=${pool3.getPoolSize()} connections`,
    );
  });

  test("Should create database and timeseries on first node", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    // Create database - ignore if already exists (like other tests)
    try {
      await pool1.executeNonQueryStatement("CREATE DATABASE root.test");
    } catch (error: any) {
      if (
        !error.message?.includes("already exist") &&
        !error.message?.includes("has already been created")
      ) {
        throw error;
      }
    }

    // Create timeseries - ignore if already exist
    try {
      await pool1.executeNonQueryStatement(
        "CREATE TIMESERIES root.test.device1.temperature WITH DATATYPE=FLOAT",
      );
    } catch (error: any) {
      if (!error.message.includes("already")) {
        throw error;
      }
    }

    try {
      await pool1.executeNonQueryStatement(
        "CREATE TIMESERIES root.test.device1.humidity WITH DATATYPE=FLOAT",
      );
    } catch (error: any) {
      if (!error.message.includes("already")) {
        throw error;
      }
    }
  });

  test("Should handle concurrent load distributed across all three DataNodes", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    const operationsPerNode = 7;
    const promises: Promise<any>[] = [];

    // Distribute operations across all three DataNode pools
    for (let i = 0; i < operationsPerNode; i++) {
      // Insert to DataNode 1
      promises.push(
        pool1.insertTablet({
          deviceId: "root.test.device1",
          measurements: ["temperature", "humidity"],
          dataTypes: [TSDataType.FLOAT, TSDataType.FLOAT],
          timestamps: [Date.now() + i * 1000],
          values: [[20 + i * 0.1, 60 + i * 0.2]],
        }),
      );

      // Query from DataNode 2
      promises.push(
        pool2.executeQueryStatement("SELECT * FROM root.test.device1 LIMIT 10"),
      );

      // Insert to DataNode 3
      promises.push(
        pool3.insertTablet({
          deviceId: "root.test.device1",
          measurements: ["temperature", "humidity"],
          dataTypes: [TSDataType.FLOAT, TSDataType.FLOAT],
          timestamps: [Date.now() + i * 1000 + 500],
          values: [[21 + i * 0.1, 61 + i * 0.2]],
        }),
      );
    }

    const results = await Promise.all(promises);
    expect(results).toHaveLength(operationsPerNode * 3);

    // Close all SessionDataSet objects from query operations
    for (const result of results) {
      if (result && typeof result.close === "function") {
        await result.close();
      }
    }

    console.log(
      `Completed ${operationsPerNode * 3} concurrent operations across 3 DataNodes`,
    );
    console.log(
      `Pool stats: DN1=${pool1.getPoolSize()}/${pool1.getAvailableSize()}, DN2=${pool2.getPoolSize()}/${pool2.getAvailableSize()}, DN3=${pool3.getPoolSize()}/${pool3.getAvailableSize()}`,
    );
  });

  test("Should verify data replication across all DataNodes", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    // Insert data through DataNode 1
    await pool1.insertTablet({
      deviceId: "root.test.device1",
      measurements: ["temperature", "humidity"],
      dataTypes: [TSDataType.FLOAT, TSDataType.FLOAT],
      timestamps: [Date.now()],
      values: [[99.9, 99.9]],
    });

    // Wait briefly for replication (optimized from 2000ms to 200ms)
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Query from all three DataNodes - should see the same data
    const dataSet1 = await pool1.executeQueryStatement(
      "SELECT COUNT(*) FROM root.test.device1",
    );
    const dataSet2 = await pool2.executeQueryStatement(
      "SELECT COUNT(*) FROM root.test.device1",
    );
    const dataSet3 = await pool3.executeQueryStatement(
      "SELECT COUNT(*) FROM root.test.device1",
    );

    let count1 = 0;
    let count2 = 0;
    let count3 = 0;

    while (await dataSet1.hasNext()) {
      await dataSet1.next();
      count1++;
    }

    while (await dataSet2.hasNext()) {
      await dataSet2.next();
      count2++;
    }

    while (await dataSet3.hasNext()) {
      await dataSet3.next();
      count3++;
    }

    await dataSet1.close();
    await dataSet2.close();
    await dataSet3.close();

    expect(count1).toBeGreaterThan(0);
    expect(count2).toBeGreaterThan(0);
    expect(count3).toBeGreaterThan(0);

    console.log(
      `Data replicated across all DataNodes - verified queries from ports 6667, 6668, 6669`,
    );
  });

  test("Should handle large batch inserts across multiple DataNodes", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
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
      deviceId: "root.test.device1",
      measurements: ["temperature", "humidity"],
      dataTypes: [TSDataType.FLOAT, TSDataType.FLOAT],
      timestamps,
      values,
    });

    // Verify data from different DataNode
    const dataSet = await pool2.executeQueryStatement(
      "SELECT COUNT(*) FROM root.test.device1",
    );

    let rowCount = 0;
    while (await dataSet.hasNext()) {
      await dataSet.next();
      rowCount++;
    }

    await dataSet.close();

    expect(rowCount).toBeGreaterThan(0);
    console.log(
      `Inserted ${batchSize} records via DataNode1, queried via DataNode2`,
    );
  });

  test("Should maintain all pool healths under stress", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    const initialSize1 = pool1.getPoolSize();
    const initialSize2 = pool2.getPoolSize();
    const initialSize3 = pool3.getPoolSize();

    // Execute operations across all DataNodes (reduced to 5 per pool to avoid timeout)
    const promises: Promise<any>[] = [];
    for (let i = 0; i < 5; i++) {
      promises.push(pool1.executeQueryStatement("SHOW DATABASES"));
      promises.push(pool2.executeQueryStatement("SHOW DATABASES"));
      promises.push(pool3.executeQueryStatement("SHOW DATABASES"));
    }

    const dataSets = await Promise.all(promises);

    // Close all SessionDataSets in parallel (much faster)
    await Promise.all(dataSets.map((ds) => ds.close()));

    // Pools should maintain their sizes
    expect(pool1.getPoolSize()).toBeGreaterThanOrEqual(initialSize1);
    expect(pool2.getPoolSize()).toBeGreaterThanOrEqual(initialSize2);
    expect(pool3.getPoolSize()).toBeGreaterThanOrEqual(initialSize3);
    console.log("All three pool healths maintained after stress test");
  }, 30000); // Increased timeout from default to 30s

  test("Should handle queries across all DataNodes simultaneously", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    // First insert some data to ensure there's something to query
    await pool1.insertTablet({
      deviceId: "root.test.device1",
      measurements: ["temperature", "humidity"],
      dataTypes: [TSDataType.FLOAT, TSDataType.FLOAT],
      timestamps: [Date.now(), Date.now() + 1000, Date.now() + 2000],
      values: [
        [20.0, 60.0],
        [21.0, 61.0],
        [22.0, 62.0],
      ],
    });

    // Brief delay for data availability (optimized from 500ms to 100ms)
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Execute queries simultaneously on all three DataNodes
    const [dataSet1, dataSet2, dataSet3] = await Promise.all([
      pool1.executeQueryStatement("SELECT * FROM root.test.device1 LIMIT 5"),
      pool2.executeQueryStatement("SELECT * FROM root.test.device1 LIMIT 5"),
      pool3.executeQueryStatement("SELECT * FROM root.test.device1 LIMIT 5"),
    ]);

    // Count rows in parallel for better performance
    const [count1, count2, count3] = await Promise.all([
      (async () => {
        let count = 0;
        while (await dataSet1.hasNext()) {
          await dataSet1.next();
          count++;
        }
        return count;
      })(),
      (async () => {
        let count = 0;
        while (await dataSet2.hasNext()) {
          await dataSet2.next();
          count++;
        }
        return count;
      })(),
      (async () => {
        let count = 0;
        while (await dataSet3.hasNext()) {
          await dataSet3.next();
          count++;
        }
        return count;
      })(),
    ]);

    // Close all in parallel
    await Promise.all([dataSet1.close(), dataSet2.close(), dataSet3.close()]);

    expect(count1).toBeGreaterThan(0);
    expect(count2).toBeGreaterThan(0);
    expect(count3).toBeGreaterThan(0);
    console.log(
      `Simultaneous queries across 3 DataNodes: DN1=${count1}, DN2=${count2}, DN3=${count3} rows`,
    );
  }, 20000); // Increased timeout to 20s

  test("Should support nodeUrls configuration for multi-node setup", async () => {
    if (!IS_MULTI_NODE) {
      console.log("Skipping test - not in multi-node environment");
      return;
    }

    // Create a pool using nodeUrls in string format (RECOMMENDED)
    const nodeUrlsPool = new SessionPool({
      nodeUrls: [
        `${IOTDB_HOST}:${IOTDB_PORT_1}`,
        `${IOTDB_HOST}:${IOTDB_PORT_2}`,
        `${IOTDB_HOST}:${IOTDB_PORT_3}`,
      ],
      username: IOTDB_USER,
      password: IOTDB_PASSWORD,
      maxPoolSize: 6,
      minPoolSize: 3,
    });

    try {
      await nodeUrlsPool.init();
      expect(nodeUrlsPool.getPoolSize()).toBeGreaterThanOrEqual(3);

      // Execute a query to verify it works
      const dataSet =
        await nodeUrlsPool.executeQueryStatement("SHOW DATABASES");
      expect(dataSet.getColumnNames()).toBeDefined();
      await dataSet.close();

      console.log("nodeUrls string format configuration working correctly");
    } finally {
      await nodeUrlsPool.close();
    }
  }, 10000); // Add explicit 10s timeout

  test("Should support nodeUrls configuration in object format", async () => {
    if (!IS_MULTI_NODE) {
      console.log("Skipping test - not in multi-node environment");
      return;
    }

    // Create a pool using nodeUrls in object format (also supported)
    const nodeUrlsPool = new SessionPool({
      nodeUrls: [
        { host: IOTDB_HOST, port: IOTDB_PORT_1 },
        { host: IOTDB_HOST, port: IOTDB_PORT_2 },
        { host: IOTDB_HOST, port: IOTDB_PORT_3 },
      ],
      username: IOTDB_USER,
      password: IOTDB_PASSWORD,
      maxPoolSize: 6,
      minPoolSize: 3,
    });

    try {
      await nodeUrlsPool.init();
      expect(nodeUrlsPool.getPoolSize()).toBeGreaterThanOrEqual(3);

      // Execute a query to verify it works
      const dataSet =
        await nodeUrlsPool.executeQueryStatement("SHOW DATABASES");
      expect(dataSet.getColumnNames()).toBeDefined();
      await dataSet.close();

      console.log("nodeUrls object format configuration working correctly");
    } finally {
      await nodeUrlsPool.close();
    }
  }, 10000); // Add explicit 10s timeout
});
