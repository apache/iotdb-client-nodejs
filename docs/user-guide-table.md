# Apache IoTDB Node.js Client - Table Model User Guide

> **Version**: 1.0.0  
> **Last Updated**: 2024

## Table of Contents

- [1. Introduction](#1-introduction)
- [2. Installation](#2-installation)
- [3. Quick Start](#3-quick-start)
- [4. TableSessionPool API](#4-tablesessionpool-api)
- [5. Configuration Builder](#5-configuration-builder)
- [6. Data Types](#6-data-types)
- [7. Code Examples](#7-code-examples)
- [8. Best Practices](#8-best-practices)
- [9. Troubleshooting](#9-troubleshooting)

## 1. Introduction

### 1.1 Overview

The Apache IoTDB Node.js Client provides native support for the table model (relational data model), enabling efficient management of structured data using SQL-like table operations. This guide covers the TableSessionPool API for table model operations.

### 1.2 Table Model Features

The table model in IoTDB organizes data in a relational format:

- **Database-based Organization**: Create and manage databases containing multiple tables
- **Table Schema**: Define tables with tags, attributes, and fields
- **SQL Operations**: Use familiar SQL syntax for queries and data manipulation
- **Connection Pooling**: Built-in pool for high-concurrency scenarios
- **Automatic Context**: Database context management with `USE DATABASE`

### 1.3 Key Concepts

- **Database**: Logical grouping of related tables
- **Table**: Schema definition with columns and column categories
- **Tags**: Identifiers for time series (indexed, used in WHERE clauses)
- **Attributes**: Metadata for time series (not indexed)
- **Fields**: Actual measurement values

### 1.4 Table Model vs Tree Model

| Aspect | Table Model | Tree Model |
|--------|-------------|------------|
| Organization | Relational tables | Hierarchical paths |
| Schema | Explicit table schema | Timeseries definitions |
| Query Language | Standard SQL | IoTDB SQL with paths |
| Use Case | Structured, relational data | Hierarchical IoT data |
| Data Model | Tags + Attributes + Fields | Device + Measurements |

## 2. Installation

### 2.1 Install from npm

```bash
npm install iotdb-client-nodejs
```

**Requirements:**
- Node.js >= 14.0.0
- Apache IoTDB >= 1.0.0 (with table model support)

### 2.2 Import in Your Project

**TypeScript:**
```typescript
import { TableSessionPool, PoolConfigBuilder, TableTablet, ColumnCategory, TSDataType } from 'iotdb-client-nodejs';
```

**JavaScript:**
```javascript
const { TableSessionPool, PoolConfigBuilder, TableTablet, ColumnCategory, TSDataType } = require('iotdb-client-nodejs');
```

## 3. Quick Start

### 3.1 Basic TableSessionPool Example

```typescript
import { TableSessionPool, TableTablet, ColumnCategory } from 'iotdb-client-nodejs';

async function quickStart() {
  // Create and initialize table session pool
  const pool = new TableSessionPool('localhost', 6667, {
    username: 'root',
    password: 'root',
    database: 'test_db', // Optional: set default database
    maxPoolSize: 10,
    minPoolSize: 2,
  });
  
  await pool.open();
  
  try {
    // Create database
    await pool.executeNonQueryStatement('CREATE DATABASE test_db');
    
    // Use database
    await pool.executeNonQueryStatement('USE test_db');
    
    // Create table
    await pool.executeNonQueryStatement(`
      CREATE TABLE sensor_data (
        region_id STRING TAG,
        device_id STRING TAG,
        model STRING ATTRIBUTE,
        temperature FLOAT FIELD,
        humidity DOUBLE FIELD
      ) WITH (TTL=3600000)
    `);
    
    // Insert data using TableTablet class with addRow
    const tablet = new TableTablet(
      'sensor_data',
      ['region_id', 'device_id', 'model', 'temperature', 'humidity'],
      [5, 5, 5, 3, 4], // STRING, STRING, STRING, FLOAT, DOUBLE
      [ColumnCategory.TAG, ColumnCategory.TAG, ColumnCategory.ATTRIBUTE, ColumnCategory.FIELD, ColumnCategory.FIELD]
    );
    tablet.addRow(Date.now(), ['region1', 'device001', 'ModelA', 25.5, 60.0]);
    
    await pool.insertTablet(tablet);
    
    // Query data
    const dataSet = await pool.executeQueryStatement(`
      SELECT * FROM sensor_data 
      WHERE region_id = 'region1' AND device_id = 'device001'
    `);
    
    while (await dataSet.hasNext()) {
      const row = dataSet.next();
      console.log(`Temperature: ${row.getFloat('temperature')}°C, Humidity: ${row.getDouble('humidity')}%`);
    }
    
    await dataSet.close();
  } finally {
    await pool.close();
  }
}

quickStart();
```

### 3.2 With Database Context

```typescript
async function withDatabaseContext() {
  // Create pool with database pre-configured
  const pool = new TableSessionPool('localhost', 6667, {
    username: 'root',
    password: 'root',
    database: 'production_db', // Automatically executes USE DATABASE
    maxPoolSize: 20,
  });
  
  await pool.open();
  
  try {
    // No need for explicit USE DATABASE
    // Already in 'production_db' context
    
    const dataSet = await pool.executeQueryStatement('SHOW TABLES');
    
    while (await dataSet.hasNext()) {
      const row = dataSet.next();
      console.log('Table:', row.getFields());
    }
    
    await dataSet.close();
  } finally {
    await pool.close();
  }
}
```

## 4. TableSessionPool API

### 4.1 Overview

TableSessionPool is a specialized connection pool for table model operations. It extends the base SessionPool functionality with table-specific features and automatic database context management.

**Key Features:**
- Same connection pooling as SessionPool
- Automatic `USE DATABASE` when configured with database
- Table-specific insertTablet with column categories
- SQL-based operations
- Round-robin load balancing

### 4.2 Constructor

#### Option 1: Traditional API (Same Port)

```typescript
const pool = new TableSessionPool(
  'localhost',                    // Host
  6667,                           // Port
  {
    username: 'root',
    password: 'root',
    database: 'my_database',      // Optional
    maxPoolSize: 20,
    minPoolSize: 5,
  }
);
```

#### Option 2: Using nodeUrls (Different Ports)

```typescript
const pool = new TableSessionPool({
  nodeUrls: [
    'node1:6667',
    'node2:6668',
    'node3:6669',
  ],
  username: 'root',
  password: 'root',
  database: 'my_database',
  maxPoolSize: 20,
  minPoolSize: 5,
});
```

#### Option 3: Using Builder Pattern (Recommended)

```typescript
import { PoolConfigBuilder } from 'iotdb-client-nodejs';

const pool = new TableSessionPool(
  new PoolConfigBuilder()
    .nodeUrls(['node1:6667', 'node2:6667'])
    .username('root')
    .password('root')
    .database('my_database')
    .maxPoolSize(20)
    .minPoolSize(5)
    .maxIdleTime(60000)
    .waitTimeout(60000)
    .build()
);
```

### 4.3 Configuration Options

All SessionPool options plus:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `database` | string | `undefined` | Default database for table operations |

### 4.4 Methods

#### 4.4.1 Connection Management

##### `async open(enableRpcCompression?: boolean): Promise<void>`

Opens the connection pool. Optionally enables RPC compression.

**Parameters:**
- `enableRpcCompression`: Enable RPC compression (default: false)

**Example:**
```typescript
// Open without compression
await pool.open();

// Open with compression
await pool.open(true);
```

##### `async close(): Promise<void>`

Closes all sessions in the pool.

**Example:**
```typescript
await pool.close();
```

#### 4.4.2 Query Operations

##### `async executeQueryStatement(sql: string, timeoutMs?: number): Promise<SessionDataSet>`

Executes a SQL query statement.

**Parameters:**
- `sql`: SQL query statement
- `timeoutMs`: Query timeout in milliseconds (default: 60000)

**Returns:** SessionDataSet for iterating results

**Example:**
```typescript
const dataSet = await pool.executeQueryStatement(`
  SELECT temperature, humidity 
  FROM sensor_data 
  WHERE region_id = 'region1'
  LIMIT 100
`);

while (await dataSet.hasNext()) {
  const row = dataSet.next();
  console.log(row.getTimestamp(), row.getFloat('temperature'));
}

await dataSet.close();
```

#### 4.4.3 Non-Query Operations

##### `async executeNonQueryStatement(sql: string): Promise<void>`

Executes DDL or DML statements.

**Parameters:**
- `sql`: SQL statement

**Example:**
```typescript
// Create database
await pool.executeNonQueryStatement('CREATE DATABASE my_db');

// Use database
await pool.executeNonQueryStatement('USE my_db');

// Create table
await pool.executeNonQueryStatement(`
  CREATE TABLE devices (
    device_id STRING TAG,
    location STRING ATTRIBUTE,
    value FLOAT FIELD
  )
`);

// Drop table
await pool.executeNonQueryStatement('DROP TABLE devices');

// Drop database
await pool.executeNonQueryStatement('DROP DATABASE my_db');
```

#### 4.4.4 Data Insertion

##### `async insertTablet(tablet: TableTablet | ITableTablet): Promise<void>`

Inserts data into a table using tablet format.

**Parameters:**
- `tablet`: TableTablet object or plain object containing table data

**TableTablet Interface (for plain objects):**
```typescript
interface ITableTablet {
  tableName: string;                    // Table name
  columnNames: string[];                // Column names
  columnTypes: number[];                // Data type codes (TSDataType)
  columnCategories: ColumnCategory[];   // Column categories
  timestamps: number[];                 // Timestamps in milliseconds
  values: any[][];                     // 2D array: [rows][columns]
}
```

**ColumnCategory Enum:**
```typescript
enum ColumnCategory {
  TAG = 0,        // Tag column - indexed for WHERE clause filtering (e.g., device_id, region_id)
  FIELD = 2,      // Field column - measurement values (e.g., temperature, humidity)
  ATTRIBUTE = 1,  // Attribute column - metadata not indexed (e.g., model, firmware_version)
  TIME = 3,       // Time column (reserved for internal use only)
}
```

**Column Categories Explained:**
- `TAG` (0) - Indexed columns used for filtering in WHERE clauses (e.g., device_id, region_id)
- `FIELD` (2) - Measurement values (e.g., temperature, humidity)
- `ATTRIBUTE` (1) - Metadata not used for filtering (e.g., device_model, firmware_version)
- `TIME` (3) - Reserved for internal use. **Do not use** in columnCategories array - timestamps are handled separately via the timestamps array

**TableTablet Class (with helper methods - recommended):**
```typescript
import { TableTablet, ColumnCategory, TSDataType } from 'iotdb-client-nodejs';

// Create a tablet
const tablet = new TableTablet(
  'sensor_data',
  ['region_id', 'device_id', 'model', 'temperature', 'humidity'],
  [TSDataType.TEXT, TSDataType.TEXT, TSDataType.TEXT, TSDataType.FLOAT, TSDataType.DOUBLE],
  [ColumnCategory.TAG, ColumnCategory.TAG, ColumnCategory.ATTRIBUTE, ColumnCategory.FIELD, ColumnCategory.FIELD]
);

// Add rows one at a time using addRow method
tablet.addRow(Date.now(), ['region1', 'device001', 'ModelA', 25.5, 60.0]);
tablet.addRow(Date.now() + 1000, ['region1', 'device001', 'ModelA', 26.0, 61.5]);
tablet.addRow(Date.now() + 2000, ['region1', 'device002', 'ModelB', 24.8, 58.5]);

// Insert the tablet
await pool.insertTablet(tablet);
```

**Alternative: Plain object approach (still supported):**
```typescript
import { ColumnCategory, TSDataType } from 'iotdb-client-nodejs';

await pool.insertTablet({
  tableName: 'sensor_data',
  columnNames: ['region_id', 'device_id', 'model', 'temperature', 'humidity'],
  columnTypes: [TSDataType.TEXT, TSDataType.TEXT, TSDataType.TEXT, TSDataType.FLOAT, TSDataType.DOUBLE],
  columnCategories: [
    ColumnCategory.TAG,        // region_id - indexed tag
    ColumnCategory.TAG,        // device_id - indexed tag
    ColumnCategory.ATTRIBUTE,  // model - metadata
    ColumnCategory.FIELD,      // temperature - measurement
    ColumnCategory.FIELD,      // humidity - measurement
  ],
  timestamps: [
    Date.now(),
    Date.now() + 1000,
    Date.now() + 2000,
  ],
  values: [
    ['region1', 'device001', 'ModelA', 25.5, 60.0],
    ['region1', 'device001', 'ModelA', 26.0, 61.5],
    ['region1', 'device002', 'ModelB', 24.8, 58.5],
  ],
});
```

**Example with numeric values (also supported):**
```typescript
await pool.insertTablet({
  tableName: 'sensor_data',
  columnNames: ['region_id', 'device_id', 'model', 'temperature', 'humidity'],
  columnTypes: [5, 5, 5, 3, 4],           // TEXT, TEXT, TEXT, FLOAT, DOUBLE
  columnCategories: [0, 0, 1, 2, 2],      // TAG, TAG, ATTRIBUTE, FIELD, FIELD
  timestamps: [Date.now()],
  values: [['region1', 'device001', 'ModelA', 25.5, 60.0]],
});
```

**Benefits of TableTablet class:**
- ✅ **Convenient**: `addRow()` method simplifies adding data row-by-row
- ✅ **Type-safe**: Constructor validates parameter lengths
- ✅ **Validated**: Automatic checking that values match columns count
- ✅ **Streaming-friendly**: Easy to add rows as data arrives

## 5. Configuration Builder

### 5.1 PoolConfigBuilder for Table Model

The PoolConfigBuilder is used to create TableSessionPool configurations.

**Available Methods:**
- `host(host: string): this`
- `port(port: number): this`
- `nodeUrls(urls: string[]): this`
- `username(username: string): this`
- `password(password: string): this`
- `database(database: string): this` - **Important for table model**
- `timezone(timezone: string): this`
- `fetchSize(size: number): this`
- `maxPoolSize(size: number): this`
- `minPoolSize(size: number): this`
- `maxIdleTime(time: number): this`
- `waitTimeout(timeout: number): this`
- `enableSSL(enable: boolean): this`
- `sslOptions(options: SSLOptions): this`
- `build(): PoolConfig`

**Example:**
```typescript
const config = new PoolConfigBuilder()
  .nodeUrls(['iotdb1:6667', 'iotdb2:6667', 'iotdb3:6667'])
  .username('root')
  .password('root')
  .database('production_db')
  .fetchSize(2048)
  .maxPoolSize(30)
  .minPoolSize(10)
  .maxIdleTime(60000)
  .waitTimeout(60000)
  .build();

const pool = new TableSessionPool(config);
await pool.open();
```

## 6. Data Types

### 6.1 Supported Data Types

The table model supports all IoTDB data types:

| Code | Type | JavaScript Type | Usage in Table Model |
|------|------|-----------------|---------------------|
| 0 | BOOLEAN | boolean | Tags, Attributes, Fields |
| 1 | INT32 | number | Tags, Attributes, Fields |
| 2 | INT64 | number/string | Tags, Attributes, Fields |
| 3 | FLOAT | number | Attributes, Fields |
| 4 | DOUBLE | number | Attributes, Fields |
| 5 | TEXT | string | Tags, Attributes, Fields |
| 8 | TIMESTAMP | number/Date | Fields |
| 9 | DATE | number/Date | Fields |
| 10 | BLOB | Buffer | Fields |
| 11 | STRING | string | Tags, Attributes, Fields |

### 6.2 Column Categories

| Code | Category | Purpose | Indexed | Usage |
|------|----------|---------|---------|-------|
| 0 | TAG | Identifiers | Yes | Use in WHERE clauses for filtering |
| 1 | ATTRIBUTE | Metadata | No | Descriptive information |
| 2 | FIELD | Measurements | No | Actual sensor/measurement values |

### 6.3 Using Data Types in insertTablet

**Example with Mixed Types:**
```typescript
await pool.insertTablet({
  tableName: 'equipment_metrics',
  columnNames: [
    'factory_id',    // TAG
    'equipment_id',  // TAG
    'manufacturer',  // ATTRIBUTE
    'model',         // ATTRIBUTE
    'temperature',   // FIELD
    'pressure',      // FIELD
    'is_active',     // FIELD
    'last_check',    // FIELD
  ],
  columnTypes: [5, 5, 5, 5, 3, 4, 0, 8],  // STRING, STRING, STRING, STRING, FLOAT, DOUBLE, BOOLEAN, TIMESTAMP
  columnCategories: [0, 0, 1, 1, 2, 2, 2, 2],  // TAG, TAG, ATTR, ATTR, FIELD, FIELD, FIELD, FIELD
  timestamps: [Date.now()],
  values: [[
    'factory01',
    'equip123',
    'ManufacturerA',
    'ModelX',
    75.5,
    101.325,
    true,
    Date.now(),
  ]],
});
```

## 7. Code Examples

### 7.1 Complete Database and Table Setup

```typescript
import { TableSessionPool, PoolConfigBuilder } from 'iotdb-client-nodejs';

async function setupDatabase() {
  const pool = new TableSessionPool(
    new PoolConfigBuilder()
      .host('localhost')
      .port(6667)
      .username('root')
      .password('root')
      .maxPoolSize(10)
      .build()
  );
  
  await pool.open();
  
  try {
    // Create database
    await pool.executeNonQueryStatement('CREATE DATABASE iot_platform');
    
    // Use the database
    await pool.executeNonQueryStatement('USE iot_platform');
    
    // Create table with TTL
    await pool.executeNonQueryStatement(`
      CREATE TABLE sensor_readings (
        region_id STRING TAG,
        building_id STRING TAG,
        floor INT32 TAG,
        device_id STRING TAG,
        device_type STRING ATTRIBUTE,
        location STRING ATTRIBUTE,
        temperature FLOAT FIELD,
        humidity FLOAT FIELD,
        co2_level INT32 FIELD,
        timestamp TIMESTAMP FIELD
      ) WITH (TTL=7776000000)
    `);
    
    console.log('Database and table created successfully');
    
    // Show tables
    const dataSet = await pool.executeQueryStatement('SHOW TABLES');
    console.log('Tables in database:');
    while (await dataSet.hasNext()) {
      console.log(dataSet.next().getFields());
    }
    await dataSet.close();
    
  } finally {
    await pool.close();
  }
}

setupDatabase();
```

### 7.2 Batch Insert Multiple Records

```typescript
async function batchInsert(pool: TableSessionPool) {
  const regionIds = ['north', 'south', 'east', 'west'];
  const deviceIds = ['dev001', 'dev002', 'dev003'];
  
  const timestamps = [];
  const values = [];
  const now = Date.now();
  
  // Generate 100 records
  for (let i = 0; i < 100; i++) {
    timestamps.push(now + i * 1000);
    
    const region = regionIds[i % regionIds.length];
    const device = deviceIds[i % deviceIds.length];
    
    values.push([
      region,                         // region_id (TAG)
      device,                         // device_id (TAG)
      'SensorModelA',                 // model (ATTRIBUTE)
      20 + Math.random() * 10,       // temperature (FIELD)
      50 + Math.random() * 30,       // humidity (FIELD)
    ]);
  }
  
  await pool.insertTablet({
    tableName: 'sensor_readings',
    columnNames: ['region_id', 'device_id', 'model', 'temperature', 'humidity'],
    columnTypes: [5, 5, 5, 3, 3],
    columnCategories: [0, 0, 1, 2, 2],
    timestamps,
    values,
  });
  
  console.log(`Inserted ${timestamps.length} records`);
}
```

### 7.3 Query with Filtering

```typescript
async function queryWithFilters(pool: TableSessionPool) {
  // Query by TAG (indexed, efficient)
  const dataSet = await pool.executeQueryStatement(`
    SELECT 
      device_id,
      temperature,
      humidity,
      timestamp
    FROM sensor_readings
    WHERE 
      region_id = 'north' 
      AND device_id IN ('dev001', 'dev002')
      AND temperature > 25.0
    ORDER BY timestamp DESC
    LIMIT 100
  `);
  
  const results = [];
  while (await dataSet.hasNext()) {
    const row = dataSet.next();
    results.push({
      deviceId: row.getString('device_id'),
      temperature: row.getFloat('temperature'),
      humidity: row.getFloat('humidity'),
      timestamp: new Date(row.getTimestamp()),
    });
  }
  
  await dataSet.close();
  
  console.log(`Found ${results.length} matching records`);
  return results;
}
```

### 7.4 Aggregation Queries

```typescript
async function aggregationQuery(pool: TableSessionPool) {
  const dataSet = await pool.executeQueryStatement(`
    SELECT 
      region_id,
      device_id,
      AVG(temperature) as avg_temp,
      MAX(temperature) as max_temp,
      MIN(temperature) as min_temp,
      COUNT(*) as record_count
    FROM sensor_readings
    WHERE timestamp >= ${Date.now() - 3600000}
    GROUP BY region_id, device_id
  `);
  
  console.log('Aggregation Results:');
  while (await dataSet.hasNext()) {
    const row = dataSet.next();
    console.log(`Region: ${row.getString('region_id')}, Device: ${row.getString('device_id')}`);
    console.log(`  Avg Temp: ${row.getFloat('avg_temp').toFixed(2)}°C`);
    console.log(`  Max Temp: ${row.getFloat('max_temp').toFixed(2)}°C`);
    console.log(`  Min Temp: ${row.getFloat('min_temp').toFixed(2)}°C`);
    console.log(`  Records: ${row.getInt('record_count')}`);
  }
  
  await dataSet.close();
}
```

### 7.5 Multi-Database Operations

```typescript
async function multiDatabaseOps(pool: TableSessionPool) {
  await pool.open();
  
  try {
    // Create multiple databases
    await pool.executeNonQueryStatement('CREATE DATABASE production');
    await pool.executeNonQueryStatement('CREATE DATABASE staging');
    
    // Work with production database
    await pool.executeNonQueryStatement('USE production');
    await pool.executeNonQueryStatement(`
      CREATE TABLE metrics (
        device_id STRING TAG,
        value DOUBLE FIELD
      )
    `);
    
    // Switch to staging database
    await pool.executeNonQueryStatement('USE staging');
    await pool.executeNonQueryStatement(`
      CREATE TABLE test_metrics (
        device_id STRING TAG,
        value DOUBLE FIELD
      )
    `);
    
    // Query across databases using fully qualified names
    const prodData = await pool.executeQueryStatement('SELECT * FROM production.metrics LIMIT 10');
    const stagingData = await pool.executeQueryStatement('SELECT * FROM staging.test_metrics LIMIT 10');
    
    await prodData.close();
    await stagingData.close();
    
  } finally {
    await pool.close();
  }
}
```

## 8. Best Practices

### 8.1 Table Design

**Use TAGs effectively:**
- Use TAGs for columns frequently used in WHERE clauses
- TAGs are indexed, enabling fast queries
- Keep TAG cardinality reasonable (avoid millions of unique values)

**Use ATTRIBUTEs for metadata:**
- Descriptive information that doesn't need indexing
- Device model, manufacturer, location, etc.
- Not used in WHERE clauses

**Use FIELDs for measurements:**
- Actual sensor readings and metrics
- Time-series data values

**Example:**
```typescript
// Good table design
CREATE TABLE sensor_data (
  region_id STRING TAG,        // Indexed, used in WHERE
  device_id STRING TAG,        // Indexed, used in WHERE
  manufacturer STRING ATTRIBUTE, // Metadata, not indexed
  model STRING ATTRIBUTE,       // Metadata, not indexed
  temperature FLOAT FIELD,     // Measurement value
  humidity FLOAT FIELD         // Measurement value
)

// Poor design - using FIELD for identifiers
CREATE TABLE sensor_data (
  temperature FLOAT FIELD,
  humidity FLOAT FIELD,
  device_id STRING FIELD       // Should be TAG!
)
```

### 8.2 Query Optimization

**Filter by TAGs in WHERE clause:**
```typescript
// Good: Uses indexed TAGs
SELECT * FROM sensors 
WHERE region_id = 'north' AND device_id = 'dev001'

// Poor: Filter by non-indexed FIELD
SELECT * FROM sensors 
WHERE temperature > 25.0  // No TAG filtering
```

**Use appropriate LIMIT:**
```typescript
// Prevent loading too much data
SELECT * FROM sensors 
WHERE region_id = 'north'
LIMIT 1000
```

**Use time range filters:**
```typescript
SELECT * FROM sensors 
WHERE region_id = 'north'
  AND timestamp >= ${Date.now() - 3600000}
  AND timestamp <= ${Date.now()}
```

### 8.3 Connection Pool Management

**Size the pool appropriately:**
```typescript
const pool = new TableSessionPool({
  nodeUrls: ['localhost:6667'],
  maxPoolSize: 50,    // Peak concurrent queries
  minPoolSize: 10,    // Keep warm connections
  maxIdleTime: 60000, // Clean up after 1 minute idle
  waitTimeout: 30000, // Wait max 30s for connection
});
```

**Monitor pool health:**
```typescript
setInterval(() => {
  console.log('Pool Stats:');
  console.log(`  Total: ${pool.getPoolSize()}`);
  console.log(`  Available: ${pool.getAvailableSize()}`);
  console.log(`  In Use: ${pool.getInUseSize()}`);
}, 60000); // Every minute
```

### 8.4 Error Handling

```typescript
async function robustInsert(pool: TableSessionPool, data: any) {
  try {
    await pool.insertTablet(data);
    console.log('Insert successful');
  } catch (error) {
    if (error.message.includes('Table does not exist')) {
      console.log('Creating table...');
      await createTable(pool);
      await pool.insertTablet(data);
    } else if (error.message.includes('Database does not exist')) {
      console.log('Creating database...');
      await createDatabase(pool);
      await createTable(pool);
      await pool.insertTablet(data);
    } else {
      console.error('Insert failed:', error);
      throw error;
    }
  }
}
```

### 8.5 Resource Cleanup

```typescript
async function properCleanup() {
  const pool = new TableSessionPool('localhost', 6667, {
    username: 'root',
    password: 'root',
  });
  
  await pool.open();
  
  try {
    const dataSet = await pool.executeQueryStatement('SELECT * FROM table1');
    try {
      while (await dataSet.hasNext()) {
        // Process results
      }
    } finally {
      await dataSet.close(); // Always close DataSet
    }
  } finally {
    await pool.close(); // Always close pool
  }
}
```

## 9. Troubleshooting

### 9.1 Common Issues

#### Database Does Not Exist

**Symptoms:**
```
Error: Database 'my_db' does not exist
```

**Solutions:**
```typescript
// Create database first
await pool.executeNonQueryStatement('CREATE DATABASE my_db');
await pool.executeNonQueryStatement('USE my_db');

// Or configure pool with existing database
const pool = new TableSessionPool('localhost', 6667, {
  database: 'my_db',  // Must exist
});
```

#### Table Does Not Exist

**Symptoms:**
```
Error: Table 'my_table' does not exist
```

**Solutions:**
```typescript
// Check if table exists
const dataSet = await pool.executeQueryStatement('SHOW TABLES');
// ... verify table exists

// Create table if needed
await pool.executeNonQueryStatement(`
  CREATE TABLE my_table (...)
`);
```

#### Column Mismatch

**Symptoms:**
```
Error: Column count mismatch
```

**Solutions:**
- Ensure `columnNames`, `columnTypes`, and `columnCategories` have same length
- Verify `values` array matches column count
- Check table schema matches your data

```typescript
// Verify schema
const dataSet = await pool.executeQueryStatement('DESCRIBE my_table');
while (await dataSet.hasNext()) {
  console.log(dataSet.next().getFields());
}
```

#### TTL Issues

**Symptoms:**
Data automatically deleted after some time

**Solutions:**
```typescript
// Check TTL setting
const dataSet = await pool.executeQueryStatement('SHOW TABLES');
// Look for TTL in table properties

// Modify TTL
await pool.executeNonQueryStatement(`
  ALTER TABLE my_table SET PROPERTIES TTL=31536000000
`); // 1 year in milliseconds
```

### 9.2 Performance Issues

**Slow Queries:**
1. Add indexes by using TAGs appropriately
2. Use time range filters
3. Add LIMIT clauses
4. Consider table partitioning

**Slow Inserts:**
1. Increase batch size (100-1000 rows)
2. Use connection pooling
3. Consider multiple concurrent writers
4. Monitor server resources

### 9.3 Debugging

**Enable debug logging:**
```typescript
process.env.LOG_LEVEL = 'debug';
```

**Check SQL syntax:**
```typescript
try {
  await pool.executeQueryStatement('EXPLAIN SELECT * FROM my_table');
} catch (error) {
  console.error('Invalid SQL:', error.message);
}
```

**Monitor query execution:**
```typescript
const start = Date.now();
const dataSet = await pool.executeQueryStatement('SELECT ...');
console.log(`Query took ${Date.now() - start}ms`);

let rowCount = 0;
while (await dataSet.hasNext()) {
  dataSet.next();
  rowCount++;
}
console.log(`Returned ${rowCount} rows`);
```

### 9.4 Getting Help

- **Documentation**: [IoTDB Table Model Docs](https://iotdb.apache.org/)
- **GitHub Issues**: [Report bugs](https://github.com/CritasWang/iotdb-client-nodejs/issues)
- **Community**: dev@iotdb.apache.org

## Appendix A: Complete API Reference

### TableSessionPool Methods
- `open(enableRpcCompression?)` - Open connection pool
- `close()` - Close all sessions
- `executeQueryStatement(sql, timeout?)` - Execute SQL query
- `executeNonQueryStatement(sql)` - Execute DDL/DML
- `insertTablet(tablet)` - Batch insert into table
- `getPoolSize()` - Total sessions
- `getAvailableSize()` - Available sessions
- `getInUseSize()` - Active sessions

### SQL Statements
- `CREATE DATABASE database_name`
- `DROP DATABASE database_name`
- `USE database_name`
- `SHOW DATABASES`
- `SHOW TABLES`
- `CREATE TABLE table_name (...)`
- `DROP TABLE table_name`
- `ALTER TABLE table_name SET PROPERTIES TTL=<ms>`
- `SELECT ... FROM table_name WHERE ... LIMIT ...`
- `DESCRIBE table_name`

## Appendix B: Data Type Reference

See [data-types.md](data-types.md) for comprehensive data type documentation.

---

**Version**: 1.0.0  
**Last Updated**: January 2024  
**License**: Apache License 2.0
