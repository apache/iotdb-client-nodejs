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
 * API Comparison Benchmark
 * 
 * Compares performance of different tablet insertion methods:
 * 1. Sequential insertTablet - Baseline (one tablet at a time)
 * 2. insertTablets - Batch insert (single RPC for multiple tablets)
 * 3. insertTabletsParallel - Concurrent insertion with pool
 * 
 * Usage:
 *   node benchmark/benchmark-comparison.js
 * 
 * Environment Variables:
 *   IOTDB_HOST              - IoTDB host (default: localhost)
 *   IOTDB_PORT              - IoTDB port (default: 6667)
 *   TABLET_COUNT            - Number of tablets per test (default: 100)
 *   BATCH_SIZE              - Rows per tablet (default: 10)
 *   CONCURRENCY             - Parallel concurrency (default: 10)
 *   POOL_SIZE               - Session pool size (default: 10)
 */

const { SessionPool } = require('../dist');
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
};

/**
 * Generate test tablets
 */
function generateTablets(count, batchSize, prefix) {
  const tablets = [];
  const baseTime = Date.now();
  
  for (let i = 0; i < count; i++) {
    const timestamps = [];
    const values = [];
    
    for (let j = 0; j < batchSize; j++) {
      timestamps.push(baseTime + i * 1000 + j * 10);
      values.push([Math.random() * 100, Math.random() * 100]);
    }
    
    tablets.push({
      deviceId: `root.benchmark_compare.${prefix}_device${i}`,
      measurements: ['sensor1', 'sensor2'],
      dataTypes: [3, 3], // FLOAT
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
  const pointsPerSec = tablets.length * tablets[0].timestamps.length * tablets[0].measurements.length * 1000 / duration;
  
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
  console.log('║                   IoTDB API Comparison Benchmark                           ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log();
  console.log('Configuration:');
  console.log(`  IoTDB Host:     ${config.IOTDB_HOST}:${config.IOTDB_PORT}`);
  console.log(`  Tablet Count:   ${config.TABLET_COUNT}`);
  console.log(`  Batch Size:     ${config.BATCH_SIZE} rows per tablet`);
  console.log(`  Concurrency:    ${config.CONCURRENCY}`);
  console.log(`  Pool Size:      ${config.POOL_SIZE}`);
  console.log();

  // Create pool
  const pool = new SessionPool(config.IOTDB_HOST, config.IOTDB_PORT, {
    username: config.IOTDB_USER,
    password: config.IOTDB_PASSWORD,
    maxPoolSize: config.POOL_SIZE,
    minPoolSize: Math.min(5, config.POOL_SIZE),
  });

  const results = [];

  try {
    console.log('Initializing session pool...');
    await pool.init();
    console.log(`Pool initialized with ${pool.getPoolSize()} connections`);

    // Setup database
    console.log('\nSetting up database...');
    try {
      await pool.executeNonQueryStatement('CREATE DATABASE root.benchmark_compare');
    } catch (e) {
      // Ignore if exists
    }

    // ============================================================
    // Test 1: Sequential insertTablet (baseline)
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log('Test 1: Sequential insertTablet (Baseline)');
    console.log('='.repeat(60));
    
    const tablets1 = generateTablets(config.TABLET_COUNT, config.BATCH_SIZE, 'seq');
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
    // Test 2: insertTablets (batch RPC) - requires session.insertTablets
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log('Test 2: insertTablets (Single RPC for all tablets)');
    console.log('='.repeat(60));
    
    const tablets2 = generateTablets(config.TABLET_COUNT, config.BATCH_SIZE, 'batch');
    const result2 = await runBenchmark(
      'insertTablets (batch RPC)',
      tablets2,
      async (tablets) => {
        const session = await pool.getSession();
        try {
          await session.insertTablets(tablets);
        } finally {
          pool.releaseSession(session);
        }
      }
    );
    results.push(result2);

    // ============================================================
    // Test 3: insertTabletsParallel (concurrent with pool)
    // ============================================================
    console.log('\n' + '='.repeat(60));
    console.log(`Test 3: insertTabletsParallel (Concurrency: ${config.CONCURRENCY})`);
    console.log('='.repeat(60));
    
    const tablets3 = generateTablets(config.TABLET_COUNT, config.BATCH_SIZE, 'parallel');
    const result3 = await runBenchmark(
      `insertTabletsParallel (c=${config.CONCURRENCY})`,
      tablets3,
      async (tablets) => {
        await pool.insertTabletsParallel(tablets, { concurrency: config.CONCURRENCY });
      }
    );
    results.push(result3);

    // ============================================================
    // Summary
    // ============================================================
    console.log('\n' + '='.repeat(80));
    console.log('BENCHMARK COMPARISON SUMMARY');
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
      await pool.executeNonQueryStatement('DROP DATABASE root.benchmark_compare');
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
