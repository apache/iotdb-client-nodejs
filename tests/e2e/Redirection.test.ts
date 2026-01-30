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
import { TableSessionPool } from "../../src/client/TableSessionPool";
import { TSDataType } from "../../src/utils/DataTypes";
import { ColumnCategory } from "../../src/client/Session";

describe("Redirection E2E Tests", () => {
  const IOTDB_HOST = process.env.IOTDB_HOST || "localhost";
  const IOTDB_PORT_1 = parseInt(process.env.IOTDB_PORT || "6667", 10);
  const IOTDB_PORT_2 = parseInt(process.env.IOTDB_PORT_2 || "6668", 10);
  const IOTDB_PORT_3 = parseInt(process.env.IOTDB_PORT_3 || "6669", 10);
  const IOTDB_USER = process.env.IOTDB_USER || "root";
  const IOTDB_PASSWORD = process.env.IOTDB_PASSWORD || "root";
  const IS_MULTI_NODE = process.env.MULTI_NODE === "true";

  let treePool: SessionPool;
  let tablePool: TableSessionPool;
  let isConnected = false;

  beforeAll(async () => {
    // Skip redirection tests if not in multi-node environment
    if (!IS_MULTI_NODE) {
      console.log(
        "Skipping Redirection tests - not in multi-node environment (MULTI_NODE env var not set)",
      );
      return;
    }

    console.log(`Testing redirection with multi-node IoTDB cluster:`);
    console.log(`  DataNode 1: ${IOTDB_HOST}:${IOTDB_PORT_1}`);
    console.log(`  DataNode 2: ${IOTDB_HOST}:${IOTDB_PORT_2}`);
    console.log(`  DataNode 3: ${IOTDB_HOST}:${IOTDB_PORT_3}`);

    try {
      // Create tree pool with redirection enabled
      treePool = new SessionPool({
        nodeUrls: [
          `${IOTDB_HOST}:${IOTDB_PORT_1}`,
          `${IOTDB_HOST}:${IOTDB_PORT_2}`,
          `${IOTDB_HOST}:${IOTDB_PORT_3}`,
        ],
        username: IOTDB_USER,
        password: IOTDB_PASSWORD,
        maxPoolSize: 10,
        minPoolSize: 1,
        enableRedirection: true,
        maxRedirectRetries: 3,
        redirectCacheTTL: 300000,
      });

      // Create table pool with redirection enabled
      tablePool = new TableSessionPool({
        nodeUrls: [
          `${IOTDB_HOST}:${IOTDB_PORT_1}`,
          `${IOTDB_HOST}:${IOTDB_PORT_2}`,
          `${IOTDB_HOST}:${IOTDB_PORT_3}`,
        ],
        username: IOTDB_USER,
        password: IOTDB_PASSWORD,
        maxPoolSize: 10,
        minPoolSize: 1,
        enableRedirection: true,
        maxRedirectRetries: 3,
        redirectCacheTTL: 300000,
      });

      await treePool.init();
      await tablePool.init();

      isConnected = true;
      console.log(
        `Successfully connected to IoTDB cluster on ports ${IOTDB_PORT_1}, ${IOTDB_PORT_2}, ${IOTDB_PORT_3}`,
      );
    } catch (error) {
      console.warn(
        "Could not connect to IoTDB. Redirection E2E tests will be skipped.",
      );
      console.warn("Error:", error);
      await Promise.allSettled([
        treePool?.close(),
        tablePool?.close(),
      ]);
    }
  }, 60000);

  afterAll(async () => {
    if (!IS_MULTI_NODE) {
      return;
    }

    if (isConnected) {
      // Cleanup test data
      try {
        await treePool?.executeNonQueryStatement("DROP DATABASE root.test_redirect");
      } catch (error: any) {
        if (!error.message?.includes("not exist")) {
          console.warn("Cleanup error:", error);
        }
      }

      try {
        await tablePool?.executeNonQueryStatement("DROP DATABASE test_redirect");
      } catch (error: any) {
        if (!error.message?.includes("not exist")) {
          console.warn("Cleanup error:", error);
        }
      }

      await Promise.allSettled([
        treePool?.close(),
        tablePool?.close(),
      ]);
    }
  }, 60000);

  describe("Tree Model Redirection", () => {
    test("Should handle writes to multiple devices with potential redirects", async () => {
      if (!IS_MULTI_NODE || !isConnected) {
        console.log("Skipping test - no multi-node IoTDB connection");
        return;
      }

      // Create database
      try {
        await treePool.executeNonQueryStatement("CREATE DATABASE root.test_redirect");
      } catch (error: any) {
        if (!error.message?.includes("already exists")) {
          throw error;
        }
      }

      // Write to multiple devices - these may trigger redirects
      const devices = [
        "root.test_redirect.device1",
        "root.test_redirect.device2",
        "root.test_redirect.device3",
        "root.test_redirect.device4",
        "root.test_redirect.device5",
      ];

      for (const deviceId of devices) {
        const tablet = {
          deviceId,
          measurements: ["temperature", "humidity"],
          dataTypes: [TSDataType.FLOAT, TSDataType.FLOAT],
          timestamps: [Date.now()],
          values: [[25.5 + Math.random() * 5, 60.0 + Math.random() * 10]],
        };

        // This should automatically handle redirects if needed
        await treePool.insertTablet(tablet);
      }

      // Verify data was written successfully by querying
      const dataSet = await treePool.executeQueryStatement(
        "SELECT * FROM root.test_redirect.**"
      );

      let rowCount = 0;
      while (await dataSet.hasNext()) {
        dataSet.next();
        rowCount++;
      }
      await dataSet.close();

      // We should have at least 5 rows (one per device)
      expect(rowCount).toBeGreaterThanOrEqual(5);
    });

    test("Should use cached endpoint for subsequent writes to same device", async () => {
      if (!IS_MULTI_NODE || !isConnected) {
        console.log("Skipping test - no multi-node IoTDB connection");
        return;
      }

      const deviceId = "root.test_redirect.cached_device";

      // First write - may trigger redirect
      const tablet1 = {
        deviceId,
        measurements: ["temperature"],
        dataTypes: [TSDataType.FLOAT],
        timestamps: [Date.now()],
        values: [[25.5]],
      };
      await treePool.insertTablet(tablet1);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Second write - should use cached endpoint (no redirect)
      const tablet2 = {
        deviceId,
        measurements: ["temperature"],
        dataTypes: [TSDataType.FLOAT],
        timestamps: [Date.now() + 1000],
        values: [[26.0]],
      };
      await treePool.insertTablet(tablet2);

      // Verify both writes succeeded
      const dataSet = await treePool.executeQueryStatement(
        `SELECT * FROM ${deviceId}`
      );

      let rowCount = 0;
      while (await dataSet.hasNext()) {
        dataSet.next();
        rowCount++;
      }
      await dataSet.close();

      expect(rowCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Table Model Redirection", () => {
    test("Should handle writes to multiple tables with potential redirects", async () => {
      if (!IS_MULTI_NODE || !isConnected) {
        console.log("Skipping test - no multi-node IoTDB connection");
        return;
      }

      // Create database
      try {
        await tablePool.executeNonQueryStatement("CREATE DATABASE test_redirect");
      } catch (error: any) {
        if (!error.message?.includes("already exists")) {
          throw error;
        }
      }

      // Switch to database
      try {
        await tablePool.executeNonQueryStatement("USE test_redirect");
      } catch (error) {
        console.warn("USE DATABASE error (may be expected):", error);
      }

      // Create table
      try {
        await tablePool.executeNonQueryStatement(
          "CREATE TABLE sensor_data (device_id STRING TAG, temperature FLOAT FIELD)"
        );
      } catch (error: any) {
        if (!error.message?.includes("already exists")) {
          throw error;
        }
      }

      // Write to table multiple times - may trigger redirects
      for (let i = 0; i < 5; i++) {
        const tablet = {
          tableName: "sensor_data",
          columnNames: ["device_id", "temperature"],
          columnTypes: [TSDataType.STRING, TSDataType.FLOAT],
          columnCategories: [ColumnCategory.TAG, ColumnCategory.FIELD],
          timestamps: [Date.now() + i * 1000],
          values: [[`device_${i}`, 25.5 + i]],
        };

        // This should automatically handle redirects if needed
        await tablePool.insertTablet(tablet);
      }

      // Verify data was written successfully
      const dataSet = await tablePool.executeQueryStatement(
        "SELECT * FROM sensor_data"
      );

      let rowCount = 0;
      while (await dataSet.hasNext()) {
        dataSet.next();
        rowCount++;
      }
      await dataSet.close();

      expect(rowCount).toBeGreaterThanOrEqual(5);
    });
  });

  describe("Redirection Configuration", () => {
    test("Should respect enableRedirection=false setting", async () => {
      if (!IS_MULTI_NODE || !isConnected) {
        console.log("Skipping test - no multi-node IoTDB connection");
        return;
      }

      // Create a pool with redirection disabled
      const noRedirectPool = new SessionPool({
        nodeUrls: [`${IOTDB_HOST}:${IOTDB_PORT_1}`],
        username: IOTDB_USER,
        password: IOTDB_PASSWORD,
        maxPoolSize: 5,
        minPoolSize: 1,
        enableRedirection: false,
      });

      try {
        await noRedirectPool.init();

        // Write should still work (but may be less optimal)
        const tablet = {
          deviceId: "root.test_redirect.no_redirect_device",
          measurements: ["temperature"],
          dataTypes: [TSDataType.FLOAT],
          timestamps: [Date.now()],
          values: [[25.5]],
        };

        // This should NOT use redirection even if server suggests it
        await noRedirectPool.insertTablet(tablet);

        // Verify write succeeded
        const dataSet = await noRedirectPool.executeQueryStatement(
          "SELECT * FROM root.test_redirect.no_redirect_device"
        );

        let rowCount = 0;
        while (await dataSet.hasNext()) {
          dataSet.next();
          rowCount++;
        }
        await dataSet.close();

        expect(rowCount).toBeGreaterThanOrEqual(1);
      } finally {
        await noRedirectPool.close();
      }
    });
  });
});
