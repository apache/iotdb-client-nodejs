# Apache IoTDB Node.js Client

[![License](https://img.shields.io/badge/license-Apache%202-4EB1BA.svg)](https://www.apache.org/licenses/LICENSE-2.0.html)
[![npm version](https://img.shields.io/npm/v/iotdb-client-nodejs.svg)](https://www.npmjs.com/package/iotdb-client-nodejs)
[![Node.js Version](https://img.shields.io/node/v/iotdb-client-nodejs.svg)](https://nodejs.org/)

A Node.js client for Apache IoTDB with support for SessionPool and TableSessionPool, providing efficient connection management and comprehensive query capabilities.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Technical Architecture](#technical-architecture)
- [API Reference](#api-reference)
- [Development](#development)
- [Testing](#testing)
- [Performance Testing](#performance-testing)
- [Examples](#examples)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Release Process](#release-process)
- [License](#license)

## Overview

The Apache IoTDB Node.js Client is a high-performance, feature-rich client library for interacting with Apache IoTDB, a time-series database designed for IoT data management. This client provides both tree model (timeseries) and table model (relational) APIs, enabling flexible data management strategies.

## Features

- **Session Management**: Single session with query, non-query, and insertTablet operations
- **SessionPool**: Connection pooling for high-concurrency scenarios with automatic load balancing
- **TableSessionPool**: Specialized pool for table model operations with database context management
- **Multi-Node Support**: Round-robin load balancing across multiple IoTDB nodes with failover
- **SSL/TLS Support**: Secure connections with customizable SSL options and certificate validation
- **TypeScript Support**: Full TypeScript definitions with strict type checking
- **Builder Pattern**: Fluent API for elegant configuration management
- **Memory Efficient**: SessionDataSet with lazy loading and pagination for large result sets
- **Comprehensive Testing**: Unit tests, E2E tests, and benchmark tools included
- **Production Ready**: Connection pooling, idle cleanup, health checks, and error handling

## Installation

```bash
npm install iotdb-client-nodejs
```

## Requirements

- Node.js >= 14.0.0
- Apache IoTDB >= 1.0.0

## Quick Start

### Basic Session Usage

```typescript
import { Session } from 'iotdb-client-nodejs';

const session = new Session({
  host: 'localhost',
  port: 6667,
  username: 'root',
  password: 'root',
});

await session.open();

// Execute non-query statement
await session.executeNonQueryStatement('CREATE DATABASE root.test');

// Execute query with SessionDataSet (iterator pattern - memory efficient)
const dataSet = await session.executeQueryStatement('SELECT * FROM root.test.**');
while (await dataSet.hasNext()) {
  const row = dataSet.next();
  console.log(row.getTimestamp(), row.getFields());
}
await dataSet.close();

// Or use toArray() helper for small result sets (loads all into memory)
const dataSet2 = await session.executeQueryStatement('SHOW DATABASES');
const allRows = await dataSet2.toArray(); // Returns [[timestamp, ...fields], ...]
console.log('All rows:', allRows);

// Execute query with custom timeout (30 seconds)
const customDataSet = await session.executeQueryStatement('SELECT * FROM root.test.**', 30000);
// ... iterate and close

// Insert tablet data (supports both tree and table models)
// Tree model example:
await session.insertTablet({
  deviceId: 'root.test.device1',
  measurements: ['temperature', 'humidity'],
  dataTypes: [3, 3], // FLOAT
  timestamps: [Date.now(), Date.now() + 1000],
  values: [
    [25.5, 60.0],
    [26.0, 61.5],
  ],
});

await session.close();
```

### Using Builder Pattern (Recommended)

The Builder pattern provides a more elegant and fluent API for configuration:

```typescript
import { Session, ConfigBuilder } from 'iotdb-client-nodejs';

// Build a session configuration
const session = new Session(
  new ConfigBuilder()
    .host('localhost')
    .port(6667)
    .username('root')
    .password('root')
    .fetchSize(1024)
    .timezone('UTC+8')
    .build()
);

await session.open();
// ... use session
await session.close();
```

### Query Results with SessionDataSet

The `executeQueryStatement()` method returns a SessionDataSet for efficient iteration through query results:

```typescript
import { Session, SessionDataSet, RowRecord } from 'iotdb-client-nodejs';

const session = new Session({
  host: 'localhost',
  port: 6667,
  username: 'root',
  password: 'root',
  fetchSize: 1024, // Rows per fetch
});

await session.open();

// Execute query and get SessionDataSet
const dataSet: SessionDataSet = await session.executeQueryStatement(
  'SELECT temperature, humidity FROM root.test.device1'
);

// Iterate through results efficiently
while (await dataSet.hasNext()) {
  const row: RowRecord = dataSet.next();
  
  // Access by column name
  const temp = row.getFloat('temperature');
  const humidity = row.getFloat('humidity');
  
  // Access by index
  const timestamp = row.getTimestamp();
  
  console.log(`${timestamp}: temp=${temp}, humidity=${humidity}`);
}

// Always close the dataset
await dataSet.close();
await session.close();
```

**Benefits of SessionDataSet:**
- ✅ **Memory Efficient**: Only keeps current batch in memory
- ✅ **Lazy Loading**: Fetches data on-demand
- ✅ **Large Datasets**: Can handle results larger than available RAM
- ✅ **Type Safety**: Typed getters prevent errors
- ✅ **Resource Management**: Proper cleanup with `close()`

See [SessionDataSet Guide](docs/sessiondataset-guide.md) for complete documentation.

### SessionPool Usage

```typescript
import { SessionPool } from 'iotdb-client-nodejs';

const pool = new SessionPool('localhost', 6667, {
  username: 'root',
  password: 'root',
  maxPoolSize: 10,
  minPoolSize: 2,
  maxIdleTime: 60000,
  waitTimeout: 60000,
});

await pool.init();

// Execute queries using the pool
const result = await pool.executeQueryStatement('SELECT * FROM root.test.**');

// Execute non-query statements
await pool.executeNonQueryStatement(
  'CREATE TIMESERIES root.test.device1.temperature WITH DATATYPE=FLOAT'
);

// Insert data
await pool.insertTablet({
  deviceId: 'root.test.device1',
  measurements: ['temperature'],
  dataTypes: [3], // FLOAT
  timestamps: [Date.now()],
  values: [[25.5]],
});

// Get pool statistics
console.log('Pool size:', pool.getPoolSize());
console.log('Available:', pool.getAvailableSize());

await pool.close();
```

### Explicit Session Management

For more control, you can explicitly get and release sessions from the pool:

```typescript
import { SessionPool } from 'iotdb-client-nodejs';

const pool = new SessionPool('localhost', 6667, {
  username: 'root',
  password: 'root',
  maxPoolSize: 10,
});

await pool.init();

// Get a session from the pool
const session = await pool.getSession();

try {
  // Use the session for multiple operations
  await session.executeNonQueryStatement('CREATE DATABASE root.test');
  const result = await session.executeQueryStatement('SHOW DATABASES');
  await session.insertTablet({
    deviceId: 'root.test.device1',
    measurements: ['temperature'],
    dataTypes: [3],
    timestamps: [Date.now()],
    values: [[25.5]],
  });
} finally {
  // Always release the session back to the pool
  pool.releaseSession(session);
}

await pool.close();
```

### Multi-Node Support

#### Method 1: Using nodeUrls with String Format (Recommended)

When nodes have different host:port combinations, use the `nodeUrls` configuration with string array format:

```typescript
import { SessionPool, PoolConfigBuilder } from 'iotdb-client-nodejs';

// Using config object with string array (RECOMMENDED)
const pool1 = new SessionPool({
  nodeUrls: [
    'node1.example.com:6667',
    'node2.example.com:6668',
    'node3.example.com:6669',
  ],
  username: 'root',
  password: 'root',
  maxPoolSize: 15,
  minPoolSize: 3,
});

// Or using Builder pattern with string array
const pool2 = new SessionPool(
  new PoolConfigBuilder()
    .nodeUrls([
      'node1.example.com:6667',
      'node2.example.com:6668',
      'node3.example.com:6669',
    ])
    .username('root')
    .password('root')
    .maxPoolSize(15)
    .minPoolSize(3)
    .build()
);

await pool1.init();
// Connections will be distributed across all nodes using round-robin
```

#### Method 2: Using nodeUrls with Object Format (Also Supported)

You can also use the object format for `nodeUrls`:

```typescript
const pool = new SessionPool({
  nodeUrls: [
    { host: 'node1.example.com', port: 6667 },
    { host: 'node2.example.com', port: 6668 },
    { host: 'node3.example.com', port: 6669 },
  ],
  username: 'root',
  password: 'root',
  maxPoolSize: 15,
});
```

#### Method 3: Traditional API (For Same Port)

When all nodes share the same port:

```typescript
import { SessionPool } from 'iotdb-client-nodejs';

const pool = new SessionPool(
  ['node1.example.com', 'node2.example.com', 'node3.example.com'],
  6667,
  {
    username: 'root',
    password: 'root',
    maxPoolSize: 15,
  }
);

await pool.init();
// Connections will be distributed across all nodes using round-robin
```

### SSL/TLS Support

```typescript
import { Session } from 'iotdb-client-nodejs';
import * as fs from 'fs';

const session = new Session({
  host: 'localhost',
  port: 6667,
  username: 'root',
  password: 'root',
  enableSSL: true,
  sslOptions: {
    ca: fs.readFileSync('/path/to/ca.crt'),
    cert: fs.readFileSync('/path/to/client.crt'),
    key: fs.readFileSync('/path/to/client.key'),
    rejectUnauthorized: true,
  },
});

await session.open();
```

### TableSessionPool Usage

```typescript
import { TableSessionPool } from 'iotdb-client-nodejs';

const tablePool = new TableSessionPool('localhost', 6667, {
  username: 'root',
  password: 'root',
  database: 'my_database', // Set default database for table model
  maxPoolSize: 10,
  minPoolSize: 2,
});

await tablePool.init();

// Execute queries in table mode
const result = await tablePool.executeQueryStatement('SHOW DATABASES');

await tablePool.close();
```

## API Reference

### Configuration Builders

#### ConfigBuilder

Fluent API for building Session configurations:

```typescript
import { ConfigBuilder } from 'iotdb-client-nodejs';

const config = new ConfigBuilder()
  .host('localhost')
  .port(6667)
  .username('root')
  .password('root')
  .database('mydb')
  .timezone('UTC+8')
  .fetchSize(2048)
  .enableSSL(false)
  .build();
```

**Methods:**
- `host(host: string): this` - Set the host
- `port(port: number): this` - Set the port
- `nodeUrls(nodeUrls: EndPoint[]): this` - Set multiple node URLs
- `username(username: string): this` - Set the username
- `password(password: string): this` - Set the password
- `database(database: string): this` - Set the database
- `timezone(timezone: string): this` - Set the timezone
- `fetchSize(fetchSize: number): this` - Set the fetch size
- `enableSSL(enable: boolean): this` - Enable or disable SSL
- `sslOptions(sslOptions: SSLOptions): this` - Set SSL options
- `build(): Config` - Build and return the configuration

#### PoolConfigBuilder

Fluent API for building SessionPool configurations (extends ConfigBuilder):

```typescript
import { PoolConfigBuilder } from 'iotdb-client-nodejs';

const config = new PoolConfigBuilder()
  .host('localhost')
  .port(6667)
  .username('root')
  .password('root')
  .maxPoolSize(20)
  .minPoolSize(5)
  .maxIdleTime(30000)
  .waitTimeout(45000)
  .build();
```

**Additional Methods:**
- `maxPoolSize(size: number): this` - Set maximum pool size
- `minPoolSize(size: number): this` - Set minimum pool size
- `maxIdleTime(time: number): this` - Set maximum idle time (ms)
- `waitTimeout(timeout: number): this` - Set wait timeout (ms)
- `build(): PoolConfig` - Build and return the pool configuration

### Data Types

IoTDB Node.js client supports all IoTDB data types including BOOLEAN, INT32, INT64, FLOAT, DOUBLE, TEXT, BLOB, STRING, DATE, and TIMESTAMP. See [DATA_TYPES.md](./DATA_TYPES.md) for comprehensive documentation on:
- Type mappings between JavaScript and IoTDB
- Usage examples for each data type
- Best practices and encoding options
- Null value handling

### Session

#### Constructor

**Option 1: Using config object**
```typescript
new Session(config: Config)
```

**Option 2: Using Builder pattern** (Recommended)
```typescript
new Session(new ConfigBuilder()...build())
```

The config must include either:
- `host` and `port` for single node connection
- `nodeUrls` for multi-node connection (uses first node)

#### Methods
- `async open(): Promise<void>` - Open the session
- `async close(): Promise<void>` - Close the session
- `async executeQueryStatement(sql: string, timeoutMs?: number): Promise<QueryResult>` - Execute a query with optional timeout (default: 60000ms)
- `async executeNonQueryStatement(sql: string): Promise<void>` - Execute a non-query statement
- `async insertTablet(tablet: Tablet): Promise<void>` - Insert tablet data
- `isOpen(): boolean` - Check if session is open

### SessionPool

#### Constructor

**Option 1: Traditional API** (Backward compatible)
```typescript
new SessionPool(hosts: string | string[], port: number, config?: Partial<PoolConfig>)
```

**Option 2: Using config object with nodeUrls**
```typescript
new SessionPool(config: PoolConfig)
```

**Option 3: Using Builder pattern** (Recommended)
```typescript
new SessionPool(new PoolConfigBuilder()...build())
```

#### Methods

**Connection Management:**
- `async init(): Promise<void>` - Initialize the pool
- `async close(): Promise<void>` - Close all connections

**Automatic Session Management:**
- `async executeQueryStatement(sql: string, timeoutMs?: number): Promise<QueryResult>` - Execute a query with optional timeout (default: 60000ms)
- `async executeNonQueryStatement(sql: string): Promise<void>` - Execute a non-query statement
- `async insertTablet(tablet: Tablet): Promise<void>` - Insert tablet data

**Explicit Session Management:**
- `async getSession(): Promise<Session>` - Get a session from the pool (must be released)
- `releaseSession(session: Session): void` - Release a session back to the pool

**Pool Statistics:**
- `getPoolSize(): number` - Get current pool size
- `getAvailableSize(): number` - Get available connections
- `getInUseSize(): number` - Get number of sessions currently in use

### TableSessionPool

Same as SessionPool but optimized for table model operations. Automatically executes `USE DATABASE` when configured with a database. All query methods support the same timeout parameter (default: 60000ms).

#### Constructor

Same constructor options as SessionPool.

### Types

#### Config
```typescript
interface Config {
  host?: string;
  port?: number;
  nodeUrls?: string[] | EndPoint[];  // String array format: ["host1:6667", "host2:6668"]
  username?: string;
  password?: string;
  database?: string;
  timezone?: string;
  fetchSize?: number;
  enableSSL?: boolean;
  sslOptions?: SSLOptions;
}
```

**Note:** Either `host`/`port` OR `nodeUrls` must be provided. 
- Use `nodeUrls` in string array format (e.g., `["host1:6667", "host2:6668"]`) for nodes with different ports (RECOMMENDED)
- Object format `[{ host, port }]` is also supported for backward compatibility

#### EndPoint
```typescript
interface EndPoint {
  host: string;
  port: number;
}
```

#### PoolConfig
```typescript
interface PoolConfig extends Config {
  maxPoolSize?: number;
  minPoolSize?: number;
  maxIdleTime?: number;
  waitTimeout?: number;
}
```

#### Tablet
```typescript
#### TreeTablet (Tree Model / Timeseries Model)

**Interface (for plain objects):**
```typescript
interface ITreeTablet {
  deviceId: string;           // Full path like "root.test.device1"
  measurements: string[];     // Sensor names
  dataTypes: number[];        // TSDataType for each measurement
  timestamps: number[];       // Array of timestamps
  values: any[][];           // 2D array: [rows][columns]
}
```

**Class (with helper methods):**
```typescript
import { TreeTablet, TSDataType } from 'iotdb-client-nodejs';

// Create a tablet
const tablet = new TreeTablet(
  'root.test.device1',
  ['temperature', 'humidity'],
  [TSDataType.FLOAT, TSDataType.DOUBLE]
);

// Add rows one at a time using addRow method
tablet.addRow(Date.now(), [25.5, 60.0]);
tablet.addRow(Date.now() + 1000, [26.0, 61.5]);
tablet.addRow(Date.now() + 2000, [26.5, 62.0]);

// Insert the tablet
await session.insertTablet(tablet);
```

**Alternative: Plain object approach (still supported)**
```typescript
await session.insertTablet({
  deviceId: 'root.test.device1',
  measurements: ['temperature', 'humidity'],
  dataTypes: [TSDataType.FLOAT, TSDataType.DOUBLE],
  timestamps: [Date.now(), Date.now() + 1000],
  values: [[25.5, 60.0], [26.0, 61.5]],
});
```

#### TableTablet (Table Model / Relational Model)

**Interface (for plain objects):**
```typescript
interface ITableTablet {
  tableName: string;          // Table name
  columnNames: string[];      // Column names (excluding timestamp)
  columnTypes: number[];      // TSDataType for each column
  columnCategories: ColumnCategory[];  // Category for each column
  timestamps: number[];       // Array of timestamps
  values: any[][];           // 2D array: [rows][columns]
}

enum ColumnCategory {
  TAG = 0,         // Tag column - indexed for WHERE clause filtering
  FIELD = 1,       // Field column - measurement values
  ATTRIBUTE = 2,   // Attribute column - metadata not indexed
  TIME = 3,        // Time column (reserved for internal use, do not use in columnCategories)
}
```

**Class (with helper methods):**
```typescript
import { TableTablet, ColumnCategory, TSDataType } from 'iotdb-client-nodejs';

// Create a tablet
const tablet = new TableTablet(
  'sensor_data',
  ['device_id', 'temperature', 'humidity'],
  [TSDataType.TEXT, TSDataType.FLOAT, TSDataType.DOUBLE],
  [ColumnCategory.TAG, ColumnCategory.FIELD, ColumnCategory.FIELD]
);

// Add rows one at a time using addRow method
tablet.addRow(Date.now(), ['device_001', 25.5, 60.0]);
tablet.addRow(Date.now() + 1000, ['device_002', 26.0, 61.5]);
tablet.addRow(Date.now() + 2000, ['device_003', 26.5, 62.0]);

// Insert the tablet
await pool.insertTablet(tablet);
```

**Alternative: Plain object approach (still supported)**
```typescript
await pool.insertTablet({
  tableName: 'sensor_data',
  columnNames: ['device_id', 'temperature', 'humidity'],
  columnTypes: [TSDataType.TEXT, TSDataType.FLOAT, TSDataType.DOUBLE],
  columnCategories: [ColumnCategory.TAG, ColumnCategory.FIELD, ColumnCategory.FIELD],
  timestamps: [Date.now(), Date.now() + 1000],
  values: [['device_001', 25.5, 60.0], ['device_002', 26.0, 61.5]],
});
```

**Note:** TIME is reserved for internal use. When specifying columnCategories in TableTablet, only use TAG, FIELD, and ATTRIBUTE. Timestamps are handled separately via the timestamps array.

#### Deprecated Tablet (for backward compatibility)
```typescript
interface Tablet {
  deviceId: string;
  measurements: string[];
  dataTypes: number[]; // 0=BOOLEAN, 1=INT32, 2=INT64, 3=FLOAT, 4=DOUBLE, 5=TEXT
  timestamps: number[];
  values: any[][];
}
// Note: Use TreeTablet instead
```
```

#### QueryResult
```typescript
interface QueryResult {
  columns: string[];
  dataTypes: string[];
  rows: any[][];
  queryId?: number;
}
```

## Data Types

When using `insertTablet`, specify data types using these constants:

- `0` - BOOLEAN
- `1` - INT32
- `2` - INT64
- `3` - FLOAT
- `4` - DOUBLE
- `5` - TEXT

## Migration Guide

### Upgrading to the New API

The new version maintains full backward compatibility while adding new features. No changes are required for existing code, but you may want to adopt the new features:

#### Multi-Node with Different Ports

**Old way** (still works, but limited to same port):
```typescript
const pool = new SessionPool(
  ['node1', 'node2', 'node3'],
  6667,
  { username: 'root', password: 'root' }
);
```

**New way** (supports different ports per node with string format - RECOMMENDED):
```typescript
const pool = new SessionPool({
  nodeUrls: [
    'node1:6667',
    'node2:6668',
    'node3:6669',
  ],
  username: 'root',
  password: 'root',
});
```

**Alternative** (object format also supported):
```typescript
const pool = new SessionPool({
  nodeUrls: [
    { host: 'node1', port: 6667 },
    { host: 'node2', port: 6668 },
    { host: 'node3', port: 6669 },
  ],
  username: 'root',
  password: 'root',
});
```

#### Using Builder Pattern

**Old way** (still works):
```typescript
const session = new Session({
  host: 'localhost',
  port: 6667,
  username: 'root',
  password: 'root',
  fetchSize: 2048,
});
```

**New way** (more fluent):
```typescript
import { ConfigBuilder } from 'iotdb-client-nodejs';

const session = new Session(
  new ConfigBuilder()
    .host('localhost')
    .port(6667)
    .username('root')
    .password('root')
    .fetchSize(2048)
    .build()
);
```

#### Explicit Session Management

**Old way** (still works):
```typescript
// Pool automatically manages sessions
const result = await pool.executeQueryStatement('SELECT ...');
```

**New way** (more control):
```typescript
// Explicitly get and release sessions
const session = await pool.getSession();
try {
  const result1 = await session.executeQueryStatement('SELECT ...');
  const result2 = await session.executeQueryStatement('SELECT ...');
  // ... multiple operations with same session
} finally {
  pool.releaseSession(session);
}
```

## Technical Architecture

### Overview

The IoTDB Node.js client follows a three-layer architecture design, optimized for both single-session and high-concurrency scenarios:

```
┌─────────────────────────────────────────────────────┐
│  Application Layer (Your Code)                      │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  Pool Layer                                         │
│  ┌──────────────────┐    ┌──────────────────────┐  │
│  │  SessionPool     │    │ TableSessionPool     │  │
│  │  - Load Balance  │    │ - Database Context   │  │
│  │  - Pool Mgmt     │    │ - Pool Mgmt          │  │
│  └──────────────────┘    └──────────────────────┘  │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  Session Layer                                      │
│  ┌──────────────────────────────────────────────┐  │
│  │  Session                                     │  │
│  │  - Query / Non-Query                         │  │
│  │  - InsertTablet                              │  │
│  │  - Result Parsing                            │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  Connection Layer                                   │
│  ┌──────────────────────────────────────────────┐  │
│  │  Connection (Thrift)                         │  │
│  │  - TCP/SSL Transport                         │  │
│  │  - Session Lifecycle                         │  │
│  │  - Low-level Protocol                        │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                    ↓
              Apache IoTDB
```

### Core Components

#### 1. Connection Layer (`src/connection/Connection.ts`)
- Manages low-level Thrift connections over TCP or SSL/TLS
- Handles session lifecycle (open/close with sessionId/statementId)
- Implements TFramedTransport and TBinaryProtocol
- Supports single endpoint connections
- **Key Pattern**: One connection = one IoTDB node endpoint

#### 2. Session Layer (`src/client/Session.ts`)
- High-level API for database operations
- Methods: `executeQueryStatement()`, `executeNonQueryStatement()`, `insertTablet()`
- Handles query result parsing with SessionDataSet
- Supports pagination with configurable fetchSize
- **Key Pattern**: Uses first node from nodeUrls for single-session scenarios

#### 3. Pool Layer (`src/client/BaseSessionPool.ts`, `SessionPool.ts`, `TableSessionPool.ts`)
- Connection pooling with configurable min/max sizes
- Round-robin load balancing across multiple endpoints
- Automatic idle connection cleanup (maxIdleTime)
- Wait queue when pool exhausted (waitTimeout)
- Health checks and connection recycling
- **Key Pattern**: Distributes connections across all nodes in nodeUrls

#### 4. Configuration System (`src/utils/Config.ts`)
- Builder pattern for fluent configuration
- Support for both old (host/port) and new (nodeUrls) formats

#### 5. Tablet Type System

The client provides distinct tablet types for tree and table models:

**TreeTablet** (Timeseries Model):
- `deviceId`: Full path (e.g., "root.sg.device")
- `measurements`: Sensor names
- `dataTypes`: Type for each measurement
- `timestamps` and `values`: Time-series data

**TableTablet** (Relational Model):
- `tableName`: Table name (not a path)
- `columnNames`: All columns including tags, time, fields, attributes
- `columnTypes`: Type for each column
- `columnCategories`: Category (TAG, TIME, FIELD, ATTRIBUTE) for each column
- `timestamps` and `values`: Includes tag values in data

**Polymorphic insertTablet():**
Both `Session` and `TableSession` use the same method name with runtime type dispatch:
```typescript
// Works with TreeTablet
await session.insertTablet({ deviceId: '...', measurements: [...], ...});

// Works with TableTablet
await tableSession.insertTablet({ tableName: '...', columnNames: [...], ...});
```
- Type-safe with TypeScript interfaces
- Validation and default values

### Data Flow

#### Query Execution Flow
```
1. Application calls pool.executeQueryStatement()
2. Pool acquires available Session (round-robin)
3. Session sends query via Connection to IoTDB
4. IoTDB returns SessionDataSet with queryId
5. SessionDataSet fetches data in batches (fetchSize)
6. Application iterates results with hasNext()/next()
7. Session released back to pool
8. SessionDataSet.close() releases server resources
```

#### Insert Flow
```
1. Application calls pool.insertTablet()
2. Pool acquires available Session (round-robin)
3. Session serializes Tablet data by column
4. Data sent via Connection to IoTDB
5. IoTDB acknowledges write
6. Session released back to pool
```

### Thread Safety & Concurrency

- **Sessions**: Not thread-safe; use SessionPool for concurrency
- **SessionPool**: Thread-safe; internal locking for session management
- **Connection Lifecycle**: Managed automatically by pool
- **Load Balancing**: Round-robin assignment on session acquisition
- **Idle Cleanup**: Background task removes idle connections

### Thrift Integration

The client uses Apache Thrift for RPC communication:

- **Generated Code**: `src/thrift/generated/` from IoTDB's `.thrift` files
- **Protocol**: TBinaryProtocol (compact, efficient)
- **Transport**: TFramedTransport (message boundaries)
- **SSL Support**: Configurable TLS transport layer
- **Version**: Compatible with Apache IoTDB 1.0+

### Memory Management

- **SessionDataSet**: Lazy loading with pagination (default: 1024 rows/fetch)
- **Connection Pool**: Bounded size prevents resource exhaustion
- **Idle Cleanup**: Automatic connection cleanup after maxIdleTime
- **Result Sets**: Must call `close()` to release server resources

### Error Handling

- **Connection Errors**: Automatic retry with next node in pool
- **Timeout Handling**: Configurable query timeouts (default: 60s)
- **Pool Exhaustion**: Wait queue with timeout
- **Thrift Errors**: Wrapped in JavaScript errors with stack traces

### Configuration Patterns

#### Constructor Overloading
SessionPool/TableSessionPool support two constructor signatures:

```typescript
// New format (recommended):
new SessionPool({ nodeUrls: ["host1:6667", "host2:6667"] });

// Old format (backward compatible):
new SessionPool(["host1", "host2"], 6667, { /* options */ });
```

#### Builder Pattern
```typescript
const session = new Session(
  new ConfigBuilder()
    .host('localhost')
    .port(6667)
    .fetchSize(2048)
    .build()
);
```

## Development

### Prerequisites

- Node.js >= 14.0.0
- npm >= 6.0.0
- Apache Thrift compiler (optional, for regenerating Thrift files)
- Git

### Development Setup

1. Clone the repository:
```bash
git clone https://github.com/CritasWang/iotdb-client-nodejs.git
cd iotdb-client-nodejs
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

### Build System

The project uses a two-step build process:

1. **esbuild**: Fast TypeScript compilation
   - Configured in `esbuild.config.js`
   - Compiles `src/` to `dist/` directory
   - Excludes type declaration files

2. **tsc**: Type declaration generation
   - Generates `.d.ts` files for TypeScript support
   - Run with `--emitDeclarationOnly` flag
   - Ensures type safety for consumers

3. **copy:thrift**: Copy generated Thrift files
   - Copies `.js` files from `src/thrift/generated/` to `dist/thrift/generated/`
   - Required because Thrift code uses `require()` statements

Build commands:
```bash
npm run build          # Complete build (esbuild + tsc + copy)
npm run build:esbuild  # Only esbuild compilation
npm run build:types    # Only type declarations
```

### Development Workflow

1. **Make changes** in `src/` directory
2. **Build** with `npm run build`
3. **Test** with `npm test`
4. **Lint** with `npm run lint`
5. **Format** with `npm run format`

### Code Style

- Use TypeScript strict mode
- Follow existing code formatting (Prettier)
- Add JSDoc comments for public APIs
- Keep functions focused and concise
- Use async/await instead of callbacks
- Handle errors appropriately
- Prefer explicit types over `any`

### Regenerating Thrift Files

If you need to update to a newer version of IoTDB's Thrift definitions:

1. Download the latest Thrift files from Apache IoTDB:
```bash
git clone --depth 1 https://github.com/apache/iotdb.git /tmp/iotdb
```

2. Copy the Thrift files:
```bash
cp /tmp/iotdb/iotdb-protocol/thrift-datanode/src/main/thrift/client.thrift thrift/
cp /tmp/iotdb/iotdb-protocol/thrift-commons/src/main/thrift/common.thrift thrift/
```

3. Regenerate the Node.js client:
```bash
npm run generate:thrift
```

4. Test thoroughly to ensure compatibility

## Testing

### Test Structure

```
tests/
├── unit/           # Unit tests (fast, no external dependencies)
│   ├── Config.test.ts
│   ├── Logger.test.ts
│   └── ...
└── e2e/            # End-to-end tests (require IoTDB)
    ├── Session.test.ts
    ├── SessionPool.test.ts
    ├── TableSessionPool.test.ts
    └── ...
```

### Running Tests

Run all tests:
```bash
npm test
```

Run only unit tests:
```bash
npm run test:unit
```

Run only E2E tests (requires IoTDB instance):
```bash
export IOTDB_HOST=localhost
export IOTDB_PORT=6667
export IOTDB_USER=root
export IOTDB_PASSWORD=root
npm run test:e2e
```

### E2E Test Setup

E2E tests require a running IoTDB instance. You can use Docker Compose:

**Single Node (1c1d):**
```bash
docker-compose -f docker-compose-1c1d.yml up -d
```

**3-Node Cluster (3c3d):**
```bash
docker-compose -f docker-compose-3c3d.yml up -d
```

**Stop containers:**
```bash
docker-compose -f docker-compose-1c1d.yml down
```

### Test Patterns

#### Unit Test Example
```typescript
describe('ConfigBuilder', () => {
  test('should build config with all options', () => {
    const config = new ConfigBuilder()
      .host('localhost')
      .port(6667)
      .username('root')
      .password('root')
      .build();
    
    expect(config.host).toBe('localhost');
    expect(config.port).toBe(6667);
  });
});
```

#### E2E Test Example
```typescript
describe('Session E2E Tests', () => {
  let session: Session;

  beforeAll(async () => {
    session = new Session({
      host: process.env.IOTDB_HOST || 'localhost',
      port: parseInt(process.env.IOTDB_PORT || '6667'),
      username: process.env.IOTDB_USER || 'root',
      password: process.env.IOTDB_PASSWORD || 'root',
    });
    await session.open();
  }, 60000); // 60s timeout for connection

  afterAll(async () => {
    if (session?.isOpen()) {
      await session.close();
    }
  });

  test('should execute query', async () => {
    if (!session.isOpen()) return; // Skip if no connection
    
    const dataSet = await session.executeQueryStatement('SHOW DATABASES');
    const rows = await dataSet.toArray();
    expect(Array.isArray(rows)).toBe(true);
    await dataSet.close();
  });
});
```

### Test Coverage

Current test coverage:
- Unit tests: Core utilities (Config, Logger, data serialization)
- E2E tests: Session, SessionPool, TableSessionPool
- All data types tested simultaneously
- Multi-node scenarios tested
- Pool behavior tested (size limits, timeouts, cleanup)

### Debugging Tests

Debug single test:
```bash
npm run test:debug
```

Debug E2E tests:
```bash
npm run test:e2e:debug
```

Check for open handles:
```bash
npm run test:e2e:check-handles
```

## Performance Testing

Comprehensive benchmark tools are available in the `benchmark/` directory for performance testing and optimization.

### Overview

- **Tree Model Benchmark**: Tests timeseries data model using `insertTablet` API
- **Table Model Benchmark**: Tests relational data model using `insertTablet` API
- **Pre-generated Data**: Eliminates data generation overhead during testing
- **Concurrent Clients**: Simulates real-world high-concurrency scenarios
- **Detailed Metrics**: Throughput, latency, percentiles (P50, P90, P95, P99)

### Quick Start

Test benchmark infrastructure (no IoTDB required):
```bash
node benchmark/test-benchmark.js
```

Run tree model benchmark:
```bash
CLIENT_NUMBER=10 DEVICE_NUMBER=100 node benchmark/benchmark-tree.js
```

Run table model benchmark:
```bash
CLIENT_NUMBER=10 DEVICE_NUMBER=100 node benchmark/benchmark-table.js
```

### Key Configuration Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `CLIENT_NUMBER` | 10 | Number of concurrent clients |
| `DEVICE_NUMBER` | 100 | Number of devices to simulate |
| `SENSOR_NUMBER` | 10 | Number of sensors per device |
| `BATCH_SIZE_PER_WRITE` | 100 | Data rows per write operation |
| `TOTAL_DATA_POINTS` | 100000 | Total data points to generate |
| `POOL_MAX_SIZE` | 20 | Maximum connections in pool |

### Example: High Concurrency Test

```bash
CLIENT_NUMBER=50 \
DEVICE_NUMBER=1000 \
SENSOR_NUMBER=10 \
BATCH_SIZE_PER_WRITE=1000 \
TOTAL_DATA_POINTS=1000000 \
node benchmark/benchmark-tree.js
```

### Performance Metrics

The benchmark reports:
- **Execution Time**: Total test duration
- **Operations**: Total, successful, failed, success rate
- **Data Points**: Total points written
- **Throughput**: Operations/sec, Points/sec
- **Latency**: Min, Max, Average, P50, P90, P95, P99

### Sample Output

```
================================================================================
BENCHMARK RESULTS
================================================================================

[Execution Time]
  Duration:              45.23s (45234ms)

[Operations]
  Total Operations:      1000
  Successful:            998
  Failed:                2
  Success Rate:          99.80%

[Data Points]
  Total Points Written:  100,000

[Throughput]
  Operations/sec:        22.11
  Points/sec:            2,210

[Latency (ms)]
  Min:                   15.23ms
  Max:                   1250.45ms
  Average:               45.23ms
  P50 (Median):          42.15ms
  P90:                   78.45ms
  P95:                   95.23ms
  P99:                   125.67ms
================================================================================
```

### Performance Tuning Tips

1. **Optimize Batch Size**: Test different values (100-1000 rows)
2. **Adjust Concurrency**: Start with 10-20 clients, adjust based on results
3. **Use Connection Pooling**: Set appropriate `POOL_MIN_SIZE` and `POOL_MAX_SIZE`
4. **Pre-generate Data**: Use cached data for accurate results
5. **Monitor Resources**: Watch CPU, memory, disk I/O, and network

For complete documentation, see [benchmark/README.md](benchmark/README.md).

## Examples

See the `examples/` directory for more usage examples:

- `examples/basic-session.ts` - Basic session usage
- `examples/session-pool.ts` - SessionPool usage
- `examples/table-session-pool.ts` - TableSessionPool usage
- `examples/multi-node.ts` - Multi-node configuration
- `examples/ssl-connection.ts` - SSL/TLS connection

## Documentation

Comprehensive documentation is available in the [docs/](docs/) directory:

### User Guides

- **[Tree Model User Guide](docs/user-guide-tree.md)** - Complete guide for timeseries data model
- **[Table Model User Guide](docs/user-guide-table.md)** - Complete guide for relational data model
- **[SessionDataSet Guide](docs/sessiondataset-guide.md)** - Working with query results
- **[Data Types Reference](docs/data-types.md)** - Complete data type documentation
- **[TypeScript Examples](docs/typescript-examples.md)** - TypeScript usage guide

### Technical Documentation

- **[Implementation Guide](docs/implementation.md)** - Architecture and core components
- **[Thrift Documentation](docs/thrift.md)** - Thrift code generation
- **[Build Infrastructure](docs/development/build-infrastructure.md)** - Build system details

### For Contributors

- **[Contributing Guidelines](CONTRIBUTING.md)** - How to contribute
- **[Debugging E2E Tests](docs/development/debugging-e2e.md)** - Testing guide
- **[Test Database Reference](docs/development/test-database.md)** - Test setup

### Additional Resources

- **[Project Status](docs/project-status.md)** - Implementation status and roadmap
- **[Changelog](CHANGELOG.md)** - Version history
- **[GitHub Workflows](.github/workflows/README.md)** - CI/CD documentation

## Contributing

We welcome contributions from the community! Whether you're fixing bugs, adding features, improving documentation, or reporting issues, your help is appreciated.

### How to Contribute

1. **Fork the repository** on GitHub
2. **Create a feature branch** from `main`
3. **Make your changes** following our code style guidelines
4. **Add tests** for new functionality
5. **Update documentation** as needed
6. **Submit a pull request** with a clear description

### Development Guidelines

- Follow existing code style and conventions
- Write clear, concise commit messages
- Add unit tests for new features
- Ensure all tests pass before submitting PR
- Update CHANGELOG.md for notable changes
- Keep PRs focused on a single feature or fix

### Code Review Process

All submissions require review before merging:
1. Automated tests must pass (CI/CD)
2. Code review by maintainers
3. Documentation review (if applicable)
4. Final approval and merge

### Reporting Issues

When reporting bugs, please include:
- Node.js version
- IoTDB version
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Error messages and stack traces

For detailed contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Release Process

This project follows semantic versioning (SemVer) and maintains a regular release cycle.

### Version Numbering

Given a version number `MAJOR.MINOR.PATCH`:
- **MAJOR**: Breaking API changes
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes, backward compatible

### Release Workflow

#### 1. Pre-release Preparation

Update version and changelog:
```bash
# Update version in package.json
npm version [major|minor|patch] --no-git-tag-version

# Update CHANGELOG.md with release notes
# - New features
# - Bug fixes
# - Breaking changes
# - Deprecations
```

#### 2. Testing

Run comprehensive tests:
```bash
# Unit tests
npm run test:unit

# E2E tests (requires IoTDB)
export IOTDB_HOST=localhost
export IOTDB_PORT=6667
npm run test:e2e

# Linting
npm run lint

# Build verification
npm run build
```

#### 3. Version Tagging

Create and push version tag:
```bash
# Commit version bump
git add package.json CHANGELOG.md
git commit -m "chore: bump version to X.Y.Z"

# Create tag
git tag -a vX.Y.Z -m "Release vX.Y.Z"

# Push to remote
git push origin main
git push origin vX.Y.Z
```

#### 4. Publishing to npm

Build and publish:
```bash
# Build production assets
npm run build

# Publish to npm (requires npm account)
npm publish

# For beta/RC releases
npm publish --tag beta
```

#### 5. GitHub Release

Create GitHub release:
1. Go to GitHub Releases page
2. Click "Create a new release"
3. Select the version tag
4. Add release title: `v X.Y.Z - Release Name`
5. Copy changelog entries to release notes
6. Attach build artifacts (if applicable)
7. Publish release

### Release Checklist

- [ ] All tests passing
- [ ] CHANGELOG.md updated
- [ ] Version bumped in package.json
- [ ] Documentation updated
- [ ] Breaking changes documented
- [ ] Migration guide (for major versions)
- [ ] Git tag created
- [ ] npm package published
- [ ] GitHub release created
- [ ] Release announcement (if major)

### Release Schedule

- **Patch releases**: As needed for critical bugs
- **Minor releases**: Monthly or when features are ready
- **Major releases**: When breaking changes are necessary

### Beta/RC Releases

For testing before stable release:

```bash
# Create beta version
npm version 1.2.0-beta.1 --no-git-tag-version

# Publish with beta tag
npm publish --tag beta

# Install beta version
npm install iotdb-client-nodejs@beta
```

### Hotfix Process

For critical production issues:

1. Create hotfix branch from release tag
2. Fix the issue
3. Bump patch version
4. Tag and publish immediately
5. Merge back to main

### Post-release Tasks

- Update documentation site (if applicable)
- Announce on project channels
- Monitor for issues and feedback
- Prepare next release milestone

## License

Apache License 2.0

Copyright © 2024 Apache IoTDB

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

## References

- [Apache IoTDB](https://iotdb.apache.org/)
- [Apache IoTDB GitHub](https://github.com/apache/iotdb)
- [Apache IoTDB Documentation](https://iotdb.apache.org/UserGuide/Master/QuickStart/QuickStart.html)
- [Apache IoTDB C# Client](https://github.com/apache/iotdb-client-csharp)
- [Apache Thrift](https://thrift.apache.org/)