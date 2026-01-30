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
 * Benchmark Core Engine
 * 
 * Core benchmark engine for managing test execution, client pools,
 * and performance metrics collection. Supports concurrent operations
 * with detailed latency and throughput tracking.
 */

const { performance } = require('perf_hooks');

/**
 * Performance metrics collector
 */
class MetricsCollector {
  constructor(config) {
    this.config = config;
    this.reset();
  }

  reset() {
    this.operations = [];
    this.errors = [];
    this.startTime = null;
    this.endTime = null;
    this.operationCount = 0;
    this.successCount = 0;
    this.failureCount = 0;
    this.totalDataPoints = 0;
  }

  start() {
    this.startTime = performance.now();
  }

  recordOperation(latencyMs, dataPoints, success = true, error = null) {
    this.operationCount++;
    this.operations.push(latencyMs);
    
    if (success) {
      this.successCount++;
      this.totalDataPoints += dataPoints;
    } else {
      this.failureCount++;
      if (error) {
        this.errors.push(error);
      }
    }
  }

  end() {
    this.endTime = performance.now();
  }

  getDuration() {
    return this.endTime - this.startTime;
  }

  /**
   * Calculate percentile
   * @param {number} percentile - Percentile (0-100)
   * @returns {number} Percentile value
   */
  getPercentile(percentile) {
    if (this.operations.length === 0) return 0;
    
    const sorted = [...this.operations].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get comprehensive statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const durationMs = this.getDuration();
    const durationSec = durationMs / 1000;

    const stats = {
      // Time
      duration_ms: durationMs.toFixed(2),
      duration_sec: durationSec.toFixed(2),
      
      // Operations
      total_operations: this.operationCount,
      successful_operations: this.successCount,
      failed_operations: this.failureCount,
      success_rate: ((this.successCount / this.operationCount) * 100).toFixed(2) + '%',
      
      // Data points
      total_data_points: this.totalDataPoints,
      
      // Throughput
      operations_per_sec: (this.operationCount / durationSec).toFixed(2),
      points_per_sec: (this.totalDataPoints / durationSec).toFixed(2),
      
      // Latency (ms)
      latency: {
        min: this.operations.length > 0 ? Math.min(...this.operations).toFixed(2) : 0,
        max: this.operations.length > 0 ? Math.max(...this.operations).toFixed(2) : 0,
        avg: this.operations.length > 0 
          ? (this.operations.reduce((a, b) => a + b, 0) / this.operations.length).toFixed(2) 
          : 0,
      },
    };

    // Add percentiles if enabled
    if (this.config.ENABLE_DETAILED_METRICS && this.operations.length > 0) {
      stats.latency.p50 = this.getPercentile(50).toFixed(2);
      stats.latency.p90 = this.getPercentile(90).toFixed(2);
      stats.latency.p95 = this.getPercentile(95).toFixed(2);
      stats.latency.p99 = this.getPercentile(99).toFixed(2);
    }

    return stats;
  }

  /**
   * Print statistics summary
   */
  printStats(label = 'Benchmark Results') {
    const stats = this.getStats();
    
    console.log('\n' + '='.repeat(80));
    console.log(label.toUpperCase());
    console.log('='.repeat(80));
    
    console.log('\n[Execution Time]');
    console.log(`  Duration:              ${stats.duration_sec}s (${stats.duration_ms}ms)`);
    
    console.log('\n[Operations]');
    console.log(`  Total Operations:      ${stats.total_operations}`);
    console.log(`  Successful:            ${stats.successful_operations}`);
    console.log(`  Failed:                ${stats.failed_operations}`);
    console.log(`  Success Rate:          ${stats.success_rate}`);
    
    console.log('\n[Data Points]');
    console.log(`  Total Points Written:  ${stats.total_data_points.toLocaleString()}`);
    
    console.log('\n[Throughput]');
    console.log(`  Operations/sec:        ${stats.operations_per_sec}`);
    console.log(`  Points/sec:            ${parseFloat(stats.points_per_sec).toLocaleString()}`);
    
    console.log('\n[Latency (ms)]');
    console.log(`  Min:                   ${stats.latency.min}ms`);
    console.log(`  Max:                   ${stats.latency.max}ms`);
    console.log(`  Average:               ${stats.latency.avg}ms`);
    
    if (this.config.ENABLE_DETAILED_METRICS && stats.latency.p50) {
      console.log(`  P50 (Median):          ${stats.latency.p50}ms`);
      console.log(`  P90:                   ${stats.latency.p90}ms`);
      console.log(`  P95:                   ${stats.latency.p95}ms`);
      console.log(`  P99:                   ${stats.latency.p99}ms`);
    }
    
    if (this.failureCount > 0 && this.errors.length > 0) {
      console.log('\n[Error Samples]');
      const sampleErrors = this.errors.slice(0, 5);
      sampleErrors.forEach((err, idx) => {
        console.log(`  ${idx + 1}. ${err.message || err}`);
      });
      if (this.errors.length > 5) {
        console.log(`  ... and ${this.errors.length - 5} more errors`);
      }
    }
    
    console.log('\n' + '='.repeat(80));
  }
}

/**
 * Progress reporter for long-running tests
 */
class ProgressReporter {
  constructor(config, metricsCollector) {
    this.config = config;
    this.metrics = metricsCollector;
    this.lastReportTime = performance.now();
    this.lastOperationCount = 0;
    this.intervalId = null;
  }

  start() {
    if (this.config.REPORT_INTERVAL > 0) {
      this.intervalId = setInterval(() => {
        this.report();
      }, this.config.REPORT_INTERVAL);
    }
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  report() {
    const now = performance.now();
    const elapsed = now - this.lastReportTime;
    const operations = this.metrics.operationCount - this.lastOperationCount;
    const opsPerSec = (operations / elapsed) * 1000;
    const totalPoints = this.metrics.totalDataPoints;
    
    console.log(
      `[Progress] Operations: ${this.metrics.operationCount}, ` +
      `Rate: ${opsPerSec.toFixed(2)} ops/s, ` +
      `Total Points: ${totalPoints.toLocaleString()}`
    );
    
    this.lastReportTime = now;
    this.lastOperationCount = this.metrics.operationCount;
  }
}

/**
 * Execute write operations concurrently with device-session binding
 * @param {Object} pool - IoTDB session pool
 * @param {Array} workload - Array of work items (should be ordered by device)
 * @param {number} poolSize - Session pool size
 * @param {MetricsCollector} metrics - Metrics collector
 * @param {Function} executor - Async function to execute each work item (pool, work, session)
 */
async function executeConcurrentWithBinding(pool, workload, poolSize, metrics, executor) {
  // Get sessions from pool and bind to devices
  const sessions = [];
  for (let i = 0; i < poolSize; i++) {
    sessions.push(await pool.getSession());
  }
  
  console.log(`[Device-Session Binding] Bound ${sessions.length} sessions to devices`);
  
  try {
    const workers = [];

    // Each worker handles workload items for devices bound to its session
    // Workload is pre-ordered, so we can partition it evenly
    const workPerSession = Math.ceil(workload.length / poolSize);
    
    const worker = async (sessionIdx) => {
      const session = sessions[sessionIdx];
      const startIdx = sessionIdx * workPerSession;
      const endIdx = Math.min(startIdx + workPerSession, workload.length);
      
      for (let i = startIdx; i < endIdx; i++) {
        const work = workload[i];
        const startTime = performance.now();
        
        try {
          const dataPoints = await executor(pool, work, session);
          const latency = performance.now() - startTime;
          metrics.recordOperation(latency, dataPoints, true);
        } catch (error) {
          const latency = performance.now() - startTime;
          metrics.recordOperation(latency, 0, false, error);
        }
      }
    };

    // Start workers, one per session
    for (let i = 0; i < poolSize; i++) {
      workers.push(worker(i));
    }

    // Wait for all workers to complete
    await Promise.all(workers);
  } finally {
    // Release all sessions back to pool
    for (const session of sessions) {
      pool.releaseSession(session);
    }
    console.log(`[Device-Session Binding] Released ${sessions.length} sessions`);
  }
}

/**
 * Execute write operations concurrently
 * @param {Object} pool - IoTDB session pool
 * @param {Array} workload - Array of work items
 * @param {number} concurrency - Number of concurrent workers
 * @param {MetricsCollector} metrics - Metrics collector
 * @param {Function} executor - Async function to execute each work item
 */
async function executeConcurrent(pool, workload, concurrency, metrics, executor) {
  let workIndex = 0;
  const workers = [];

  // Worker function
  const worker = async () => {
    while (workIndex < workload.length) {
      const index = workIndex++;
      if (index >= workload.length) break;
      
      const work = workload[index];
      const startTime = performance.now();
      
      try {
        const dataPoints = await executor(pool, work);
        const latency = performance.now() - startTime;
        metrics.recordOperation(latency, dataPoints, true);
      } catch (error) {
        const latency = performance.now() - startTime;
        metrics.recordOperation(latency, 0, false, error);
      }
    }
  };

  // Start workers
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }

  // Wait for all workers to complete
  await Promise.all(workers);
}

/**
 * Run benchmark test
 * @param {Object} pool - IoTDB session pool
 * @param {Object} testData - Test data
 * @param {Object} config - Configuration
 * @param {Function} executor - Async function to execute work items
 * @param {Function} workloadGenerator - Function to generate workload
 * @returns {Object} Test results
 */
async function runBenchmark(pool, testData, config, executor, workloadGenerator) {
  console.log('\n' + '='.repeat(80));
  console.log('STARTING BENCHMARK TEST');
  console.log('='.repeat(80));

  const metrics = new MetricsCollector(config);
  const reporter = new ProgressReporter(config, metrics);

  // Generate workload
  console.log('\nGenerating workload...');
  const workload = workloadGenerator(testData, config);
  console.log(`Workload generated: ${workload.length} operations`);

  // Warmup phase
  if (config.WARMUP_ROUNDS > 0) {
    console.log(`\n[Warmup Phase] Running ${config.WARMUP_ROUNDS} warmup rounds...`);
    for (let round = 0; round < config.WARMUP_ROUNDS; round++) {
      const warmupMetrics = new MetricsCollector(config);
      warmupMetrics.start();
      
      await executeConcurrent(
        pool, 
        workload.slice(0, Math.min(10, workload.length)), 
        Math.min(config.CLIENT_NUMBER, 2),
        warmupMetrics,
        executor
      );
      
      warmupMetrics.end();
      console.log(`  Warmup round ${round + 1}/${config.WARMUP_ROUNDS} completed`);
    }
  }

  // Main test phase
  if (config.ENABLE_DEVICE_SESSION_BINDING) {
    console.log(`\n[Test Phase] Running benchmark with device-session binding (${config.POOL_MAX_SIZE} sessions)...`);
  } else {
    console.log(`\n[Test Phase] Running benchmark with ${config.CLIENT_NUMBER} concurrent clients...`);
  }
  
  metrics.start();
  reporter.start();
  
  try {
    if (config.ENABLE_DEVICE_SESSION_BINDING) {
      await executeConcurrentWithBinding(
        pool,
        workload,
        config.POOL_MAX_SIZE,
        metrics,
        executor
      );
    } else {
      await executeConcurrent(
        pool,
        workload,
        config.CLIENT_NUMBER,
        metrics,
        executor
      );
    }
  } finally {
    reporter.stop();
    metrics.end();
  }

  // Print results
  metrics.printStats('Benchmark Results');

  return metrics.getStats();
}

module.exports = {
  MetricsCollector,
  ProgressReporter,
  executeConcurrent,
  executeConcurrentWithBinding,
  runBenchmark,
};
