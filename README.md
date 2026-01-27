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

// Execute query statement
const result = await session.executeQueryStatement('SHOW DATABASES');
console.log('Columns:', result.columns);
console.log('Rows:', result.rows);

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

### Multi-Node Support

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

### Session

#### Constructor
```typescript
new Session(config: Partial<Config>)
```

#### Methods
- `async open(): Promise<void>` - Open the session
- `async close(): Promise<void>` - Close the session
- `async executeQueryStatement(sql: string): Promise<QueryResult>` - Execute a query
- `async executeNonQueryStatement(sql: string): Promise<void>` - Execute a non-query statement
- `async insertTablet(tablet: Tablet): Promise<void>` - Insert tablet data
- `isOpen(): boolean` - Check if session is open

### SessionPool

#### Constructor
```typescript
new SessionPool(hosts: string | string[], port: number, config?: Partial<PoolConfig>)
```

#### Methods
- `async init(): Promise<void>` - Initialize the pool
- `async close(): Promise<void>` - Close all connections
- `async executeQueryStatement(sql: string): Promise<QueryResult>` - Execute a query
- `async executeNonQueryStatement(sql: string): Promise<void>` - Execute a non-query statement
- `async insertTablet(tablet: Tablet): Promise<void>` - Insert tablet data
- `getPoolSize(): number` - Get current pool size
- `getAvailableSize(): number` - Get available connections

### TableSessionPool

Same as SessionPool but optimized for table model operations.

### Types

#### Config
```typescript
interface Config {
  host: string;
  port: number;
  username?: string;
  password?: string;
  database?: string;
  timezone?: string;
  fetchSize?: number;
  enableSSL?: boolean;
  sslOptions?: SSLOptions;
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