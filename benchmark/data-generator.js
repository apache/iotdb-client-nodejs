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
 * Data Generator Module
 * 
 * Pre-generates test data for benchmarks to eliminate data generation overhead
 * during actual performance testing. Supports various data types and configurable
 * distribution.
 */

const fs = require('fs').promises;
const path = require('path');
const { TSDataType } = require('./config');

/**
 * Generate random value based on data type
 * @param {number} dataType - TSDataType code
 * @param {Object} config - Configuration object
 * @returns {*} Generated value
 */
function generateValue(dataType, config) {
  switch (dataType) {
    case TSDataType.BOOLEAN:
      return Math.random() > 0.5;
    
    case TSDataType.INT32:
      return Math.floor(Math.random() * 2147483647);
    
    case TSDataType.INT64:
      // Use string for INT64 to avoid JavaScript precision issues
      return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString();
    
    case TSDataType.FLOAT:
      return parseFloat((Math.random() * 1000).toFixed(2));
    
    case TSDataType.DOUBLE:
      return Math.random() * 10000;
    
    case TSDataType.TEXT:
    case TSDataType.STRING:
      return generateRandomString(config.STRING_LENGTH);
    
    default:
      return 0;
  }
}

/**
 * Generate random string of specified length
 * @param {number} length - String length
 * @returns {string} Random string
 */
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Distribute sensors across data types based on proportion
 * @param {number} totalSensors - Total number of sensors
 * @param {Object} proportions - Data type proportions
 * @returns {Array} Array of data type codes
 */
function distributeSensorTypes(totalSensors, proportions) {
  const types = [];
  const sortedTypes = Object.entries(proportions)
    .sort((a, b) => b[1] - a[1]); // Sort by proportion descending

  let remaining = totalSensors;
  
  for (let i = 0; i < sortedTypes.length; i++) {
    const [typeStr, proportion] = sortedTypes[i];
    const type = parseInt(typeStr);
    
    // Calculate count for this type
    const count = i === sortedTypes.length - 1 
      ? remaining  // Last type gets all remaining sensors
      : Math.floor(totalSensors * proportion);
    
    // Add this type 'count' times
    for (let j = 0; j < count; j++) {
      types.push(type);
    }
    
    remaining -= count;
  }

  // Shuffle to avoid all same types being grouped together
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }

  return types;
}

/**
 * Generate test data for tree model
 * @param {Object} config - Configuration object
 * @returns {Object} Generated data structure
 */
function generateTreeModelData(config) {
  console.log('Generating tree model test data...');
  
  const { 
    DEVICE_NUMBER, 
    SENSOR_NUMBER, 
    TOTAL_DATA_POINTS,
    BATCH_SIZE_PER_WRITE,
    POINT_STEP,
    INSERT_DATATYPE_PROPORTION,
    STORAGE_GROUP_PREFIX,
    DEVICE_PREFIX,
    SENSOR_PREFIX,
    LOOP,
  } = config;

  const devices = [];
  
  // Calculate batches based on LOOP or TOTAL_DATA_POINTS
  let batchCount;
  if (LOOP !== null) {
    // When using LOOP mode, we generate one batch per device (used LOOP times)
    batchCount = 1;
  } else {
    // Legacy mode: calculate based on total data points
    const pointsPerDevice = Math.floor(TOTAL_DATA_POINTS / DEVICE_NUMBER);
    batchCount = Math.ceil(pointsPerDevice / BATCH_SIZE_PER_WRITE);
  }

  // Distribute sensor types
  const sensorTypes = distributeSensorTypes(SENSOR_NUMBER, INSERT_DATATYPE_PROPORTION);

  for (let deviceIdx = 0; deviceIdx < DEVICE_NUMBER; deviceIdx++) {
    const deviceId = `${STORAGE_GROUP_PREFIX}.${DEVICE_PREFIX}${deviceIdx}`;
    const measurements = [];
    const dataTypes = [];

    // Create sensor metadata
    for (let sensorIdx = 0; sensorIdx < SENSOR_NUMBER; sensorIdx++) {
      measurements.push(`${SENSOR_PREFIX}${sensorIdx}`);
      dataTypes.push(sensorTypes[sensorIdx]);
    }

    // Generate data batches
    const batches = [];
    for (let batchIdx = 0; batchIdx < batchCount; batchIdx++) {
      const batchSize = LOOP !== null ? BATCH_SIZE_PER_WRITE : Math.min(
        BATCH_SIZE_PER_WRITE,
        Math.floor(TOTAL_DATA_POINTS / DEVICE_NUMBER) - batchIdx * BATCH_SIZE_PER_WRITE
      );

      const timestamps = [];
      const values = Array(batchSize).fill(null).map(() => []);

      // Base timestamp (will be updated during actual test)
      const baseTimestamp = 0;

      for (let rowIdx = 0; rowIdx < batchSize; rowIdx++) {
        timestamps.push(baseTimestamp + rowIdx * POINT_STEP);
        
        // Generate values for each sensor
        for (let sensorIdx = 0; sensorIdx < SENSOR_NUMBER; sensorIdx++) {
          const value = generateValue(dataTypes[sensorIdx], config);
          values[rowIdx].push(value);
        }
      }

      batches.push({
        timestamps,
        values,
      });
    }

    devices.push({
      deviceId,
      measurements,
      dataTypes,
      batches,
    });

    if ((deviceIdx + 1) % 10 === 0 || deviceIdx === DEVICE_NUMBER - 1) {
      console.log(`  Generated data for ${deviceIdx + 1}/${DEVICE_NUMBER} devices`);
    }
  }

  return {
    model: 'tree',
    config: {
      DEVICE_NUMBER,
      SENSOR_NUMBER,
      TOTAL_DATA_POINTS,
      BATCH_SIZE_PER_WRITE,
      POINT_STEP,
      LOOP,
    },
    devices,
  };
}

/**
 * Generate test data for table model
 * @param {Object} config - Configuration object
 * @returns {Object} Generated data structure
 */
function generateTableModelData(config) {
  console.log('Generating table model test data...');
  
  const { 
    DEVICE_NUMBER, 
    SENSOR_NUMBER, 
    TOTAL_DATA_POINTS,
    BATCH_SIZE_PER_WRITE,
    POINT_STEP,
    INSERT_DATATYPE_PROPORTION,
    DATABASE_NAME,
    TABLE_NAME,
    LOOP,
  } = config;

  const devices = [];
  
  // Calculate batches based on LOOP or TOTAL_DATA_POINTS
  let batchCount;
  if (LOOP !== null) {
    // When using LOOP mode, we generate one batch per device (used LOOP times)
    batchCount = 1;
  } else {
    // Legacy mode: calculate based on total data points
    const pointsPerDevice = Math.floor(TOTAL_DATA_POINTS / DEVICE_NUMBER);
    batchCount = Math.ceil(pointsPerDevice / BATCH_SIZE_PER_WRITE);
  }

  // Distribute sensor types
  const sensorTypes = distributeSensorTypes(SENSOR_NUMBER, INSERT_DATATYPE_PROPORTION);

  for (let deviceIdx = 0; deviceIdx < DEVICE_NUMBER; deviceIdx++) {
    const deviceId = `device_${deviceIdx}`;
    const measurements = [];
    const dataTypes = [];

    // Create sensor metadata
    for (let sensorIdx = 0; sensorIdx < SENSOR_NUMBER; sensorIdx++) {
      measurements.push(`sensor_${sensorIdx}`);
      dataTypes.push(sensorTypes[sensorIdx]);
    }

    // Generate data batches
    const batches = [];
    for (let batchIdx = 0; batchIdx < batchCount; batchIdx++) {
      const batchSize = LOOP !== null ? BATCH_SIZE_PER_WRITE : Math.min(
        BATCH_SIZE_PER_WRITE,
        Math.floor(TOTAL_DATA_POINTS / DEVICE_NUMBER) - batchIdx * BATCH_SIZE_PER_WRITE
      );

      const timestamps = [];
      const values = Array(batchSize).fill(null).map(() => []);

      // Base timestamp (will be updated during actual test)
      const baseTimestamp = 0;

      for (let rowIdx = 0; rowIdx < batchSize; rowIdx++) {
        timestamps.push(baseTimestamp + rowIdx * POINT_STEP);
        
        // Generate values for each sensor
        for (let sensorIdx = 0; sensorIdx < SENSOR_NUMBER; sensorIdx++) {
          const value = generateValue(dataTypes[sensorIdx], config);
          values[rowIdx].push(value);
        }
      }

      batches.push({
        timestamps,
        values,
      });
    }

    devices.push({
      deviceId,
      measurements,
      dataTypes,
      batches,
    });

    if ((deviceIdx + 1) % 10 === 0 || deviceIdx === DEVICE_NUMBER - 1) {
      console.log(`  Generated data for ${deviceIdx + 1}/${DEVICE_NUMBER} devices`);
    }
  }

  return {
    model: 'table',
    config: {
      DATABASE_NAME,
      TABLE_NAME,
      DEVICE_NUMBER,
      SENSOR_NUMBER,
      TOTAL_DATA_POINTS,
      BATCH_SIZE_PER_WRITE,
      POINT_STEP,
      LOOP,
    },
    devices,
  };
}

/**
 * Save generated data to file
 * @param {Object} data - Generated data
 * @param {string} filePath - File path to save
 */
async function saveDataToFile(data, filePath) {
  console.log(`Saving generated data to ${filePath}...`);
  
  // Ensure directory exists
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  
  // Save as JSON
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  
  const stats = await fs.stat(filePath);
  console.log(`Data saved successfully (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
}

/**
 * Load generated data from file
 * @param {string} filePath - File path to load
 * @returns {Object} Loaded data
 */
async function loadDataFromFile(filePath) {
  console.log(`Loading test data from ${filePath}...`);
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    console.log(`Data loaded successfully (${data.model} model)`);
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('Data file not found, will generate new data');
      return null;
    }
    throw error;
  }
}

/**
 * Check if data file exists and is valid
 * @param {string} filePath - File path to check
 * @param {Object} config - Current configuration
 * @returns {boolean} True if valid
 */
async function isDataFileValid(filePath, config) {
  try {
    const data = await loadDataFromFile(filePath);
    if (!data) return false;

    // Check if configuration matches
    const configMatches = 
      data.config.DEVICE_NUMBER === config.DEVICE_NUMBER &&
      data.config.SENSOR_NUMBER === config.SENSOR_NUMBER &&
      data.config.TOTAL_DATA_POINTS === config.TOTAL_DATA_POINTS &&
      data.config.BATCH_SIZE_PER_WRITE === config.BATCH_SIZE_PER_WRITE;

    if (!configMatches) {
      console.log('Existing data file configuration does not match current config');
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Generate or load test data
 * @param {Object} config - Configuration object
 * @param {string} model - 'tree' or 'table'
 * @returns {Object} Test data
 */
async function prepareTestData(config, model) {
  const filePath = config.DATA_FILE_PATH.replace('.json', `_${model}.json`);
  
  // Check if we should regenerate
  if (!config.REGENERATE_DATA) {
    const isValid = await isDataFileValid(filePath, config);
    if (isValid) {
      return await loadDataFromFile(filePath);
    }
  }

  // Generate new data
  console.log(`Generating new test data for ${model} model...`);
  const startTime = Date.now();
  
  const data = model === 'tree' 
    ? generateTreeModelData(config)
    : generateTableModelData(config);
  
  const duration = Date.now() - startTime;
  console.log(`Data generation completed in ${(duration / 1000).toFixed(2)}s`);
  
  // Save for future use
  await saveDataToFile(data, filePath);
  
  return data;
}

module.exports = {
  generateTreeModelData,
  generateTableModelData,
  prepareTestData,
  loadDataFromFile,
  saveDataToFile,
  generateValue,
  distributeSensorTypes,
};
