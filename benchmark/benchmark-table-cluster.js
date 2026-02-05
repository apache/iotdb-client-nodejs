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
 * Multi-Process Table Model Benchmark (Cluster Mode)
 *
 * Uses Node.js cluster module to spawn multiple worker processes,
 * each running independent IoTDB connections for true parallel execution.
 * This overcomes Node.js single-threaded limitation.
 *
 * Usage:
 *   node benchmark-table-cluster.js
 *
 * Environment Variables:
 *   WORKER_COUNT            - Number of worker processes (default: CPU cores)
 *   IOTDB_HOST              - IoTDB host (default: localhost)
 *   IOTDB_PORT              - IoTDB port (default: 6667)
 *   CLIENT_NUMBER           - Concurrent clients per worker (default: 10)
 *   DEVICE_NUMBER           - Total devices (distributed across workers)
 *   SENSOR_NUMBER           - Sensors per device (default: 50)
 *   LOOP                    - Number of loops per worker
 *   BATCH_SIZE_PER_WRITE    - Batch size (default: 500)
 */

const cluster = require('cluster');
const os = require('os');
const { performance } = require('perf_hooks');

// Configuration
const WORKER_COUNT = parseInt(process.env.WORKER_COUNT || os.cpus().length);
const IOTDB_HOST = process.env.IOTDB_HOST || 'localhost';
const IOTDB_PORT = parseInt(process.env.IOTDB_PORT || '6667');
const IOTDB_USER = process.env.IOTDB_USER || 'root';
const IOTDB_PASSWORD = process.env.IOTDB_PASSWORD || 'root';
const CLIENT_NUMBER = parseInt(process.env.CLIENT_NUMBER || '10');
const TOTAL_DEVICE_NUMBER = parseInt(process.env.DEVICE_NUMBER || '1000');
const SENSOR_NUMBER = parseInt(process.env.SENSOR_NUMBER || '50');
const LOOP = parseInt(process.env.LOOP || '100');
const BATCH_SIZE_PER_WRITE = parseInt(process.env.BATCH_SIZE_PER_WRITE || '500');
const POINT_STEP = parseInt(process.env.POINT_STEP || '1000');
const WARMUP_ROUNDS = parseInt(process.env.WARMUP_ROUNDS || '2');
const POOL_MAX_SIZE = parseInt(process.env.POOL_MAX_SIZE || '10');
const DATABASE_NAME = 'benchmark_db';
const TABLE_NAME = 'benchmark_table';

// Data type distribution
const TSDataType = {
  BOOLEAN: 0,
  INT32: 1,
  INT64: 2,
  FLOAT: 3,
  DOUBLE: 4,
  TEXT: 5,
};

const INSERT_DATATYPE_PROPORTION = {
  [TSDataType.FLOAT]: 0.3,
  [TSDataType.DOUBLE]: 0.2,
  [TSDataType.INT32]: 0.2,
  [TSDataType.INT64]: 0.1,
  [TSDataType.TEXT]: 0.1,
  [TSDataType.BOOLEAN]: 0.1,
};

// Generate sensor types ONCE with fixed seed for consistency across all processes
// This ensures schema and data match
const SENSOR_TYPES = distributeSensorTypes(SENSOR_NUMBER, INSERT_DATATYPE_PROPORTION);

if (cluster.isPrimary) {
  // ============== PRIMARY PROCESS ==============
  runPrimary();
} else {
  // ============== WORKER PROCESS ==============
  runWorker();
}

async function runPrimary() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║      IoTDB Table Model Benchmark (Multi-Process Cluster Mode)             ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log();

  const devicesPerWorker = Math.ceil(TOTAL_DEVICE_NUMBER / WORKER_COUNT);
  const totalDataPoints = TOTAL_DEVICE_NUMBER * SENSOR_NUMBER * BATCH_SIZE_PER_WRITE * LOOP;

  console.log('================================================================================');
  console.log('BENCHMARK CONFIGURATION');
  console.log('================================================================================');
  console.log(`\n[Cluster Settings]`);
  console.log(`  Worker Processes:     ${WORKER_COUNT}`);
  console.log(`  CPU Cores Available:  ${os.cpus().length}`);
  console.log(`\n[Connection Settings]`);
  console.log(`  IoTDB Host:           ${IOTDB_HOST}`);
  console.log(`  IoTDB Port:           ${IOTDB_PORT}`);
  console.log(`\n[Test Parameters]`);
  console.log(`  Total Devices:        ${TOTAL_DEVICE_NUMBER}`);
  console.log(`  Devices per Worker:   ${devicesPerWorker}`);
  console.log(`  Sensors per Device:   ${SENSOR_NUMBER}`);
  console.log(`  Batch Size:           ${BATCH_SIZE_PER_WRITE}`);
  console.log(`  Loops per Worker:     ${LOOP}`);
  console.log(`  Clients per Worker:   ${CLIENT_NUMBER}`);
  console.log(`  Pool Size per Worker: ${POOL_MAX_SIZE}`);
  console.log(`  Total Data Points:    ${totalDataPoints.toLocaleString()}`);
  console.log(`  Warmup Rounds:        ${WARMUP_ROUNDS}`);
  console.log('================================================================================\n');

  // Step 1: Create schema (only primary does this)
  console.log('Step 1: Creating schema...');
  await createSchema();
  console.log('✓ Schema created\n');

  // Step 2: Fork workers
  console.log(`Step 2: Spawning ${WORKER_COUNT} worker processes...`);

  const workerResults = [];
  let completedWorkers = 0;
  const startTime = performance.now();

  for (let i = 0; i < WORKER_COUNT; i++) {
    const startDevice = i * devicesPerWorker;
    const endDevice = Math.min((i + 1) * devicesPerWorker, TOTAL_DEVICE_NUMBER);
    const deviceCount = endDevice - startDevice;

    if (deviceCount <= 0) continue;

    const worker = cluster.fork({
      WORKER_ID: i,
      START_DEVICE: startDevice,
      END_DEVICE: endDevice,
      DEVICE_COUNT: deviceCount,
    });

    worker.on('message', (msg) => {
      if (msg.type === 'result') {
        workerResults.push(msg.data);
        completedWorkers++;
        console.log(`  Worker ${msg.data.workerId} completed: ${msg.data.operations} ops, ${msg.data.dataPoints.toLocaleString()} points`);

        if (completedWorkers === WORKER_COUNT) {
          const endTime = performance.now();
          printFinalResults(workerResults, endTime - startTime);
          process.exit(0);
        }
      } else if (msg.type === 'progress') {
        // Progress updates from workers
      } else if (msg.type === 'ready') {
        console.log(`  Worker ${msg.workerId} ready with ${msg.deviceCount} devices`);
      }
    });

    worker.on('error', (err) => {
      console.error(`Worker ${i} error:`, err);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker ${i} exited with code ${code}`);
      }
    });
  }

  console.log(`✓ All workers spawned\n`);
  console.log('Step 3: Running benchmark...\n');
}

async function createSchema() {
  const { TableSessionPool, ColumnCategory } = require('../dist');

  const pool = new TableSessionPool(IOTDB_HOST, IOTDB_PORT, {
    username: IOTDB_USER,
    password: IOTDB_PASSWORD,
    database: DATABASE_NAME,
    maxPoolSize: 2,
    minPoolSize: 1,
  });

  try {
    await pool.init();

    // Drop existing database
    try {
      await pool.executeNonQueryStatement(`DROP DATABASE ${DATABASE_NAME}`);
    } catch (e) {
      // Ignore if not exists
    }

    // Create database
    await pool.executeNonQueryStatement(`CREATE DATABASE ${DATABASE_NAME}`);
    await pool.executeNonQueryStatement(`USE ${DATABASE_NAME}`);

    // Generate sensor types
    const sensorTypes = distributeSensorTypes(SENSOR_NUMBER, INSERT_DATATYPE_PROPORTION);

    // Build CREATE TABLE SQL
    const typeMap = {
      [TSDataType.BOOLEAN]: 'BOOLEAN',
      [TSDataType.INT32]: 'INT32',
      [TSDataType.INT64]: 'INT64',
      [TSDataType.FLOAT]: 'FLOAT',
      [TSDataType.DOUBLE]: 'DOUBLE',
      [TSDataType.TEXT]: 'TEXT',
    };

    const columns = ['device_id STRING TAG'];
    for (let i = 0; i < SENSOR_NUMBER; i++) {
      columns.push(`sensor_${i} ${typeMap[sensorTypes[i]]} FIELD`);
    }

    const sql = `CREATE TABLE ${TABLE_NAME} (${columns.join(', ')})`;
    await pool.executeNonQueryStatement(sql);

  } finally {
    await pool.close();
  }
}

async function runWorker() {
  const workerId = parseInt(process.env.WORKER_ID);
  const startDevice = parseInt(process.env.START_DEVICE);
  const endDevice = parseInt(process.env.END_DEVICE);
  const deviceCount = parseInt(process.env.DEVICE_COUNT);

  const { TableSessionPool, ColumnCategory } = require('../dist');

  // Notify primary we're ready
  process.send({ type: 'ready', workerId, deviceCount });

  // Create pool for this worker
  const pool = new TableSessionPool(IOTDB_HOST, IOTDB_PORT, {
    username: IOTDB_USER,
    password: IOTDB_PASSWORD,
    database: DATABASE_NAME,
    maxPoolSize: POOL_MAX_SIZE,
    minPoolSize: Math.min(5, POOL_MAX_SIZE),
  });

  try {
    await pool.init();

    // Generate test data for this worker's devices
    const sensorTypes = distributeSensorTypes(SENSOR_NUMBER, INSERT_DATATYPE_PROPORTION);
    const devices = [];

    for (let i = startDevice; i < endDevice; i++) {
      const measurements = [];
      const dataTypes = [];
      for (let j = 0; j < SENSOR_NUMBER; j++) {
        measurements.push(`sensor_${j}`);
        dataTypes.push(sensorTypes[j]);
      }
      devices.push({
        deviceId: `device_${i}`,
        measurements,
        dataTypes,
      });
    }

    // Generate shared batch template
    const sharedBatch = generateBatch(BATCH_SIZE_PER_WRITE, SENSOR_NUMBER, sensorTypes, POINT_STEP);

    // Warmup
    if (WARMUP_ROUNDS > 0) {
      for (let round = 0; round < WARMUP_ROUNDS; round++) {
        const warmupTablets = buildTabletsForLoop(devices.slice(0, Math.min(5, devices.length)), sharedBatch, 0, ColumnCategory);
        const sessions = [];
        for (let i = 0; i < Math.min(2, POOL_MAX_SIZE); i++) {
          sessions.push(await pool.getSession());
        }
        try {
          let idx = 0;
          await Promise.all(sessions.map(async (session) => {
            while (idx < warmupTablets.length) {
              const i = idx++;
              if (i >= warmupTablets.length) break;
              try {
                await session.insertTablet(warmupTablets[i]);
              } catch (e) { /* ignore */ }
            }
          }));
        } finally {
          for (const session of sessions) {
            pool.releaseSession(session);
          }
        }
      }
    }

    // Pre-acquire sessions
    const sessions = [];
    for (let i = 0; i < Math.min(CLIENT_NUMBER, POOL_MAX_SIZE); i++) {
      sessions.push(await pool.getSession());
    }

    // Run benchmark
    let totalOperations = 0;
    let totalDataPoints = 0;
    let totalLatency = 0;
    const startTime = performance.now();

    for (let loopIdx = 0; loopIdx < LOOP; loopIdx++) {
      const tablets = buildTabletsForLoop(devices, sharedBatch, loopIdx, ColumnCategory);

      let tabletIndex = 0;
      const loopStartTime = performance.now();

      await Promise.all(sessions.map(async (session) => {
        while (tabletIndex < tablets.length) {
          const idx = tabletIndex++;
          if (idx >= tablets.length) break;

          const tablet = tablets[idx];
          const opStart = performance.now();

          try {
            await session.insertTablet(tablet);
            const latency = performance.now() - opStart;
            totalLatency += latency;
            totalOperations++;
            totalDataPoints += tablet.timestamps.length * (tablet.columnNames.length - 1); // -1 for device_id
          } catch (error) {
            // Count as failed but continue
          }
        }
      }));

      // Reset for next loop
      tabletIndex = 0;
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    // Release sessions
    for (const session of sessions) {
      pool.releaseSession(session);
    }

    // Send results to primary
    process.send({
      type: 'result',
      data: {
        workerId,
        operations: totalOperations,
        dataPoints: totalDataPoints,
        duration,
        avgLatency: totalLatency / totalOperations,
        throughput: totalDataPoints / (duration / 1000),
      },
    });

  } catch (error) {
    console.error(`Worker ${workerId} error:`, error);
    process.exit(1);
  } finally {
    await pool.close();
    process.exit(0);
  }
}

function buildTabletsForLoop(devices, sharedBatch, loopIdx, ColumnCategory) {
  const tablets = [];
  const baseTimestamp = Date.now() + loopIdx * BATCH_SIZE_PER_WRITE * POINT_STEP;

  for (const device of devices) {
    const updatedTimestamps = sharedBatch.timestamps.map((offset) => baseTimestamp + offset);

    const columnNames = ['device_id', ...device.measurements];
    const columnTypes = [11, ...device.dataTypes]; // STRING (11) for device_id
    const columnCategories = [
      ColumnCategory.TAG,
      ...device.measurements.map(() => ColumnCategory.FIELD)
    ];

    const valuesWithDeviceId = sharedBatch.values.map((row) => [
      device.deviceId,
      ...row
    ]);

    tablets.push({
      tableName: TABLE_NAME,
      columnNames,
      columnTypes,
      columnCategories,
      timestamps: updatedTimestamps,
      values: valuesWithDeviceId,
    });
  }

  return tablets;
}

function generateBatch(batchSize, sensorNumber, sensorTypes, pointStep) {
  const timestamps = [];
  const values = [];

  for (let rowIdx = 0; rowIdx < batchSize; rowIdx++) {
    timestamps.push(rowIdx * pointStep);
    const row = [];
    for (let sensorIdx = 0; sensorIdx < sensorNumber; sensorIdx++) {
      row.push(generateValue(sensorTypes[sensorIdx]));
    }
    values.push(row);
  }

  return { timestamps, values };
}

function generateValue(dataType) {
  switch (dataType) {
    case TSDataType.BOOLEAN:
      return Math.random() > 0.5;
    case TSDataType.INT32:
      return Math.floor(Math.random() * 2147483647);
    case TSDataType.INT64:
      return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString();
    case TSDataType.FLOAT:
      return parseFloat((Math.random() * 1000).toFixed(2));
    case TSDataType.DOUBLE:
      return Math.random() * 10000;
    case TSDataType.TEXT:
      return generateRandomString(16);
    default:
      return 0;
  }
}

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function distributeSensorTypes(totalSensors, proportions) {
  const types = [];
  const sortedTypes = Object.entries(proportions).sort((a, b) => b[1] - a[1]);

  let remaining = totalSensors;
  for (let i = 0; i < sortedTypes.length; i++) {
    const [typeStr, proportion] = sortedTypes[i];
    const type = parseInt(typeStr);
    const count = i === sortedTypes.length - 1 ? remaining : Math.floor(totalSensors * proportion);

    for (let j = 0; j < count; j++) {
      types.push(type);
    }
    remaining -= count;
  }

  // Use deterministic interleaving instead of random shuffle
  // This ensures all processes generate the same type distribution
  const result = new Array(totalSensors);
  const typeGroups = {};

  // Group indices by type
  let idx = 0;
  for (const type of types) {
    if (!typeGroups[type]) typeGroups[type] = [];
    typeGroups[type].push(idx++);
  }

  // Interleave types deterministically
  const groupKeys = Object.keys(typeGroups).sort((a, b) => parseInt(a) - parseInt(b));
  let resultIdx = 0;
  let maxLen = Math.max(...groupKeys.map(k => typeGroups[k].length));

  for (let i = 0; i < maxLen; i++) {
    for (const key of groupKeys) {
      if (i < typeGroups[key].length) {
        result[resultIdx++] = parseInt(key);
      }
    }
  }

  return result;
}

function printFinalResults(workerResults, totalDuration) {
  console.log('\n' + '='.repeat(80));
  console.log('CLUSTER BENCHMARK RESULTS');
  console.log('='.repeat(80));

  const totalOperations = workerResults.reduce((sum, r) => sum + r.operations, 0);
  const totalDataPoints = workerResults.reduce((sum, r) => sum + r.dataPoints, 0);
  const avgLatency = workerResults.reduce((sum, r) => sum + r.avgLatency, 0) / workerResults.length;
  const combinedThroughput = workerResults.reduce((sum, r) => sum + r.throughput, 0);
  const actualThroughput = totalDataPoints / (totalDuration / 1000);

  console.log(`\n[Per-Worker Results]`);
  workerResults.sort((a, b) => a.workerId - b.workerId);
  for (const r of workerResults) {
    console.log(`  Worker ${r.workerId}: ${r.operations} ops, ${(r.throughput / 1000000).toFixed(2)}M pts/s, avg latency: ${r.avgLatency.toFixed(2)}ms`);
  }

  console.log(`\n[Aggregated Results]`);
  console.log(`  Total Workers:         ${workerResults.length}`);
  console.log(`  Total Operations:      ${totalOperations.toLocaleString()}`);
  console.log(`  Total Data Points:     ${totalDataPoints.toLocaleString()}`);
  console.log(`  Total Duration:        ${(totalDuration / 1000).toFixed(2)}s`);
  console.log(`  Average Latency:       ${avgLatency.toFixed(2)}ms`);

  console.log(`\n[Throughput]`);
  console.log(`  Combined (sum):        ${(combinedThroughput / 1000000).toFixed(2)} M points/sec`);
  console.log(`  Actual (wall clock):   ${(actualThroughput / 1000000).toFixed(2)} M points/sec`);

  console.log('\n' + '='.repeat(80));
  console.log('BENCHMARK COMPLETED');
  console.log('='.repeat(80));
}
