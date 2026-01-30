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
 * Schema Manager Module
 * 
 * Handles metadata registration before performance testing to avoid
 * metadata creation overhead during benchmarks. Supports both tree
 * and table models.
 */

const { TSDataType } = require('./config');

/**
 * Map TSDataType code to IoTDB type string
 * @param {number} dataType - TSDataType code
 * @returns {string} IoTDB data type string
 */
function getDataTypeString(dataType) {
  const typeMap = {
    [TSDataType.BOOLEAN]: 'BOOLEAN',
    [TSDataType.INT32]: 'INT32',
    [TSDataType.INT64]: 'INT64',
    [TSDataType.FLOAT]: 'FLOAT',
    [TSDataType.DOUBLE]: 'DOUBLE',
    [TSDataType.TEXT]: 'TEXT',
    [TSDataType.TIMESTAMP]: 'TIMESTAMP',
    [TSDataType.DATE]: 'DATE',
    [TSDataType.BLOB]: 'BLOB',
    [TSDataType.STRING]: 'STRING',
  };
  return typeMap[dataType] || 'FLOAT';
}

/**
 * Create tree model schema
 * @param {Object} session - IoTDB session or pool
 * @param {Object} testData - Test data structure
 * @param {Object} config - Configuration object
 */
async function createTreeModelSchema(session, testData, config) {
  console.log('\n=== Creating Tree Model Schema ===');
  const startTime = Date.now();

  try {
    // Create storage group
    console.log(`Creating storage group: ${config.STORAGE_GROUP_PREFIX}...`);
    try {
      await session.executeNonQueryStatement(
        `CREATE DATABASE ${config.STORAGE_GROUP_PREFIX}`
      );
      console.log('  ✓ Storage group created');
    } catch (error) {
      if (error.message && error.message.includes('already exists')) {
        console.log('  ℹ Storage group already exists, continuing...');
      } else {
        throw error;
      }
    }

    // Create timeseries for each device
    console.log(`Creating timeseries for ${testData.devices.length} devices...`);
    let timeseriesCreated = 0;

    for (const device of testData.devices) {
      for (let i = 0; i < device.measurements.length; i++) {
        const measurement = device.measurements[i];
        const dataType = device.dataTypes[i];
        const typeString = getDataTypeString(dataType);
        
        const timeseriesPath = `${device.deviceId}.${measurement}`;
        
        try {
          await session.executeNonQueryStatement(
            `CREATE TIMESERIES ${timeseriesPath} WITH DATATYPE=${typeString}`
          );
          timeseriesCreated++;
        } catch (error) {
          if (error.message && error.message.includes('already exists')) {
            // Ignore already exists errors during schema creation
            timeseriesCreated++;
          } else {
            console.error(`  ✗ Failed to create timeseries ${timeseriesPath}:`, error.message);
          }
        }
      }

      // Progress update
      const progress = ((testData.devices.indexOf(device) + 1) / testData.devices.length * 100).toFixed(1);
      if ((testData.devices.indexOf(device) + 1) % 10 === 0 || testData.devices.indexOf(device) === testData.devices.length - 1) {
        console.log(`  Progress: ${progress}% (${timeseriesCreated} timeseries)`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`\n✓ Schema creation completed in ${(duration / 1000).toFixed(2)}s`);
    console.log(`  Total timeseries: ${timeseriesCreated}`);
    
  } catch (error) {
    console.error('✗ Schema creation failed:', error);
    throw error;
  }
}

/**
 * Create table model schema
 * @param {Object} session - IoTDB session or pool
 * @param {Object} testData - Test data structure
 * @param {Object} config - Configuration object
 */
async function createTableModelSchema(session, testData, config) {
  console.log('\n=== Creating Table Model Schema ===');
  const startTime = Date.now();

  try {
    // Create database
    console.log(`Creating database: ${config.DATABASE_NAME}...`);
    try {
      await session.executeNonQueryStatement(
        `CREATE DATABASE ${config.DATABASE_NAME}`
      );
      console.log('  ✓ Database created');
    } catch (error) {
      if (error.message && error.message.includes('already exists')) {
        console.log('  ℹ Database already exists, continuing...');
      } else {
        throw error;
      }
    }

    // Use database
    await session.executeNonQueryStatement(`USE ${config.DATABASE_NAME}`);
    console.log('  ✓ Using database');

    // Drop existing table if exists
    try {
      await session.executeNonQueryStatement(`DROP TABLE ${config.TABLE_NAME}`);
      console.log('  ✓ Dropped existing table');
    } catch (error) {
      // Ignore if table doesn't exist
    }

    // Build CREATE TABLE statement from device structure
    const columns = ['device_id STRING ID', 'timestamp TIMESTAMP'];
    
    // Add sensor columns from first device (all devices have same structure)
    if (testData.devices && testData.devices.length > 0) {
      const device = testData.devices[0];
      for (let i = 0; i < device.measurements.length; i++) {
        const measurementName = device.measurements[i];
        const dataType = device.dataTypes[i];
        const typeString = getDataTypeString(dataType);
        columns.push(`${measurementName} ${typeString}`);
      }
    }

    const createTableSQL = `CREATE TABLE ${config.TABLE_NAME} (${columns.join(', ')})`;
    console.log(`Creating table with ${columns.length} columns...`);
    
    await session.executeNonQueryStatement(createTableSQL);
    console.log('  ✓ Table created');

    const duration = Date.now() - startTime;
    console.log(`\n✓ Schema creation completed in ${(duration / 1000).toFixed(2)}s`);
    
  } catch (error) {
    console.error('✗ Schema creation failed:', error);
    throw error;
  }
}

/**
 * Clean up test schema
 * @param {Object} session - IoTDB session or pool
 * @param {string} model - 'tree' or 'table'
 * @param {Object} config - Configuration object
 */
async function cleanupSchema(session, model, config) {
  console.log('\n=== Cleaning Up Schema ===');
  
  try {
    if (model === 'tree') {
      console.log(`Dropping storage group: ${config.STORAGE_GROUP_PREFIX}...`);
      try {
        await session.executeNonQueryStatement(
          `DELETE DATABASE ${config.STORAGE_GROUP_PREFIX}.*`
        );
        console.log('  ✓ Storage group deleted');
      } catch (error) {
        console.log('  ℹ Storage group does not exist or already deleted');
      }
    } else if (model === 'table') {
      console.log(`Dropping database: ${config.DATABASE_NAME}...`);
      try {
        await session.executeNonQueryStatement(
          `DROP DATABASE ${config.DATABASE_NAME}`
        );
        console.log('  ✓ Database dropped');
      } catch (error) {
        console.log('  ℹ Database does not exist or already deleted');
      }
    }
  } catch (error) {
    console.error('✗ Cleanup failed:', error.message);
    // Don't throw - cleanup is best effort
  }
}

/**
 * Verify schema creation
 * @param {Object} session - IoTDB session or pool
 * @param {string} model - 'tree' or 'table'
 * @param {Object} config - Configuration object
 * @returns {boolean} True if schema exists
 */
async function verifySchema(session, model, config) {
  console.log('\n=== Verifying Schema ===');
  
  try {
    if (model === 'tree') {
      // Check if storage group exists
      const result = await session.executeQueryStatement('SHOW DATABASES');
      const databases = [];
      
      while (await result.hasNext()) {
        const row = result.next();
        databases.push(row.getFields()[0]);
      }
      await result.close();
      
      const exists = databases.some(db => 
        db === config.STORAGE_GROUP_PREFIX || db.startsWith(config.STORAGE_GROUP_PREFIX + '.')
      );
      
      if (exists) {
        console.log(`  ✓ Storage group ${config.STORAGE_GROUP_PREFIX} exists`);
        return true;
      } else {
        console.log(`  ✗ Storage group ${config.STORAGE_GROUP_PREFIX} not found`);
        return false;
      }
    } else if (model === 'table') {
      // Check if database exists
      const result = await session.executeQueryStatement('SHOW DATABASES');
      const databases = [];
      
      while (await result.hasNext()) {
        const row = result.next();
        databases.push(row.getFields()[0]);
      }
      await result.close();
      
      const exists = databases.includes(config.DATABASE_NAME);
      
      if (exists) {
        console.log(`  ✓ Database ${config.DATABASE_NAME} exists`);
        return true;
      } else {
        console.log(`  ✗ Database ${config.DATABASE_NAME} not found`);
        return false;
      }
    }
  } catch (error) {
    console.error('✗ Verification failed:', error.message);
    return false;
  }
  
  return false;
}

module.exports = {
  createTreeModelSchema,
  createTableModelSchema,
  cleanupSchema,
  verifySchema,
  getDataTypeString,
};
