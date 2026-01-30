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
 * Table Model Benchmark
 * 
 * Performance benchmark for IoTDB table model (relational model).
 * Tests write operations using insertTablet API with pre-generated data.
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
 *   TOTAL_DATA_POINTS       - Total data points (default: 100000)
 *   REGENERATE_DATA         - Force regenerate data (default: false)
 */

const { TableSessionPool } = require('../dist');
const { createConfig, printConfig } = require('./config');
const { prepareTestData } = require('./data-generator');
const { createTableModelSchema, cleanupSchema } = require('./schema-manager');
const { runBenchmark } = require('./benchmark-core');

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
 * Generate workload for table model (loop-based)
 * @param {Object} testData - Test data structure
 * @param {Object} config - Configuration object
 * @returns {Array} Workload array
 */
function generateWorkload(testData, config) {
  const workload = [];
  
  if (config.LOOP !== null) {
    // Loop-based execution: each loop writes one batch for all devices
    for (let loopIdx = 0; loopIdx < config.LOOP; loopIdx++) {
      for (const device of testData.devices) {
        // Each device has one batch in LOOP mode
        const batch = device.batches[0];
        workload.push({
          deviceId: device.deviceId,
          measurements: device.measurements,
          dataTypes: device.dataTypes,
          timestamps: batch.timestamps,
          values: batch.values,
          tableName: config.TABLE_NAME,
          loopIndex: loopIdx,
        });
      }
    }
  } else {
    // Legacy mode: all batches for all devices
    for (const device of testData.devices) {
      for (const batch of device.batches) {
        workload.push({
          deviceId: device.deviceId,
          measurements: device.measurements,
          dataTypes: device.dataTypes,
          timestamps: batch.timestamps,
          values: batch.values,
          tableName: config.TABLE_NAME,
        });
      }
    }
  }
  
  return workload;
}

/**
 * Execute write operation for table model
 * @param {TableSessionPool} pool - Table session pool
 * @param {Object} work - Work item
 * @param {Object} session - Optional bound session for device-session binding
 * @returns {number} Number of data points written
 */
async function executeWrite(pool, work, session = null) {
  // Update timestamps to current time
  const now = Date.now();
  const updatedTimestamps = work.timestamps.map((offset) => now + offset);
  
  // Build column names, types, and categories for table model
  const columnNames = ['device_id', ...work.measurements];
  const columnTypes = [5, ...work.dataTypes]; // TEXT for device_id, then measurement types
  const columnCategories = [
    ColumnCategory.TAG,  // device_id is a TAG
    ...work.measurements.map(() => ColumnCategory.FIELD)
  ];
  
  // Build values array including device_id for each row
  const valuesWithDeviceId = work.values.map((row) => [
    work.deviceId,
    ...row
  ]);
  
  const tablet = {
    tableName: work.tableName || 'benchmark_table',
    columnNames: columnNames,
    columnTypes: columnTypes,
    columnCategories: columnCategories,
    timestamps: updatedTimestamps,
    values: valuesWithDeviceId,
  };
  
  // Use bound session if provided, otherwise use pool
  if (session) {
    await session.insertTablet(tablet);
  } else {
    await pool.insertTablet(tablet);
  }
  
  // Return number of data points written
  return work.timestamps.length * work.measurements.length;
}

/**
 * Main benchmark function
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                     IoTDB Table Model Benchmark                           ║');
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

    // Step 4: Run benchmark
    console.log('\nStep 4: Running benchmark...');
    const results = await runBenchmark(
      pool,
      testData,
      config,
      executeWrite,
      generateWorkload
    );

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

    // Optional: Cleanup schema (comment out if you want to keep the data)
    // console.log('\nCleaning up schema...');
    // await cleanupSchema(pool, 'table', config);
    // console.log('✓ Schema cleanup completed');

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

// Run benchmark
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { main };
