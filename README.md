# Apache IoTDB Node.js Client

[![License](https://img.shields.io/badge/license-Apache%202-4EB1BA.svg)](https://www.apache.org/licenses/LICENSE-2.0.html)

A Node.js client for Apache IoTDB with support for SessionPool and TableSessionPool, providing efficient connection management and comprehensive query capabilities.

## Features

- **Session Management**: Single session with query, non-query, and insertTablet operations
- **SessionPool**: Connection pooling for high-concurrency scenarios
- **TableSessionPool**: Specialized pool for table model operations
- **Multi-Node Support**: Round-robin load balancing across multiple IoTDB nodes
- **SSL/TLS Support**: Secure connections with customizable SSL options
- **TypeScript Support**: Full TypeScript definitions included
- **Comprehensive Testing**: Unit and E2E tests included

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

// Execute query statement with default timeout (60 seconds)
const result = await session.executeQueryStatement('SHOW DATABASES');
console.log('Columns:', result.columns);
console.log('Rows:', result.rows);

// Execute query with custom timeout (30 seconds)
const customResult = await session.executeQueryStatement('SELECT * FROM root.test.**', 30000);

// Insert tablet data
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

#### Method 1: Using nodeUrls (Recommended for Different Ports)

When nodes have different host:port combinations, use the `nodeUrls` configuration:

```typescript
import { SessionPool, PoolConfigBuilder } from 'iotdb-client-nodejs';

// Using config object
const pool1 = new SessionPool({
  nodeUrls: [
    { host: 'node1.example.com', port: 6667 },
    { host: 'node2.example.com', port: 6668 },
    { host: 'node3.example.com', port: 6669 },
  ],
  username: 'root',
  password: 'root',
  maxPoolSize: 15,
  minPoolSize: 3,
});

// Or using Builder pattern
const pool2 = new SessionPool(
  new PoolConfigBuilder()
    .nodeUrls([
      { host: 'node1.example.com', port: 6667 },
      { host: 'node2.example.com', port: 6668 },
      { host: 'node3.example.com', port: 6669 },
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

#### Method 2: Traditional API (For Same Port)

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
  nodeUrls?: EndPoint[];  // Alternative to host/port for multi-node
  username?: string;
  password?: string;
  database?: string;
  timezone?: string;
  fetchSize?: number;
  enableSSL?: boolean;
  sslOptions?: SSLOptions;
}
```

**Note:** Either `host`/`port` OR `nodeUrls` must be provided. Use `nodeUrls` when nodes have different ports.

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
interface Tablet {
  deviceId: string;
  measurements: string[];
  dataTypes: number[]; // 0=BOOLEAN, 1=INT32, 2=INT64, 3=FLOAT, 4=DOUBLE, 5=TEXT
  timestamps: number[];
  values: any[][];
}
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

**New way** (supports different ports per node):
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

## Development

### Build

```bash
npm install
npm run build
```

### Run Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run E2E tests (requires IoTDB instance)
export IOTDB_HOST=localhost
export IOTDB_PORT=6667
npm run test:e2e
```

### Linting

```bash
npm run lint
```

## Examples

See the `examples/` directory for more usage examples:

- `examples/basic-session.ts` - Basic session usage
- `examples/session-pool.ts` - SessionPool usage
- `examples/table-session-pool.ts` - TableSessionPool usage
- `examples/multi-node.ts` - Multi-node configuration
- `examples/ssl-connection.ts` - SSL/TLS connection

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

Apache License 2.0

## References

- [Apache IoTDB](https://iotdb.apache.org/)
- [Apache IoTDB GitHub](https://github.com/apache/iotdb)
- [Apache IoTDB C# Client](https://github.com/apache/iotdb-client-csharp)