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
 * Benchmark Configuration Module
 * 
 * This module provides centralized configuration management for IoTDB benchmarks.
 * It supports both tree model and table model benchmarks with flexible parameter customization.
 */

// TSDataType codes (from Apache IoTDB TSFile specification)
const TSDataType = {
  BOOLEAN: 0,
  INT32: 1,
  INT64: 2,
  FLOAT: 3,
  DOUBLE: 4,
  TEXT: 5,
  TIMESTAMP: 8,
  DATE: 9,
  BLOB: 10,
  STRING: 11,
};

// Default configuration
const DEFAULT_CONFIG = {
  // ===== Database Connection Settings =====
  IOTDB_HOST: process.env.IOTDB_HOST || 'localhost',
  IOTDB_PORT: parseInt(process.env.IOTDB_PORT || '6667'),
  IOTDB_USER: process.env.IOTDB_USER || 'root',
  IOTDB_PASSWORD: process.env.IOTDB_PASSWORD || 'root',
  
  // Multi-node support (optional, for cluster testing)
  // Format: ['host1:port1', 'host2:port2', ...]
  NODE_URLS: process.env.NODE_URLS ? process.env.NODE_URLS.split(',') : null,

  // ===== Benchmark Test Parameters =====
  CLIENT_NUMBER: parseInt(process.env.CLIENT_NUMBER || '10'),          // Number of concurrent clients
  DEVICE_NUMBER: parseInt(process.env.DEVICE_NUMBER || '100'),         // Number of devices to simulate
  SENSOR_NUMBER: parseInt(process.env.SENSOR_NUMBER || '10'),          // Sensors per device
  
  // ===== Data Type Distribution =====
  // Proportion of different data types (must sum to 1.0)
  // Format: { dataType: proportion }
  INSERT_DATATYPE_PROPORTION: {
    [TSDataType.FLOAT]: 0.3,
    [TSDataType.DOUBLE]: 0.2,
    [TSDataType.INT32]: 0.2,
    [TSDataType.INT64]: 0.1,
    [TSDataType.TEXT]: 0.1,
    [TSDataType.BOOLEAN]: 0.1,
  },

  // ===== Write Operation Settings =====
  BATCH_SIZE_PER_WRITE: parseInt(process.env.BATCH_SIZE_PER_WRITE || '100'),  // Rows per write batch
  TOTAL_DATA_POINTS: parseInt(process.env.TOTAL_DATA_POINTS || '100000'),     // Total data points to generate (used if LOOP not set)
  LOOP: process.env.LOOP ? parseInt(process.env.LOOP) : null,                 // Total execution loops (alternative to TOTAL_DATA_POINTS)
  
  // ===== Time Settings =====
  POINT_STEP: parseInt(process.env.POINT_STEP || '1000'),             // Time interval between points (ms)
  TIMESTAMP_PRECISION: process.env.TIMESTAMP_PRECISION || 'ms',       // 'ms', 'us', or 'ns'
  
  // ===== String Type Settings =====
  STRING_LENGTH: parseInt(process.env.STRING_LENGTH || '16'),         // Length of generated TEXT strings

  // ===== Test Execution Settings =====
  WARMUP_ROUNDS: parseInt(process.env.WARMUP_ROUNDS || '0'),          // Warmup iterations before actual test
  TEST_ROUNDS: parseInt(process.env.TEST_ROUNDS || '1'),              // Number of test iterations
  
  // ===== Pool Configuration =====
  POOL_MAX_SIZE: parseInt(process.env.POOL_MAX_SIZE || '20'),         // Maximum pool size
  POOL_MIN_SIZE: parseInt(process.env.POOL_MIN_SIZE || '5'),          // Minimum pool size
  POOL_MAX_IDLE_TIME: parseInt(process.env.POOL_MAX_IDLE_TIME || '60000'),  // Max idle time (ms)
  POOL_WAIT_TIMEOUT: parseInt(process.env.POOL_WAIT_TIMEOUT || '60000'),    // Wait timeout (ms)
  
  // ===== Device-Session Binding =====
  ENABLE_DEVICE_SESSION_BINDING: process.env.ENABLE_DEVICE_SESSION_BINDING === 'true',  // Bind devices to sessions (requires DEVICE_NUMBER % POOL_MAX_SIZE == 0)

  // ===== Model-Specific Settings =====
  // Tree model settings
  STORAGE_GROUP_PREFIX: 'root.benchmark',
  DEVICE_PREFIX: 'd',
  SENSOR_PREFIX: 's',
  
  // Table model settings
  DATABASE_NAME: 'benchmark_db',
  TABLE_NAME: 'benchmark_table',

  // ===== Performance Reporting =====
  REPORT_INTERVAL: parseInt(process.env.REPORT_INTERVAL || '5000'),   // Progress report interval (ms)
  ENABLE_DETAILED_METRICS: process.env.ENABLE_DETAILED_METRICS !== 'false', // Enable percentile metrics

  // ===== Data Generation =====
  DATA_FILE_PATH: process.env.DATA_FILE_PATH || './benchmark/benchmark_data.json',  // Pre-generated data file path
  REGENERATE_DATA: process.env.REGENERATE_DATA === 'true',            // Force regenerate test data
};

/**
 * Validate configuration parameters
 * @param {Object} config - Configuration object
 * @returns {Object} Validation result with { valid: boolean, errors: string[] }
 */
function validateConfig(config) {
  const errors = [];

  // Validate client and device numbers
  if (config.CLIENT_NUMBER <= 0) {
    errors.push('CLIENT_NUMBER must be positive');
  }
  if (config.DEVICE_NUMBER <= 0) {
    errors.push('DEVICE_NUMBER must be positive');
  }
  if (config.SENSOR_NUMBER <= 0) {
    errors.push('SENSOR_NUMBER must be positive');
  }
  if (config.BATCH_SIZE_PER_WRITE <= 0) {
    errors.push('BATCH_SIZE_PER_WRITE must be positive');
  }
  
  // Validate LOOP or TOTAL_DATA_POINTS
  if (config.LOOP !== null) {
    if (config.LOOP <= 0) {
      errors.push('LOOP must be positive');
    }
  } else if (config.TOTAL_DATA_POINTS <= 0) {
    errors.push('TOTAL_DATA_POINTS must be positive when LOOP is not set');
  }

  // Validate data type proportion
  const proportionSum = Object.values(config.INSERT_DATATYPE_PROPORTION).reduce(
    (sum, val) => sum + val, 
    0
  );
  if (Math.abs(proportionSum - 1.0) > 0.001) {
    errors.push(`INSERT_DATATYPE_PROPORTION must sum to 1.0 (currently ${proportionSum})`);
  }

  // Validate timestamp precision
  const validPrecisions = ['ms', 'us', 'ns'];
  if (!validPrecisions.includes(config.TIMESTAMP_PRECISION)) {
    errors.push(`TIMESTAMP_PRECISION must be one of: ${validPrecisions.join(', ')}`);
  }

  // Validate pool settings
  if (config.POOL_MIN_SIZE > config.POOL_MAX_SIZE) {
    errors.push('POOL_MIN_SIZE cannot be greater than POOL_MAX_SIZE');
  }
  
  // Validate device-session binding
  if (config.ENABLE_DEVICE_SESSION_BINDING) {
    if (config.DEVICE_NUMBER % config.POOL_MAX_SIZE !== 0) {
      errors.push(
        `ENABLE_DEVICE_SESSION_BINDING requires DEVICE_NUMBER (${config.DEVICE_NUMBER}) ` +
        `to be a multiple of POOL_MAX_SIZE (${config.POOL_MAX_SIZE})`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create configuration by merging custom options with defaults
 * @param {Object} customConfig - Custom configuration options
 * @returns {Object} Merged configuration
 */
function createConfig(customConfig = {}) {
  const config = { ...DEFAULT_CONFIG, ...customConfig };
  
  const validation = validateConfig(config);
  if (!validation.valid) {
    throw new Error(`Configuration validation failed:\n${validation.errors.join('\n')}`);
  }

  return config;
}

/**
 * Print configuration summary
 * @param {Object} config - Configuration object
 */
function printConfig(config) {
  console.log('='.repeat(80));
  console.log('BENCHMARK CONFIGURATION');
  console.log('='.repeat(80));
  
  console.log('\n[Connection Settings]');
  console.log(`  IoTDB Host:        ${config.IOTDB_HOST}`);
  console.log(`  IoTDB Port:        ${config.IOTDB_PORT}`);
  console.log(`  Username:          ${config.IOTDB_USER}`);
  if (config.NODE_URLS) {
    console.log(`  Node URLs:         ${config.NODE_URLS.join(', ')}`);
  }

  console.log('\n[Test Parameters]');
  console.log(`  Concurrent Clients:   ${config.CLIENT_NUMBER}`);
  console.log(`  Device Count:         ${config.DEVICE_NUMBER}`);
  console.log(`  Sensors per Device:   ${config.SENSOR_NUMBER}`);
  if (config.LOOP !== null) {
    console.log(`  Execution Loops:      ${config.LOOP}`);
    const totalPoints = config.DEVICE_NUMBER * config.BATCH_SIZE_PER_WRITE * config.SENSOR_NUMBER * config.LOOP;
    console.log(`  Total Data Points:    ${totalPoints.toLocaleString()} (calculated)`);
  } else {
    console.log(`  Total Data Points:    ${config.TOTAL_DATA_POINTS}`);
  }
  console.log(`  Batch Size:           ${config.BATCH_SIZE_PER_WRITE}`);

  console.log('\n[Data Type Distribution]');
  const typeNames = {
    [TSDataType.BOOLEAN]: 'BOOLEAN',
    [TSDataType.INT32]: 'INT32',
    [TSDataType.INT64]: 'INT64',
    [TSDataType.FLOAT]: 'FLOAT',
    [TSDataType.DOUBLE]: 'DOUBLE',
    [TSDataType.TEXT]: 'TEXT',
  };
  Object.entries(config.INSERT_DATATYPE_PROPORTION).forEach(([type, proportion]) => {
    console.log(`  ${typeNames[type] || 'Type' + type}:  ${(proportion * 100).toFixed(1)}%`);
  });

  console.log('\n[Time Settings]');
  console.log(`  Point Step:           ${config.POINT_STEP}ms`);
  console.log(`  Timestamp Precision:  ${config.TIMESTAMP_PRECISION}`);

  console.log('\n[Pool Configuration]');
  console.log(`  Pool Max Size:        ${config.POOL_MAX_SIZE}`);
  console.log(`  Pool Min Size:        ${config.POOL_MIN_SIZE}`);
  console.log(`  Device-Session Binding: ${config.ENABLE_DEVICE_SESSION_BINDING ? 'Enabled' : 'Disabled'}`);

  console.log('\n[Test Execution]');
  console.log(`  Warmup Rounds:        ${config.WARMUP_ROUNDS}`);
  console.log(`  Test Rounds:          ${config.TEST_ROUNDS}`);
  console.log(`  Report Interval:      ${config.REPORT_INTERVAL}ms`);
  
  console.log('='.repeat(80));
  console.log();
}

module.exports = {
  TSDataType,
  DEFAULT_CONFIG,
  createConfig,
  validateConfig,
  printConfig,
};
