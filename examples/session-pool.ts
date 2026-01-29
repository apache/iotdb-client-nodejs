/**
 * SessionPool Example
 *
 * This example demonstrates how to use SessionPool for efficient connection
 * management in high-concurrency scenarios, including explicit session management.
 */

import { SessionPool, PoolConfigBuilder } from "../src";

async function main() {
  console.log("=== SessionPool Example ===\n");

  // Method 1: Traditional constructor (backward compatible)
  console.log("Creating session pool using traditional constructor...");
  const pool1 = new SessionPool("localhost", 6667, {
    username: "root",
    password: "root",
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTime: 60000,
    waitTimeout: 60000,
  });

  // Method 2: Using Builder pattern (recommended)
  console.log("Creating session pool using Builder pattern...");
  const pool2 = new SessionPool(
    new PoolConfigBuilder()
      .host("localhost")
      .port(6667)
      .username("root")
      .password("root")
      .maxPoolSize(10)
      .minPoolSize(2)
      .maxIdleTime(60000)
      .waitTimeout(60000)
      .build(),
  );

  // For demo purposes, we'll use pool1
  const pool = pool1;

  try {
    // Initialize the pool
    console.log("\nInitializing session pool...");
    await pool.init();
    console.log("Pool initialized with", pool.getPoolSize(), "connections");

    // Create database
    console.log("\nCreating database...");
    await pool.executeNonQueryStatement("CREATE DATABASE root.pool_example");

    // Create timeseries
    console.log("Creating timeseries...");
    await pool.executeNonQueryStatement(
      "CREATE TIMESERIES root.pool_example.sensor1.value WITH DATATYPE=FLOAT",
    );

    // Approach 1: Using pool methods directly (automatic session management)
    console.log("\n--- Approach 1: Automatic session management ---");
    console.log("Executing concurrent queries...");
    const promises = [];

    for (let i = 0; i < 20; i++) {
      promises.push(
        pool.executeQueryStatement("SHOW DATABASES").then(async (dataSet) => {
          let count = 0;
          while (await dataSet.hasNext()) {
            dataSet.next();
            count++;
          }
          await dataSet.close();
          console.log(`Query ${i + 1} completed with ${count} rows`);
        }),
      );
    }

    await Promise.all(promises);
    console.log("All concurrent queries completed");

    // Approach 2: Explicit session management (new API)
    console.log("\n--- Approach 2: Explicit session management ---");
    console.log("Getting a session from the pool...");
    const session = await pool.getSession();

    try {
      console.log("Executing operations with explicit session...");

      // Insert data
      await session.insertTablet({
        deviceId: "root.pool_example.sensor1",
        measurements: ["value"],
        dataTypes: [TSDataType.FLOAT],
        timestamps: [Date.now()],
        values: [[42.5]],
      });
      console.log("Data inserted via explicit session");

      // Query data
      const dataSet = await session.executeQueryStatement(
        "SELECT * FROM root.pool_example.sensor1",
      );
      let rowCount = 0;
      while (await dataSet.hasNext()) {
        dataSet.next();
        rowCount++;
      }
      await dataSet.close();
      console.log("Query result:", rowCount, "rows");
    } finally {
      // Always release the session back to the pool
      pool.releaseSession(session);
      console.log("Session released back to the pool");
    }

    // Check pool statistics
    console.log("\nPool statistics:");
    console.log("Total connections:", pool.getPoolSize());
    console.log("Available connections:", pool.getAvailableSize());
    console.log("In-use connections:", pool.getInUseSize());
  } catch (error) {
    console.error("Error:", error);
  } finally {
    // Close the pool
    console.log("\nClosing session pool...");
    await pool.close();
    console.log("Pool closed");
  }
}

main().catch(console.error);
