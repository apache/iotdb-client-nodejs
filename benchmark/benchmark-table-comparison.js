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
 * Table Model API Comparison Benchmark
 * 
 * Compares performance of different tablet insertion methods for table model:
 * 1. Sequential insertTablet - Baseline (one tablet at a time)
 * 2. insertTabletsParallel - Concurrent insertion with pool
 * 
 * Note: insertTablets (batch RPC) is for tree model only
 * 
 * Usage:
 *   node benchmark/benchmark-table-comparison.js
 * 
 * Environment Variables:
 *   IOTDB_HOST              - IoTDB host (default: localhost)
 *   IOTDB_PORT              - IoTDB port (default: 6667)
 *   TABLET_COUNT            - Number of tablets per test (default: 100)
 *   BATCH_SIZE              - Rows per tablet (default: 10)
 *   CONCURRENCY             - Parallel concurrency (default: 10)
 *   POOL_SIZE               - Session pool size (default: 10)
 */

const { TableSessionPool, ColumnCategory, TSDataType } = require('../dist');
const { performance } = require('perf_hooks');

// Configuration
const config = {
  IOTDB_HOST: process.env.IOTDB_HOST || 'localhost',
  IOTDB_PORT: parseInt(process.env.IOTDB_PORT || '6667'),
  IOTDB_USER: process.env.IOTDB_USER || 'root',
  IOTDB_PASSWORD: process.env.IOTDB_PASSWORD || 'root',
  TABLET_COUNT: parseInt(process.env.TABLET_COUNT || '100'),
  BATCH_SIZE: parseInt(process.env.BATCH_SIZE || '10'),
  CONCURRENCY: parseInt(process.env.CONCURRENCY || '10'),
  POOL_SIZE: parseInt(process.env.POOL_SIZE || '10'),
  DATABASE: 'benchmark_table_compare',
  TABLE_NAME: 'test_table',
};

/**
 * Generate test tablets for table model
 */
function generateTableTablets(count, batchSize, prefix) {
  const tablets = [];
  const baseTime = Date.now();
  
  for (let i = 0; i < count; i++) {
    const timestamps = [];
    const values = [];
    
    for (let j = 0; j < batchSize; j++) {
      timestamps.push(baseTime + i * 1000 + j * 10);
      // Values: device_id (TAG), sensor1, sensor2 (FIELD)
      values.push([`${prefix}_device${i}`, Math.random() * 100, Math.random() * 100]);
    }
    
    tablets.push({
      tableName: config.TABLE_NAME,
      columnNames: ['device_id', 'sensor1', 'sensor2'],
      columnTypes: [TSDataType.STRING, TSDataType.FLOAT, TSDataType.FLOAT],
      columnCategories: [
        ColumnCategory.TAG,    // device_id
        ColumnCategory.FIELD,  // sensor1
        ColumnCategory.FIELD,  // sensor2
      ],
      timestamps,
      values,
    });
  }
  
  return tablets;
}

/**
 * Run a single benchmark
 */
async function runBenchmark(name, tablets, executor) {
  console.log(`\n  Running ${name}...`);
  
  const startTime = performance.now();
  await executor(tablets);
  const endTime = performance.now();
  
  const duration = endTime - startTime;
  const throughput = tablets.length * 1000 / duration;
  // Points = tablets * rows * measurements (2 measurements: sensor1, sensor2)
  const pointsPerSec = tablets.length * tablets[0].timestamps.length * 2 * 1000 / duration;
  
  return {
    name,
    tabletCount: tablets.length,
    duration: duration.toFixed(2),
    throughput: throughput.toFixed(2),
    pointsPerSec: pointsPerSec.toFixed(2),
  };
}

/**
 * Main benchmark function
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║              IoTDB Table Model API Comparison Benchmark                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log();
  console.log('Configuration:');
  console.log(`  IoTDB Host:     ${config.IOTDB_HOST}:${config.IOTDB_PORT}`);
  console.log(`  Tablet Count:   ${config.TABLET_COUNT}`);
  console.log(`  Batch Size:     ${config.BATCH_SIZE} rows per tablet`);
  console.log(`  Concurrency:    ${config.CONCURRENCY}`);
  console.log(`  Pool Size:      ${config.POOL_SIZE}`);
  console.log(`  Database:       ${config.DATABASE}`);
  console.log(`  Table:          ${config.TABLE_NAME}`);
  console.log();

  // Create pool
  const pool = new TableSessionPool(config.IOTDB_HOST, config.IOTDB_PORT, {
    username: config.IOTDB_USER,
    password: config.IOTDB_PASSWORD,
    database: config.DATABASE,
    maxPoolSize: config.POOL_SIZE,
    minPoolSize: Math.min(5, config.POOL_SIZE),
  });

  const results = [];

  try {
    console.log('Initializing table session pool...');
    await pool.init();
    console.log(`Pool initialized with ${pool.getPoolSize()} connections`);

    // Setup database and table
    console.log('\nSetting up database and table...');
    try {
      await pool.executeNonQueryStatement(`CREATE DATABASE IF NOT EXISTS ${config.DATABASE}`);
    } catch (e) {
      // Ignore if exists
    }
    
    await pool.executeNonQueryStatement(`USE ${config.DATABASE}`);
    
    try {
      await pool.executeNonQueryStatement(
        `CREATE TABLE IF NOT EXISTS ${config.TABLE_NAME}(` +
        `device_id STRING TAG, ` +
        `sensor1 FLOAT FIELD, ` +
        `sensor2 FLOAT FIELD)`
      );
    } catch (e) {
      // Ignore if exists
    }

    // ============================================================
    // Test 1: Sequential insertTablet (baseline)
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log('Test 1: Sequential insertTablet (Baseline)');
    console.log('='.repeat(60));
    
    const tablets1 = generateTableTablets(config.TABLET_COUNT, config.BATCH_SIZE, 'seq');
    const result1 = await runBenchmark(
      'Sequential insertTablet',
      tablets1,
      async (tablets) => {
        for (const tablet of tablets) {
          await pool.insertTablet(tablet);
        }
      }
    );
    results.push(result1);

    // ============================================================
    // Test 2: insertTabletsParallel (concurrent with pool)
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log(`Test 2: insertTabletsParallel (Concurrency: ${config.CONCURRENCY})`);
    console.log('='.repeat(60));
    
    const tablets2 = generateTableTablets(config.TABLET_COUNT, config.BATCH_SIZE, 'parallel');
    const result2 = await runBenchmark(
      `insertTabletsParallel (c=${config.CONCURRENCY})`,
      tablets2,
      async (tablets) => {
        await pool.insertTabletsParallel(tablets, { concurrency: config.CONCURRENCY });
      }
    );
    results.push(result2);

    // ============================================================
    // Test 3: executeParallel (generic parallel)
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log(`Test 3: executeParallel (Concurrency: ${config.CONCURRENCY})`);
    console.log('='.repeat(60));
    
    const tablets3 = generateTableTablets(config.TABLET_COUNT, config.BATCH_SIZE, 'exec');
    const result3 = await runBenchmark(
      `executeParallel (c=${config.CONCURRENCY})`,
      tablets3,
      async (tablets) => {
        await pool.executeParallel(
          tablets,
          async (session, tablet) => {
            await session.insertTablet(tablet);
            return 1;
          },
          { concurrency: config.CONCURRENCY }
        );
      }
    );
    results.push(result3);

    // ============================================================
    // Summary
    // ============================================================
    console.log('\n' + '='.repeat(80));
    console.log('TABLE MODEL BENCHMARK COMPARISON SUMMARY');
    console.log('='.repeat(80));
    console.log();
    console.log('┌─────────────────────────────────────────────┬────────────┬────────────────┬──────────────────┐');
    console.log('│ Method                                      │ Duration   │ Tablets/sec    │ Points/sec       │');
    console.log('├─────────────────────────────────────────────┼────────────┼────────────────┼──────────────────┤');
    
    for (const r of results) {
      console.log(
        `│ ${r.name.padEnd(43)} │ ${r.duration.padStart(8)}ms │ ${r.throughput.padStart(14)} │ ${r.pointsPerSec.padStart(16)} │`
      );
    }
    
    console.log('└─────────────────────────────────────────────┴────────────┴────────────────┴──────────────────┘');
    
    // Calculate and display speedups
    console.log('\nSpeedup Analysis:');
    const baselineThroughput = parseFloat(results[0].throughput);
    for (let i = 1; i < results.length; i++) {
      const speedup = parseFloat(results[i].throughput) / baselineThroughput;
      console.log(`  ${results[i].name}: ${speedup.toFixed(2)}x faster than baseline`);
    }

    // Cleanup
    console.log('\nCleaning up...');
    try {
      await pool.executeNonQueryStatement(`DROP DATABASE ${config.DATABASE}`);
    } catch (e) {
      // Ignore cleanup errors
    }

  } catch (error) {
    console.error('\nBenchmark failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    console.log('\nClosing pool...');
    await pool.close();
    console.log('Done');
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
