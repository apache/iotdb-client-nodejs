# Apache IoTDB Node.js Client - Tree Model User Guide

> **Version**: 1.0.0  
> **Last Updated**: 2024

## Table of Contents

- [1. Introduction](#1-introduction)
- [2. Installation](#2-installation)
- [3. Quick Start](#3-quick-start)
- [4. SessionPool API](#4-sessionpool-api)
- [5. Configuration Builders](#5-configuration-builders)
- [6. Data Types](#6-data-types)
- [7. Code Examples](#7-code-examples)
- [8. Best Practices](#8-best-practices)
- [9. Troubleshooting](#9-troubleshooting)

## 1. Introduction

### 1.1 Overview

The Apache IoTDB Node.js Client provides native support for the tree model (timeseries data model), enabling efficient management of time-series data using hierarchical device paths. This guide covers the SessionPool API for tree model operations with connection pooling and high-concurrency support.

### 1.2 Tree Model Features

The tree model in IoTDB organizes data hierarchically:

- **Path-based Organization**: `root.{storage_group}.{device}.{measurement}`
- **Timeseries Management**: Create and manage individual timeseries with specific data types
- **Efficient Batch Insertion**: Use `insertTablet` for high-performance batch writes
- **Flexible Queries**: Support for path patterns and wildcard queries
- **Connection Pooling**: SessionPool for high-concurrency scenarios

### 1.3 Key Concepts

- **Storage Group**: Top-level data organization unit (e.g., `root.test`)
- **Device**: Physical or logical entity that generates data (e.g., `root.test.device1`)
- **Measurement**: Sensor or metric name (e.g., `temperature`, `humidity`)
- **Timeseries**: Full path with data type (e.g., `root.test.device1.temperature FLOAT`)

## 2. Installation

### 2.1 Install from npm

```bash
npm install iotdb-client-nodejs
```

**Requirements:**
- Node.js >= 14.0.0
- Apache IoTDB >= 1.0.0

### 2.2 Import in Your Project

**TypeScript:**
```typescript
import { SessionPool, PoolConfigBuilder, TreeTablet, TSDataType } from 'iotdb-client-nodejs';
```

**JavaScript:**
```javascript
const { SessionPool, PoolConfigBuilder, TreeTablet, TSDataType } = require('iotdb-client-nodejs');
```

## 3. Quick Start

### 3.1 SessionPool Example

```typescript
import { SessionPool, TreeTablet } from 'iotdb-client-nodejs';

async function quickStart() {
  // Create and initialize pool
  const pool = new SessionPool('localhost', 6667, {
    username: 'root',
    password: 'root',
    maxPoolSize: 10,
    minPoolSize: 2,
  });
  
  await pool.init();
  
  try {
    // Create storage group
    await pool.executeNonQueryStatement('CREATE DATABASE root.test');
    
    // Create timeseries
    await pool.executeNonQueryStatement(
      'CREATE TIMESERIES root.test.device1.temperature WITH DATATYPE=FLOAT, ENCODING=RLE'
    );
    
    // Insert data using TreeTablet class with addRow
    const tablet = new TreeTablet(
      'root.test.device1',
      ['temperature'],
      [3] // FLOAT
    );
    tablet.addRow(Date.now(), [25.5]);
    
    await pool.insertTablet(tablet);
    
    // Query data
    const result = await pool.executeQueryStatement(
      'SELECT temperature FROM root.test.device1'
    );
    
    console.log('Query result:', result);
    console.log('Pool size:', pool.getPoolSize());
    console.log('Available:', pool.getAvailableSize());
  } finally {
    await pool.close();
  }
}

quickStart();
```

## 4. SessionPool API

### 4.1 Overview

SessionPool provides connection pooling for high-concurrency scenarios. It automatically manages multiple sessions, distributes load across nodes, and recycles idle connections.

**Key Features:**
- Round-robin load balancing across multiple nodes
- Configurable pool size (min/max)
- Automatic idle connection cleanup
- Wait queue for connection requests
- Thread-safe operations

### 4.2 Constructor

#### Option 1: Traditional API (Same Port)

```typescript
const pool = new SessionPool(
  ['node1', 'node2', 'node3'], // Hosts
  6667,                         // Port
  {
    username: 'root',
    password: 'root',
    maxPoolSize: 20,
    minPoolSize: 5,
  }
);
```

#### Option 2: Using nodeUrls (Different Ports)

```typescript
const pool = new SessionPool({
  nodeUrls: [
    'node1:6667',
    'node2:6668',
    'node3:6669',
  ],
  username: 'root',
  password: 'root',
  maxPoolSize: 20,
  minPoolSize: 5,
});
```

#### Option 3: Using Builder Pattern (Recommended)

```typescript
import { PoolConfigBuilder } from 'iotdb-client-nodejs';

const pool = new SessionPool(
  new PoolConfigBuilder()
    .nodeUrls(['node1:6667', 'node2:6667', 'node3:6667'])
    .username('root')
    .password('root')
    .maxPoolSize(20)
    .minPoolSize(5)
    .maxIdleTime(60000)
    .waitTimeout(60000)
    .build()
);
```

### 4.3 Pool Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxPoolSize` | number | `10` | Maximum number of sessions in pool |
| `minPoolSize` | number | `1` | Minimum number of sessions maintained |
| `maxIdleTime` | number | `60000` | Max idle time before cleanup (ms) |
| `waitTimeout` | number | `60000` | Max wait time for available session (ms) |

### 4.4 Methods

#### 4.4.1 Pool Management

##### `async init(): Promise<void>`

Initializes the connection pool and creates minimum sessions.

**Example:**
```typescript
await pool.init();
```

##### `async close(): Promise<void>`

Closes all sessions in the pool and releases resources.

**Example:**
```typescript
await pool.close();
```

#### 4.4.2 Automatic Session Management

The pool automatically acquires and releases sessions for these operations:

##### `async executeQueryStatement(sql: string, timeoutMs?: number): Promise<QueryResult>`

Executes a query using an available session from the pool.

**Example:**
```typescript
const result = await pool.executeQueryStatement('SELECT * FROM root.test.**');
```

##### `async executeNonQueryStatement(sql: string): Promise<void>`

Executes a non-query statement using an available session.

**Example:**
```typescript
await pool.executeNonQueryStatement('CREATE DATABASE root.test');
```

##### `async insertTablet(tablet: Tablet): Promise<void>`

Inserts data using an available session.

**Example:**
```typescript
await pool.insertTablet({
  deviceId: 'root.test.device1',
  measurements: ['temperature'],
  dataTypes: [3],
  timestamps: [Date.now()],
  values: [[25.5]],
});
```

#### 4.4.3 Explicit Session Management

For multiple operations on the same session:

##### `async getSession(): Promise<Session>`

Acquires a session from the pool. **Must** be released after use.

**Example:**
```typescript
const session = await pool.getSession();
try {
  await session.executeNonQueryStatement('CREATE DATABASE root.test');
  await session.insertTablet({ /* data */ });
  const result = await session.executeQueryStatement('SELECT ...');
} finally {
  pool.releaseSession(session);
}
```

##### `releaseSession(session: Session): void`

Releases a session back to the pool.

**Example:**
```typescript
pool.releaseSession(session);
```

#### 4.4.4 Pool Statistics

##### `getPoolSize(): number`

Returns the current total number of sessions in the pool.

##### `getAvailableSize(): number`

Returns the number of available (idle) sessions.

##### `getInUseSize(): number`

Returns the number of sessions currently in use.

**Example:**
```typescript
console.log(`Total: ${pool.getPoolSize()}`);
console.log(`Available: ${pool.getAvailableSize()}`);
console.log(`In Use: ${pool.getInUseSize()}`);
```

## 5. Configuration Builders

### 5.1 PoolConfigBuilder

Fluent API for building SessionPool configurations.

**Available Methods:**
- `host(host: string): this`
- `port(port: number): this`
- `nodeUrls(urls: string[]): this`
- `username(username: string): this`
- `password(password: string): this`
- `database(database: string): this`
- `timezone(timezone: string): this`
- `fetchSize(size: number): this`
- `enableSSL(enable: boolean): this`
- `sslOptions(options: SSLOptions): this`
- `maxPoolSize(size: number): this`
- `minPoolSize(size: number): this`
- `maxIdleTime(time: number): this`
- `waitTimeout(timeout: number): this`
- `build(): PoolConfig`

**Example:**
```typescript
const poolConfig = new PoolConfigBuilder()
  .nodeUrls(['node1:6667', 'node2:6667'])
  .username('root')
  .password('root')
  .maxPoolSize(20)
  .minPoolSize(5)
  .maxIdleTime(60000)
  .waitTimeout(60000)
  .build();

const pool = new SessionPool(poolConfig);
```

## 6. Data Types

### 6.1 Supported Data Types

The tree model supports all IoTDB data types:

| Code | Type | JavaScript Type | Description |
|------|------|-----------------|-------------|
| 0 | BOOLEAN | boolean | True or false |
| 1 | INT32 | number | 32-bit signed integer |
| 2 | INT64 | number/string | 64-bit signed integer (use string for large values) |
| 3 | FLOAT | number | 32-bit floating point |
| 4 | DOUBLE | number | 64-bit floating point |
| 5 | TEXT | string | UTF-8 string |
| 8 | TIMESTAMP | number/Date | Milliseconds since epoch |
| 9 | DATE | number/Date | Days since epoch |
| 10 | BLOB | Buffer | Binary data |
| 11 | STRING | string | Same as TEXT |

### 6.2 Using Data Types in insertTablet

**Example with Multiple Types:**
```typescript
await pool.insertTablet({
  deviceId: 'root.test.sensor1',
  measurements: ['temp', 'humidity', 'status', 'description', 'reading_time'],
  dataTypes: [3, 4, 0, 5, 8], // FLOAT, DOUBLE, BOOLEAN, TEXT, TIMESTAMP
  timestamps: [Date.now()],
  values: [[
    25.5,                    // FLOAT
    60.123456,              // DOUBLE
    true,                   // BOOLEAN
    'Normal operation',     // TEXT
    Date.now(),            // TIMESTAMP
  ]],
});
```

### 6.3 Handling INT64

For INT64 values larger than JavaScript's safe integer range (2^53 - 1), use strings:

```typescript
await pool.insertTablet({
  deviceId: 'root.test.device1',
  measurements: ['largeCounter'],
  dataTypes: [2], // INT64
  timestamps: [Date.now()],
  values: [['9223372036854775807']], // String for large INT64
});
```

## 7. Code Examples

### 7.1 Complete CRUD Example

```typescript
import { SessionPool } from 'iotdb-client-nodejs';

async function crudExample() {
  const pool = new SessionPool('localhost', 6667, {
    username: 'root',
    password: 'root',
    maxPoolSize: 10,
    minPoolSize: 2,
  });
  
  await pool.init();
  
  try {
    // CREATE
    await pool.executeNonQueryStatement('CREATE DATABASE root.factory');
    await pool.executeNonQueryStatement(
      'CREATE TIMESERIES root.factory.workshop1.temperature WITH DATATYPE=FLOAT'
    );
    
    // INSERT
    await pool.insertTablet({
      deviceId: 'root.factory.workshop1',
      measurements: ['temperature'],
      dataTypes: [3],
      timestamps: [Date.now() - 3000, Date.now() - 2000, Date.now() - 1000],
      values: [[25.5], [26.0], [25.8]],
    });
    
    // READ
    const result = await pool.executeQueryStatement(
      'SELECT temperature FROM root.factory.workshop1'
    );
    
    console.log('Temperature readings:', result);
    
    // UPDATE (Delete and re-insert)
    await pool.executeNonQueryStatement(
      `DELETE FROM root.factory.workshop1.temperature WHERE time <= ${Date.now() - 2500}`
    );
    
    // DELETE
    await pool.executeNonQueryStatement('DELETE DATABASE root.factory');
    
  } finally {
    await pool.close();
  }
}

crudExample();
```

### 7.2 Multi-Node SessionPool Example

```typescript
import { SessionPool, PoolConfigBuilder } from 'iotdb-client-nodejs';

async function multiNodeExample() {
  const pool = new SessionPool(
    new PoolConfigBuilder()
      .nodeUrls([
        'iotdb-node1:6667',
        'iotdb-node2:6667',
        'iotdb-node3:6667',
      ])
      .username('root')
      .password('root')
      .maxPoolSize(30)
      .minPoolSize(10)
      .build()
  );
  
  await pool.init();
  
  try {
    // Simulate concurrent operations
    const operations = [];
    
    for (let i = 0; i < 100; i++) {
      operations.push(
        pool.insertTablet({
          deviceId: `root.test.device${i % 10}`,
          measurements: ['value'],
          dataTypes: [3],
          timestamps: [Date.now()],
          values: [[Math.random() * 100]],
        })
      );
    }
    
    await Promise.all(operations);
    console.log('All operations completed');
    
    // Pool statistics
    console.log('Pool Statistics:');
    console.log(`  Total Sessions: ${pool.getPoolSize()}`);
    console.log(`  Available: ${pool.getAvailableSize()}`);
    console.log(`  In Use: ${pool.getInUseSize()}`);
    
  } finally {
    await pool.close();
  }
}

multiNodeExample();
```

### 7.3 Time Range Query Example

```typescript
async function timeRangeQuery(pool: SessionPool) {
  const now = Date.now();
  const hourAgo = now - 3600000;
  
  const result = await pool.executeQueryStatement(
    `SELECT temperature, humidity FROM root.test.** WHERE time >= ${hourAgo} AND time <= ${now}`
  );
  
  console.log('Query result:', result);
  return result;
}
```

### 7.4 Batch Insert with Multiple Devices

```typescript
async function batchInsertMultipleDevices(pool: SessionPool) {
  const devices = ['device1', 'device2', 'device3'];
  const timestamps = [];
  const now = Date.now();
  
  // Generate timestamps for last 10 minutes
  for (let i = 0; i < 600; i++) {
    timestamps.push(now - (600 - i) * 1000);
  }
  
  for (const device of devices) {
    const values = timestamps.map(() => [
      20 + Math.random() * 10,  // temperature
      50 + Math.random() * 30,  // humidity
    ]);
    
    await pool.insertTablet({
      deviceId: `root.test.${device}`,
      measurements: ['temperature', 'humidity'],
      dataTypes: [3, 3],
      timestamps,
      values,
    });
  }
  
  console.log(`Inserted ${timestamps.length} records for ${devices.length} devices`);
}
```

## 8. Best Practices

### 8.1 Resource Management

**Always close pool resources:**
```typescript
// SessionPool
try {
  await pool.init();
  // ... operations
} finally {
  await pool.close();
}
```

### 8.2 Batch Insertion

**Optimize batch size:**
- Use `insertTablet` instead of individual inserts
- Batch 100-1000 rows per tablet
- Consider memory vs network trade-offs

**Example:**
```typescript
// Good: Batch insert
await pool.insertTablet({
  deviceId: 'root.test.device1',
  measurements: ['temperature'],
  dataTypes: [3],
  timestamps: timestamps, // 100-1000 timestamps
  values: values,         // 100-1000 values
});

// Bad: Individual inserts
for (let i = 0; i < 1000; i++) {
  await pool.executeNonQueryStatement(
    `INSERT INTO root.test.device1(timestamp, temperature) VALUES(${timestamps[i]}, ${values[i]})`
  );
}
```

### 8.3 Error Handling

```typescript
try {
  await pool.init();
  await pool.executeNonQueryStatement('CREATE DATABASE root.test');
} catch (error) {
  if (error.message.includes('already exists')) {
    console.log('Database already exists, continuing...');
  } else {
    console.error('Failed to create database:', error);
    throw error;
  }
} finally {
  await pool.close();
}
```

### 8.4 Connection Pool Sizing

**Guidelines:**
- Set `minPoolSize` to average concurrent load
- Set `maxPoolSize` to peak load + buffer (20-30%)
- Monitor pool statistics in production
- Adjust based on server capacity

**Example:**
```typescript
const pool = new SessionPool({
  nodeUrls: ['localhost:6667'],
  maxPoolSize: 50,    // Peak load: 40 clients + 25% buffer
  minPoolSize: 20,    // Average load: 20 clients
  maxIdleTime: 60000, // Clean up idle after 1 minute
  waitTimeout: 30000, // Wait max 30s for available session
});
```

## 9. Troubleshooting

### 9.1 Common Issues

#### Connection Refused

**Symptoms:**
```
Error: connect ECONNREFUSED 127.0.0.1:6667
```

**Solutions:**
1. Verify IoTDB is running: `jps | grep IoTDB`
2. Check port configuration in `iotdb-datanode.properties`
3. Verify firewall allows connections
4. Test with telnet: `telnet localhost 6667`

#### Pool Timeout

**Symptoms:**
```
Error: Timeout waiting for available session
```

**Solutions:**
1. Increase `waitTimeout` in pool configuration
2. Increase `maxPoolSize` if server can handle it
3. Verify sessions are being released properly
4. Check for connection leaks (forgotten `releaseSession()`)

#### Out of Memory

**Symptoms:**
```
FATAL ERROR: Reached heap limit
```

**Solutions:**
1. Reduce `fetchSize` in pool configuration
2. Process query results in batches
3. Increase Node.js heap: `node --max-old-space-size=4096 app.js`

### 9.2 Debugging Tips

**Enable debug logging:**
```typescript
// Set environment variable
process.env.LOG_LEVEL = 'debug';

// Or use logger directly
import { logger } from 'iotdb-client-nodejs';
logger.setLevel('debug');
```

**Check connection status:**
```typescript
console.log('Pool size:', pool.getPoolSize());
console.log('Available:', pool.getAvailableSize());
console.log('In Use:', pool.getInUseSize());
```

**Test query execution time:**
```typescript
const start = Date.now();
const result = await pool.executeQueryStatement('SELECT ...');
console.log(`Query took ${Date.now() - start}ms`);
```

### 9.3 Performance Optimization

1. **Use connection pooling**: For concurrent operations
2. **Batch inserts**: Use insertTablet with 100-1000 rows
3. **Multi-node setup**: Distribute load across nodes
4. **Monitor resources**: Watch CPU, memory, network
5. **Adjust pool size**: Set min/max pool size based on workload

### 9.4 Getting Help

- **Documentation**: [IoTDB Docs](https://iotdb.apache.org/)
- **GitHub Issues**: [Report bugs](https://github.com/CritasWang/iotdb-client-nodejs/issues)
- **Mailing List**: dev@iotdb.apache.org

## Appendix A: Complete Type Reference

See [data-types.md](data-types.md) for comprehensive data type documentation.

## Appendix B: API Quick Reference

### SessionPool Methods
- `init()` - Initialize pool
- `close()` - Close all sessions
- `executeQueryStatement(sql, timeout?)` - Execute query
- `executeNonQueryStatement(sql)` - Execute DDL/DML
- `insertTablet(tablet)` - Batch insert
- `getSession()` - Get session from pool
- `releaseSession(session)` - Return session to pool
- `getPoolSize()` - Total sessions
- `getAvailableSize()` - Available sessions
- `getInUseSize()` - Active sessions

---

**Version**: 1.0.0  
**Last Updated**: January 2024  
**License**: Apache License 2.0
