/**
 * TableSessionPool Example
 *
 * This example demonstrates how to use TableSessionPool for table model
 * operations in IoTDB, including explicit session management, nodeUrls,
 * and concurrent batch operations for high-throughput scenarios.
 */

import { TableSessionPool, PoolConfigBuilder, TSDataType, ColumnCategory, TableTablet } from "../src";

async function main() {
  console.log("=== TableSessionPool Example ===\n");

  // Method 1: Traditional constructor (backward compatible)
  console.log("Method 1: Traditional constructor");
  const pool1 = new TableSessionPool("localhost", 6667, {
    username: "root",
    password: "root",
    database: "my_database", // Set default database
    maxPoolSize: 10,
    minPoolSize: 2,
  });

  // Method 2: Using Builder pattern (recommended)
  console.log("Method 2: Using Builder pattern");
  const pool2 = new TableSessionPool(
    new PoolConfigBuilder()
      .host("localhost")
      .port(6667)
      .username("root")
      .password("root")
      .database("my_database")
      .maxPoolSize(10)
      .minPoolSize(2)
      .build(),
  );

  // Method 3: Using nodeUrls with string format (for multi-node)
  console.log("Method 3: Using nodeUrls in string format");
  const pool3 = new TableSessionPool({
    nodeUrls: ["node1:6667", "node2:6668", "node3:6669"],
    username: "root",
    password: "root",
    database: "my_database",
    maxPoolSize: 10,
    minPoolSize: 2,
  });

  // Method 4: Using Builder with nodeUrls
  console.log("Method 4: Using Builder with nodeUrls");
  const pool4 = new TableSessionPool(
    new PoolConfigBuilder()
      .nodeUrls(["node1:6667", "node2:6668", "node3:6669"])
      .username("root")
      .password("root")
      .database("my_database")
      .maxPoolSize(10)
      .minPoolSize(2)
      .build(),
  );

  // For demo purposes, we'll use pool1
  const pool = pool1;

  try {
    // Initialize the pool
    console.log("\nInitializing table session pool...");
    await pool.init();
    console.log(
      "Table pool initialized with",
      pool.getPoolSize(),
      "connections",
    );

    // Create database if not exists
    console.log("\nSetting up database...");
    await pool.executeNonQueryStatement(
      "CREATE DATABASE IF NOT EXISTS root.table_example",
    );

    // Approach 1: Using pool methods directly (automatic session management)
    console.log("\n--- Approach 1: Automatic session management ---");
    console.log("Executing table queries...");
    const dataSet = await pool.executeQueryStatement("SHOW DATABASES");
    let dbCount = 0;
    while (await dataSet.hasNext()) {
      dataSet.next();
      dbCount++;
    }
    await dataSet.close();
    console.log("Databases found:", dbCount);

    // Insert data using TableTablet class with addRow method
    console.log("Inserting table data using addRow...");
    const tablet = new TableTablet(
      "table1",
      ["device_id", "column1", "column2"],
      [TSDataType.TEXT, TSDataType.INT32, TSDataType.FLOAT],
      [
        ColumnCategory.TAG,    // device_id - indexed tag for filtering
        ColumnCategory.FIELD,  // column1 - measurement value
        ColumnCategory.FIELD,  // column2 - measurement value
      ]
    );
    
    // Add rows one at a time - convenient for streaming data
    tablet.addRow(Date.now(), ["device_001", 100, 25.5]);
    tablet.addRow(Date.now() + 1000, ["device_002", 200, 30.5]);
    
    await pool.insertTablet(tablet);
    console.log("Table data inserted");

    // Approach 2: Explicit session management
    console.log("\n--- Approach 2: Explicit session management ---");
    console.log("Getting a session from the pool...");
    const session = await pool.getSession();

    try {
      console.log("Executing operations with explicit session...");

      // Query with explicit session
      const queryDataSet = await session.executeQueryStatement("SHOW DATABASES");
      let rowCount = 0;
      while (await queryDataSet.hasNext()) {
        queryDataSet.next();
        rowCount++;
      }
      await queryDataSet.close();
      console.log("Query result:", rowCount, "rows");

      // Insert with explicit session using TableTablet class with addRow
      const sessionTablet = new TableTablet(
        "table1",
        ["device_id", "column1", "column2"],
        [TSDataType.TEXT, TSDataType.INT32, TSDataType.FLOAT],
        [
          ColumnCategory.TAG,    // device_id - indexed tag
          ColumnCategory.FIELD,  // column1 - measurement
          ColumnCategory.FIELD,  // column2 - measurement
        ]
      );
      sessionTablet.addRow(Date.now() + 2000, ["device_003", 300, 35.5]);
      
      await session.insertTablet(sessionTablet);
      console.log("Table data inserted via explicit session");
    } finally {
      // Always release the session back to the pool
      pool.releaseSession(session);
      console.log("Session released back to the pool");
    }

    // Approach 3: Concurrent batch insertion (NEW API - insertTabletsParallel)
    console.log("\n--- Approach 3: Concurrent batch insertion (insertTabletsParallel) ---");
    const tablets = [];
    const batchTime = Date.now();
    
    for (let i = 0; i < 20; i++) {
      tablets.push({
        tableName: "batch_table",
        columnNames: ["device_id", "temperature"],
        columnTypes: [TSDataType.STRING, TSDataType.FLOAT],  // Use STRING for TAG columns
        columnCategories: [ColumnCategory.TAG, ColumnCategory.FIELD],
        timestamps: [batchTime + i * 1000],
        values: [[`batch_device_${i}`, 20.0 + i]],
      });
    }

    console.log(`Inserting ${tablets.length} table tablets concurrently...`);
    const startTime = Date.now();
    await pool.insertTabletsParallel(tablets, { concurrency: 5 });
    const elapsed = Date.now() - startTime;
    console.log(`Inserted ${tablets.length} tablets in ${elapsed}ms (${(tablets.length * 1000 / elapsed).toFixed(2)} tablets/sec)`);

    // Approach 4: Generic parallel execution (NEW API - executeParallel)
    console.log("\n--- Approach 4: Generic parallel execution (executeParallel) ---");
    const tableNames = ["parallel_t1", "parallel_t2", "parallel_t3", "parallel_t4"];
    
    console.log(`Creating ${tableNames.length} tables in parallel...`);
    const results = await pool.executeParallel(
      tableNames,
      async (session, tableName) => {
        try {
          await session.executeNonQueryStatement(
            `CREATE TABLE IF NOT EXISTS ${tableName}(device_id TEXT TAG, value FLOAT FIELD)`
          );
        } catch {
          // Ignore if already exists
        }
        return `Created ${tableName}`;
      },
      { concurrency: 4 }
    );
    console.log("Results:", results);

    // Pool statistics
    console.log("\nTable pool statistics:");
    console.log("Total connections:", pool.getPoolSize());
    console.log("Available connections:", pool.getAvailableSize());
    console.log("In-use connections:", pool.getInUseSize());

    // Enhanced metrics
    console.log("\nEnhanced metrics:");
    console.log("Total (new API):", pool.totalCount);
    console.log("Idle (new API):", pool.idleCount);
    console.log("Active (new API):", pool.activeCount);
    console.log("Waiting requests:", pool.waitingCount);

    // Get comprehensive stats
    const stats = pool.getPoolStats();
    console.log("\nComprehensive stats:", stats);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    console.log("\nClosing table session pool...");
    await pool.close();
    console.log("Table pool closed");
  }
}

main().catch(console.error);
