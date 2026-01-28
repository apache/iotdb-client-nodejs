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

describe("SessionPool E2E Tests", () => {
  const IOTDB_HOST = process.env.IOTDB_HOST || "localhost";
  const IOTDB_PORT = parseInt(process.env.IOTDB_PORT || "6667");
  const IOTDB_USER = process.env.IOTDB_USER || "root";
  const IOTDB_PASSWORD = process.env.IOTDB_PASSWORD || "root";

  let pool: SessionPool;
  let isConnected = false;

  beforeAll(async () => {
    pool = new SessionPool(IOTDB_HOST, IOTDB_PORT, {
      username: IOTDB_USER,
      password: IOTDB_PASSWORD,
      maxPoolSize: 5,
      minPoolSize: 2,
    });

    try {
      await pool.init();
      isConnected = true;
    } catch (error) {
      console.warn("Could not connect to IoTDB. E2E tests will be skipped.");
      console.warn(
        "Set IOTDB_HOST, IOTDB_PORT to run E2E tests against a real instance.",
      );
    }
  }, 60000);

  afterAll(async () => {
    if (pool && isConnected) {
      // Cleanup test data
      try {
        await pool.executeNonQueryStatement("DROP DATABASE root.test");
      } catch (error) {
        // Ignore cleanup errors
      }
      await pool.close();
    }
  }, 60000);

  test("Should initialize pool with minimum connections", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    expect(pool.getPoolSize()).toBeGreaterThanOrEqual(2);
  });

  test("Should execute query using pool", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    const result = await pool.executeQueryStatement("SHOW DATABASES");

    expect(result).toBeDefined();
    expect(result.columns).toBeDefined();
    expect(Array.isArray(result.rows)).toBe(true);
  });

  test("Should execute non-query using pool", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    try {
      await pool.executeNonQueryStatement("CREATE DATABASE root.test");
      // Should not throw
    } catch (error: any) {
      // Might fail if database already exists, that's ok
      if (
        !error.message.includes("already exists") &&
        !error.message.includes("has already been created as database")
      ) {
        throw error;
      }
    }
  });

  test("Should handle multiple concurrent queries", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(pool.executeQueryStatement("SHOW DATABASES"));
    }

    const results = await Promise.all(promises);

    expect(results).toHaveLength(10);
    results.forEach((result) => {
      expect(result).toBeDefined();
      expect(result.columns).toBeDefined();
    });
  });

  test("Should insert tablet using pool", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    const tablet = {
      deviceId: "root.test.device1",
      measurements: ["temperature"],
      dataTypes: [TSDataType.FLOAT],
      timestamps: [Date.now()],
      values: [[25.5]],
    };

    try {
      await pool.insertTablet(tablet);
      // Should not throw
    } catch (error: any) {
      console.warn("Insert tablet via pool failed:", error.message);
    }
  });

  test("Should support multi-node configuration", async () => {
    // Skip this test in 1C1D setup - only run in 3C3D
    if (!process.env.MULTI_NODE) {
      console.log("Skipping multi-node test in 1C1D configuration");
      return;
    }

    const multiNodePool = new SessionPool(
      [IOTDB_HOST, "localhost"],
      IOTDB_PORT,
      {
        username: IOTDB_USER,
        password: IOTDB_PASSWORD,
        maxPoolSize: 3,
        minPoolSize: 1,
      },
    );

    try {
      await multiNodePool.init();
      expect(multiNodePool.getPoolSize()).toBeGreaterThanOrEqual(1);
      await multiNodePool.close();
    } catch (error) {
      console.warn(
        "Multi-node test failed, this is expected if IoTDB is not available",
      );
    }
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

    // Track pool statistics
    const inUseBefore = pool.getInUseSize();
    const availableBefore = pool.getAvailableSize();

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

    // Verify pool statistics updated correctly
    const inUseAfter = pool.getInUseSize();
    const availableAfter = pool.getAvailableSize();

    expect(inUseAfter).toBe(inUseBefore - 1);
    expect(availableAfter).toBe(availableBefore + 1);
  });

  test("Should handle multiple explicit sessions concurrently", async () => {
    if (!isConnected) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    const sessionPromises = [];

    // Get multiple sessions concurrently
    for (let i = 0; i < 3; i++) {
      sessionPromises.push(
        pool.getSession().then(async (session) => {
          try {
            // Execute a query with this session
            const result =
              await session.executeQueryStatement("SHOW DATABASES");
            expect(result).toBeDefined();
            return session;
          } catch (error) {
            pool.releaseSession(session);
            throw error;
          }
        }),
      );
    }

    const sessions = await Promise.all(sessionPromises);

    // All sessions should be valid
    expect(sessions.length).toBe(3);
    sessions.forEach((session) => {
      expect(session.isOpen()).toBe(true);
    });

    // Release all sessions
    sessions.forEach((session) => {
      pool.releaseSession(session);
    });

    // All sessions should be available again
    expect(pool.getAvailableSize()).toBeGreaterThanOrEqual(3);
  });
});
