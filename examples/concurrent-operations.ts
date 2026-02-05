/**
 * Concurrent Operations Example
 *
 * This example demonstrates the new concurrent execution APIs
 * for high-throughput scenarios:
 * 
 * - insertTablets: Single RPC call for multiple tablets
 * - insertTabletsParallel: Concurrent tablet insertion with concurrency control
 * - executeParallel: Generic concurrent execution utility
 * - executeConcurrent: Utility for any async operations
 */

import { 
  Session, 
  SessionPool, 
  TreeTablet,
  TSDataType,
  executeConcurrent,
  chunkArray,
  createSemaphore
} from "../src";

async function demonstrateSessionApis() {
  console.log("=== Session Concurrent APIs ===\n");

  const session = new Session({
    host: "localhost",
    port: 6667,
    username: "root",
    password: "root",
  });

  try {
    await session.open();
    console.log("Session opened");

    // Setup database
    try {
      await session.executeNonQueryStatement("CREATE DATABASE root.concurrent_demo");
    } catch {
      // Ignore if exists
    }

    // === insertTablets: Single RPC call for multiple tablets ===
    console.log("\n1. insertTablets - Single RPC for multiple tablets");
    
    const tablets: TreeTablet[] = [];
    const baseTime = Date.now();
    
    for (let i = 0; i < 10; i++) {
      const tablet = new TreeTablet(
        `root.concurrent_demo.batch_device${i}`,
        ["temperature", "humidity"],
        [TSDataType.FLOAT, TSDataType.FLOAT]
      );
      tablet.addRow(baseTime + i * 1000, [25.0 + i, 60.0 + i]);
      tablets.push(tablet);
    }

    console.log(`Inserting ${tablets.length} tablets in single RPC call...`);
    const startBatch = Date.now();
    await session.insertTablets(tablets);
    console.log(`Completed in ${Date.now() - startBatch}ms`);

    // === insertTabletsParallel: Concurrent with controlled parallelism ===
    console.log("\n2. insertTabletsParallel - Concurrent insertion");
    
    const moreTablets: TreeTablet[] = [];
    for (let i = 0; i < 50; i++) {
      const tablet = new TreeTablet(
        `root.concurrent_demo.parallel_device${i}`,
        ["value"],
        [TSDataType.FLOAT]
      );
      tablet.addRow(Date.now() + i * 100, [Math.random() * 100]);
      moreTablets.push(tablet);
    }

    console.log(`Inserting ${moreTablets.length} tablets with concurrency=10...`);
    const startParallel = Date.now();
    await session.insertTabletsParallel(moreTablets, 10);
    const elapsedParallel = Date.now() - startParallel;
    console.log(`Completed in ${elapsedParallel}ms (${(moreTablets.length * 1000 / elapsedParallel).toFixed(2)} tablets/sec)`);

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await session.close();
    console.log("\nSession closed");
  }
}

async function demonstratePoolApis() {
  console.log("\n=== SessionPool Concurrent APIs ===\n");

  const pool = new SessionPool("localhost", 6667, {
    username: "root",
    password: "root",
    maxPoolSize: 10,
    minPoolSize: 3,
  });

  try {
    await pool.init();
    console.log(`Pool initialized with ${pool.getPoolSize()} connections`);

    // Setup database
    try {
      await pool.executeNonQueryStatement("CREATE DATABASE root.pool_concurrent_demo");
    } catch {
      // Ignore if exists
    }

    // === insertTabletsParallel: Pool-level concurrent insertion ===
    console.log("\n3. Pool.insertTabletsParallel - Pre-acquires sessions for efficiency");
    
    const tablets = [];
    for (let i = 0; i < 100; i++) {
      tablets.push({
        deviceId: `root.pool_concurrent_demo.device${i}`,
        measurements: ["value"],
        dataTypes: [TSDataType.FLOAT],
        timestamps: [Date.now() + i * 10],
        values: [[Math.random() * 100]],
      });
    }

    console.log(`Inserting ${tablets.length} tablets with concurrency=10...`);
    const startPool = Date.now();
    await pool.insertTabletsParallel(tablets, { concurrency: 10 });
    const elapsedPool = Date.now() - startPool;
    console.log(`Completed in ${elapsedPool}ms (${(tablets.length * 1000 / elapsedPool).toFixed(2)} tablets/sec)`);

    // === executeParallel: Generic concurrent execution ===
    console.log("\n4. Pool.executeParallel - Generic concurrent operations");
    
    const operations = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      query: `SHOW TIMESERIES root.pool_concurrent_demo.device${i}.**`
    }));

    console.log(`Executing ${operations.length} queries concurrently...`);
    const results = await pool.executeParallel(
      operations,
      async (session, op) => {
        const dataSet = await session.executeQueryStatement(op.query);
        let count = 0;
        while (await dataSet.hasNext()) {
          dataSet.next();
          count++;
        }
        await dataSet.close();
        return { id: op.id, rowCount: count };
      },
      { concurrency: 5 }
    );
    
    // Check for failed operations (undefined values indicate failures when stopOnError=false)
    const failedCount = results.filter(r => r === undefined).length;
    if (failedCount > 0) {
      console.log(`Warning: ${failedCount} operations failed`);
    }
    console.log(`Results: ${results.filter(r => r && r.rowCount > 0).length} devices have timeseries`);

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await pool.close();
    console.log("\nPool closed");
  }
}

async function demonstrateUtilityFunctions() {
  console.log("\n=== Utility Functions ===\n");

  // === executeConcurrent: Standalone utility ===
  console.log("5. executeConcurrent - Standalone concurrent execution");
  
  const items = Array.from({ length: 20 }, (_, i) => i);
  
  console.log(`Processing ${items.length} items with concurrency=5...`);
  const result = await executeConcurrent(
    items,
    async (item) => {
      // Simulate async work
      await new Promise(resolve => setTimeout(resolve, 50));
      return item * 2;
    },
    { concurrency: 5, logProgressEvery: 10 }
  );
  
  console.log(`Completed: ${result.successCount} successes, ${result.failureCount} failures`);
  console.log(`Duration: ${result.durationMs}ms`);

  // === chunkArray: Split large arrays ===
  console.log("\n6. chunkArray - Split arrays for batch processing");
  
  const largeArray = Array.from({ length: 100 }, (_, i) => i);
  const chunks = chunkArray(largeArray, 25);
  console.log(`Split ${largeArray.length} items into ${chunks.length} chunks of ${chunks[0].length} items each`);

  // === createSemaphore: Fine-grained concurrency control ===
  console.log("\n7. createSemaphore - Fine-grained concurrency control");
  
  const sem = createSemaphore(3);
  let concurrent = 0;
  let maxConcurrent = 0;
  
  const tasks = Array.from({ length: 10 }, (_, i) => async () => {
    await sem.acquire();
    concurrent++;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    
    // Simulate work
    await new Promise(resolve => setTimeout(resolve, 20));
    
    concurrent--;
    sem.release();
    return i;
  });

  await Promise.all(tasks.map(t => t()));
  console.log(`Max concurrent operations: ${maxConcurrent} (limit was 3)`);
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║           Concurrent Operations Example                        ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  // Demonstrate utility functions (no IoTDB needed)
  await demonstrateUtilityFunctions();

  // The following require IoTDB - uncomment when running against a real instance
  // await demonstrateSessionApis();
  // await demonstratePoolApis();

  console.log("\n✅ Example completed successfully");
  console.log("\nNote: To test IoTDB integration, uncomment the Session and Pool demos");
}

main().catch(console.error);
