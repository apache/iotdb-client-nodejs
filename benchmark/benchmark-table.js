#!/usr/bin/env node
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

/**
 * Table Model Benchmark (Optimized with insertTabletsParallel)
 *
 * Performance benchmark for IoTDB table model (relational model).
 * Uses optimized batch insert with pre-acquired sessions for maximum throughput.
 *
 * Usage:
 *   node benchmark-table.js [options]
 *
 * Environment Variables:
 *   IOTDB_HOST              - IoTDB host (default: localhost)
 *   IOTDB_PORT              - IoTDB port (default: 6667)
 *   CLIENT_NUMBER           - Concurrent clients (default: 10)
 *   DEVICE_NUMBER           - Number of devices (default: 100)
 *   SENSOR_NUMBER           - Sensors per device (default: 10)
 *   BATCH_SIZE_PER_WRITE    - Batch size (default: 100)
 *   LOOP                    - Number of loops (default: calculated from TOTAL_DATA_POINTS)
 *   REGENERATE_DATA         - Force regenerate data (default: false)
 */

const { TableSessionPool } = require('../dist');
const { createConfig, printConfig } = require('./config');
const { prepareTestData } = require('./data-generator');
const { createTableModelSchema, cleanupSchema } = require('./schema-manager');
const { runBatchBenchmark } = require('./benchmark-core');

// Import ColumnCategory from dist
const { ColumnCategory } = require('../dist');

/**
 * Create table session pool
 * @param {Object} config - Configuration object
 * @returns {TableSessionPool} Table session pool instance
 */
function createTableSessionPool(config) {
  if (config.NODE_URLS) {
    // Multi-node configuration
    return new TableSessionPool({
      nodeUrls: config.NODE_URLS,
      username: config.IOTDB_USER,
      password: config.IOTDB_PASSWORD,
      database: config.DATABASE_NAME,
      maxPoolSize: config.POOL_MAX_SIZE,
      minPoolSize: config.POOL_MIN_SIZE,
      maxIdleTime: config.POOL_MAX_IDLE_TIME,
      waitTimeout: config.POOL_WAIT_TIMEOUT,
    });
  } else {
    // Single node configuration
    return new TableSessionPool(config.IOTDB_HOST, config.IOTDB_PORT, {
      username: config.IOTDB_USER,
      password: config.IOTDB_PASSWORD,
      database: config.DATABASE_NAME,
      maxPoolSize: config.POOL_MAX_SIZE,
      minPoolSize: config.POOL_MIN_SIZE,
      maxIdleTime: config.POOL_MAX_IDLE_TIME,
      waitTimeout: config.POOL_WAIT_TIMEOUT,
    });
  }
}

/**
 * Build tablets for a single loop iteration (memory efficient)
 * @param {Object} testData - Test data structure
 * @param {Object} config - Configuration object
 * @param {number} loopIdx - Current loop index
 * @returns {Array} Array of tablet objects for this loop
 */
function buildTabletsForLoop(testData, config, loopIdx) {
  const tablets = [];
  const baseTimestamp = Date.now() + loopIdx * config.BATCH_SIZE_PER_WRITE * config.POINT_STEP;
  const batch = testData.sharedBatches[0];

  for (const device of testData.devices) {
    // Update timestamps for this loop iteration
    const updatedTimestamps = batch.timestamps.map((offset) => baseTimestamp + offset);

    // Build column names, types, and categories for table model
    const columnNames = ['device_id', ...device.measurements];
    const columnTypes = [11, ...device.dataTypes]; // STRING (11) for device_id
    const columnCategories = [
      ColumnCategory.TAG,
      ...device.measurements.map(() => ColumnCategory.FIELD)
    ];

    // Build values array including device_id for each row
    const valuesWithDeviceId = batch.values.map((row) => [
      device.deviceId,
      ...row
    ]);

    tablets.push({
      tableName: config.TABLE_NAME,
      columnNames: columnNames,
      columnTypes: columnTypes,
      columnCategories: columnCategories,
      timestamps: updatedTimestamps,
      values: valuesWithDeviceId,
      measurements: device.measurements,
    });
  }

  return tablets;
}

/**
 * Main benchmark function
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║          IoTDB Table Model Benchmark (Optimized Batch Insert)             ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log();

  // Create configuration
  const config = createConfig();
  printConfig(config);

  let pool = null;

  try {
    // Step 1: Prepare test data
    console.log('Step 1: Preparing test data...');
    const testData = await prepareTestData(config, 'table');
    console.log(`✓ Test data ready: ${testData.devices.length} devices with ${config.SENSOR_NUMBER} sensors each`);

    // Step 2: Create table session pool
    console.log('\nStep 2: Initializing table session pool...');
    pool = createTableSessionPool(config);
    await pool.init();
    console.log(`✓ Table session pool initialized: ${pool.getPoolSize()} connections`);

    // Step 3: Create schema
    console.log('\nStep 3: Creating schema...');
    await createTableModelSchema(pool, testData, config);
    console.log('✓ Schema creation completed');

    // Step 4: Run streaming batch benchmark
    console.log('\nStep 4: Running streaming batch benchmark...');
    const results = await runStreamingBenchmark(pool, testData, config);

    // Step 5: Summary
    console.log('\n' + '='.repeat(80));
    console.log('BENCHMARK COMPLETED SUCCESSFULLY');
    console.log('='.repeat(80));
    console.log(`\nKey Metrics:`);
    console.log(`  • Total Operations:    ${results.total_operations}`);
    console.log(`  • Success Rate:        ${results.success_rate}`);
    console.log(`  • Throughput:          ${parseFloat(results.points_per_sec).toLocaleString()} points/sec`);
    console.log(`  • Average Latency:     ${results.latency.avg}ms`);
    console.log(`  • Test Duration:       ${results.duration_sec}s`);

  } catch (error) {
    console.error('\n' + '!'.repeat(80));
    console.error('BENCHMARK FAILED');
    console.error('!'.repeat(80));
    console.error('\nError:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  } finally {
    // Close pool
    if (pool) {
      console.log('\nClosing table session pool...');
      await pool.close();
      console.log('✓ Table session pool closed');
    }
  }
}

/**
 * Run streaming benchmark - process tablets loop by loop to avoid memory issues
 * @param {Object} pool - Session pool
 * @param {Object} testData - Test data
 * @param {Object} config - Configuration
 * @returns {Object} Benchmark results
 */
async function runStreamingBenchmark(pool, testData, config) {
  const { MetricsCollector, ProgressReporter } = require('./benchmark-core');
  const { performance } = require('perf_hooks');

  console.log("\n" + "=".repeat(80));
  console.log("STARTING STREAMING BATCH BENCHMARK");
  console.log("=".repeat(80));

  const loopCount = config.LOOP !== null ? config.LOOP : 1;
  const totalTablets = loopCount * testData.devices.length;
  console.log(`\nTotal: ${loopCount} loops × ${testData.devices.length} devices = ${totalTablets} tablets`);
  console.log(`Data points per tablet: ${config.BATCH_SIZE_PER_WRITE} rows × ${config.SENSOR_NUMBER} sensors = ${config.BATCH_SIZE_PER_WRITE * config.SENSOR_NUMBER}`);

  const metrics = new MetricsCollector(config);
  const reporter = new ProgressReporter(config, metrics);

  // Warmup phase
  if (config.WARMUP_ROUNDS > 0) {
    console.log(`\n[Warmup Phase] Running ${config.WARMUP_ROUNDS} warmup rounds...`);
    for (let round = 0; round < config.WARMUP_ROUNDS; round++) {
      const warmupTablets = buildTabletsForLoop(testData, config, 0);
      const warmupMetrics = new MetricsCollector(config);
      warmupMetrics.start();

      // Pre-acquire sessions for warmup
      const warmupConcurrency = Math.min(config.CLIENT_NUMBER, 2);
      const warmupSessions = [];
      for (let i = 0; i < warmupConcurrency; i++) {
        warmupSessions.push(await pool.getSession());
      }

      try {
        let idx = 0;
        const workers = warmupSessions.map(async (session) => {
          while (idx < Math.min(10, warmupTablets.length)) {
            const i = idx++;
            if (i >= warmupTablets.length) break;
            try {
              await session.insertTablet(warmupTablets[i]);
            } catch (e) { /* ignore warmup errors */ }
          }
        });
        await Promise.all(workers);
      } finally {
        for (const session of warmupSessions) {
          pool.releaseSession(session);
        }
      }

      warmupMetrics.end();
      console.log(`  Warmup round ${round + 1}/${config.WARMUP_ROUNDS} completed`);
    }
  }

  // Pre-acquire sessions for main test
  const concurrency = Math.min(config.CLIENT_NUMBER, config.POOL_MAX_SIZE);
  const sessions = [];
  for (let i = 0; i < concurrency; i++) {
    sessions.push(await pool.getSession());
  }
  console.log(`\n[Test Phase] Pre-acquired ${sessions.length} sessions for ${concurrency} concurrent workers`);

  metrics.start();
  reporter.start();

  try {
    // Process loop by loop to avoid memory issues
    for (let loopIdx = 0; loopIdx < loopCount; loopIdx++) {
      // Build tablets for this loop only
      const tablets = buildTabletsForLoop(testData, config, loopIdx);

      // Insert tablets using pre-acquired sessions
      let tabletIndex = 0;
      const workers = sessions.map(async (session) => {
        while (tabletIndex < tablets.length) {
          const idx = tabletIndex++;
          if (idx >= tablets.length) break;

          const tablet = tablets[idx];
          const startTime = performance.now();

          try {
            await session.insertTablet(tablet);
            const latency = performance.now() - startTime;
            const dataPoints = tablet.timestamps.length * tablet.measurements.length;
            metrics.recordOperation(latency, dataPoints, true);
          } catch (error) {
            const latency = performance.now() - startTime;
            metrics.recordOperation(latency, 0, false, error);
          }
        }
      });

      await Promise.all(workers);

      // Reset tablet index for next loop
      // tablets array will be garbage collected
    }
  } finally {
    reporter.stop();
    metrics.end();

    // Release all sessions
    for (const session of sessions) {
      pool.releaseSession(session);
    }
    console.log(`[Test Phase] Released ${sessions.length} sessions`);
  }

  // Print results
  metrics.printStats("Streaming Batch Benchmark Results");

  return metrics.getStats();
}

// Run benchmark
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { main };
