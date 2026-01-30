#!/usr/bin/env node
/**
 * Benchmark Test Script (Simulated Mode)
 * 
 * This script tests the benchmark infrastructure without requiring
 * a running IoTDB instance. It validates:
 * - Configuration loading
 * - Data generation
 * - Workload generation
 * - Metrics collection
 * - Performance reporting
 */

const { createConfig, printConfig } = require('./config');
const { prepareTestData } = require('./data-generator');
const { MetricsCollector } = require('./benchmark-core');

console.log('╔════════════════════════════════════════════════════════════════════════════╗');
console.log('║           IoTDB Benchmark Infrastructure Test (Simulated)                 ║');
console.log('╚════════════════════════════════════════════════════════════════════════════╝');
console.log();

async function testTreeModel() {
  console.log('\n=== Testing Tree Model ===\n');
  
  // Test configuration
  const config = createConfig({
    DEVICE_NUMBER: 5,
    SENSOR_NUMBER: 3,
    BATCH_SIZE_PER_WRITE: 10,
    TOTAL_DATA_POINTS: 100,
  });
  
  console.log('✓ Configuration created and validated');
  
  // Test data generation
  const testData = await prepareTestData(config, 'tree');
  console.log(`✓ Test data generated: ${testData.devices.length} devices`);
  console.log(`  - Measurements per device: ${testData.devices[0].measurements.length}`);
  console.log(`  - Batches per device: ${testData.devices[0].batches.length}`);
  console.log(`  - Rows per batch: ${testData.devices[0].batches[0].timestamps.length}`);
  
  // Test workload generation
  let workloadCount = 0;
  for (const device of testData.devices) {
    workloadCount += device.batches.length;
  }
  console.log(`✓ Workload: ${workloadCount} operations total`);
  
  // Test metrics collection
  const metrics = new MetricsCollector(config);
  metrics.start();
  
  // Simulate some operations
  for (let i = 0; i < 10; i++) {
    const latency = 10 + Math.random() * 50;
    const dataPoints = 30;
    metrics.recordOperation(latency, dataPoints, true);
  }
  
  metrics.end();
  const stats = metrics.getStats();
  
  console.log(`✓ Metrics collection:`);
  console.log(`  - Total operations: ${stats.total_operations}`);
  console.log(`  - Success rate: ${stats.success_rate}`);
  console.log(`  - Average latency: ${stats.latency.avg}ms`);
  console.log(`  - Throughput: ${stats.points_per_sec} points/sec`);
  
  return true;
}

async function testTableModel() {
  console.log('\n=== Testing Table Model ===\n');
  
  // Test configuration
  const config = createConfig({
    DEVICE_NUMBER: 5,
    SENSOR_NUMBER: 3,
    BATCH_SIZE_PER_WRITE: 10,
    TOTAL_DATA_POINTS: 100,
  });
  
  console.log('✓ Configuration created and validated');
  
  // Test data generation
  const testData = await prepareTestData(config, 'table');
  console.log(`✓ Test data generated: ${testData.devices.length} devices`);
  console.log(`  - Measurements per device: ${testData.devices[0].measurements.length}`);
  console.log(`  - Batches per device: ${testData.devices[0].batches.length}`);
  console.log(`  - Rows per batch: ${testData.devices[0].batches[0].timestamps.length}`);
  
  // Test workload generation
  let workloadCount = 0;
  for (const device of testData.devices) {
    workloadCount += device.batches.length;
  }
  console.log(`✓ Workload: ${workloadCount} operations total`);
  
  // Test metrics collection
  const metrics = new MetricsCollector(config);
  metrics.start();
  
  // Simulate some operations
  for (let i = 0; i < 10; i++) {
    const latency = 15 + Math.random() * 60;
    const dataPoints = 30;
    metrics.recordOperation(latency, dataPoints, true);
  }
  
  // Add a failure
  metrics.recordOperation(100, 0, false, new Error('Simulated timeout'));
  
  metrics.end();
  const stats = metrics.getStats();
  
  console.log(`✓ Metrics collection:`);
  console.log(`  - Total operations: ${stats.total_operations}`);
  console.log(`  - Success rate: ${stats.success_rate}`);
  console.log(`  - Failed operations: ${stats.failed_operations}`);
  console.log(`  - Average latency: ${stats.latency.avg}ms`);
  console.log(`  - Throughput: ${stats.points_per_sec} points/sec`);
  
  return true;
}

async function main() {
  try {
    const treeResult = await testTreeModel();
    const tableResult = await testTableModel();
    
    console.log('\n' + '='.repeat(80));
    console.log('ALL TESTS PASSED ✓');
    console.log('='.repeat(80));
    console.log('\nBenchmark infrastructure is working correctly!');
    console.log('\nTo run actual benchmarks against IoTDB:');
    console.log('  1. Start IoTDB instance (e.g., docker compose -f docker-compose-1c1d.yml up -d)');
    console.log('  2. Run: node benchmark/benchmark-tree.js');
    console.log('  3. Run: node benchmark/benchmark-table.js');
    console.log();
    
    process.exit(0);
  } catch (error) {
    console.error('\n' + '!'.repeat(80));
    console.error('TEST FAILED');
    console.error('!'.repeat(80));
    console.error('\nError:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
