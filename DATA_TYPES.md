# IoTDB Data Types Support

This document describes the complete set of IoTDB data types supported by the Node.js client.

## Supported Data Types

The IoTDB Node.js client now supports all IoTDB data types:

| Type Code | Type Name | Description | JavaScript Type | Storage Size |
|-----------|-----------|-------------|-----------------|--------------|
| 0 | BOOLEAN | Boolean value | `boolean` | 1 byte |
| 1 | INT32 | 32-bit signed integer | `number` | 4 bytes |
| 2 | INT64 | 64-bit signed integer | `bigint` | 8 bytes |
| 3 | FLOAT | 32-bit floating point | `number` | 4 bytes |
| 4 | DOUBLE | 64-bit floating point | `number` | 8 bytes |
| 5 | TEXT | UTF-8 encoded text | `string` | Variable (4-byte length + content) |
| 6 | BLOB | Binary data | `Buffer` | Variable (4-byte length + content) |
| 7 | STRING | UTF-8 encoded string | `string` | Variable (4-byte length + content) |
| 8 | DATE | Date (days since epoch) | `Date` | 4 bytes |
| 9 | TIMESTAMP | Timestamp (milliseconds) | `Date` | 8 bytes |

## Usage Examples

### Creating Timeseries

```typescript
import { Session } from 'iotdb-client-nodejs';

const session = new Session({
  host: 'localhost',
  port: 6667,
  username: 'root',
  password: 'root'
});

await session.open();

// Create database
await session.executeNonQueryStatement('CREATE DATABASE root.test');

// Create timeseries with different data types
await session.executeNonQueryStatement(
  'CREATE TIMESERIES root.test.device1.boolean_sensor WITH DATATYPE=BOOLEAN, ENCODING=PLAIN'
);

await session.executeNonQueryStatement(
  'CREATE TIMESERIES root.test.device1.int32_sensor WITH DATATYPE=INT32, ENCODING=RLE'
);

await session.executeNonQueryStatement(
  'CREATE TIMESERIES root.test.device1.float_sensor WITH DATATYPE=FLOAT, ENCODING=RLE'
);

await session.executeNonQueryStatement(
  'CREATE TIMESERIES root.test.device1.text_sensor WITH DATATYPE=TEXT, ENCODING=PLAIN'
);
```

### Inserting Data with All Types

```typescript
const now = Date.now();

const tablet = {
  deviceId: 'root.test.device1',
  measurements: [
    'boolean_sensor',
    'int32_sensor',
    'int64_sensor',
    'float_sensor',
    'double_sensor',
    'text_sensor'
  ],
  dataTypes: [0, 1, 2, 3, 4, 5], // BOOLEAN, INT32, INT64, FLOAT, DOUBLE, TEXT
  timestamps: [now, now + 1, now + 2],
  values: [
    [true, 100, 1000n, 1.23, 4.56, 'hello'],
    [false, 200, 2000n, 2.34, 5.67, 'world'],
    [true, 300, 3000n, 3.45, 6.78, 'test'],
  ],
};

await session.insertTablet(tablet);
```

### Working with BLOB Data

```typescript
// Insert BLOB data
const tablet = {
  deviceId: 'root.test.device1',
  measurements: ['blob_sensor'],
  dataTypes: [6], // BLOB
  timestamps: [Date.now()],
  values: [
    [Buffer.from([0x01, 0x02, 0x03, 0x04])],
  ],
};

await session.insertTablet(tablet);

// Query BLOB data
const result = await session.executeQueryStatement(
  'SELECT blob_sensor FROM root.test.device1'
);

// Result will contain Buffer objects
const blobData = result.rows[0][1]; // Buffer
console.log(blobData); // <Buffer 01 02 03 04>
```

### Working with DATE and TIMESTAMP

```typescript
// DATE type stores dates without time
const tablet = {
  deviceId: 'root.test.device1',
  measurements: ['date_sensor', 'timestamp_sensor'],
  dataTypes: [8, 9], // DATE, TIMESTAMP
  timestamps: [Date.now()],
  values: [
    [new Date('2024-01-15'), new Date('2024-01-15T10:30:00Z')],
  ],
};

await session.insertTablet(tablet);

// Query returns Date objects
const result = await session.executeQueryStatement(
  'SELECT date_sensor, timestamp_sensor FROM root.test.device1'
);

const dateValue = result.rows[0][1]; // Date object
const timestampValue = result.rows[0][2]; // Date object
```

### Query Results with All Types

```typescript
const result = await session.executeQueryStatement(
  'SELECT * FROM root.test.device1'
);

for (const row of result.rows) {
  console.log({
    timestamp: row[0],      // bigint
    boolean: row[1],        // boolean
    int32: row[2],          // number
    int64: row[3],          // bigint
    float: row[4],          // number
    double: row[5],         // number
    text: row[6],           // string
  });
}
```

## Type Conversions

### JavaScript to IoTDB

| JavaScript Type | IoTDB Type | Notes |
|-----------------|------------|-------|
| `boolean` | BOOLEAN | Direct mapping |
| `number` | INT32, FLOAT, DOUBLE | Depends on dataType specified |
| `bigint` | INT64, TIMESTAMP | Direct mapping |
| `string` | TEXT, STRING | UTF-8 encoded |
| `Buffer` | BLOB | Binary data |
| `Date` | DATE, TIMESTAMP | Converted to days or milliseconds |

### IoTDB to JavaScript

| IoTDB Type | JavaScript Type | Notes |
|------------|-----------------|-------|
| BOOLEAN | `boolean` | true/false |
| INT32 | `number` | 32-bit integer |
| INT64 | `bigint` | 64-bit integer (may lose precision if converted to number) |
| FLOAT | `number` | Single precision |
| DOUBLE | `number` | Double precision |
| TEXT | `string` | UTF-8 decoded |
| BLOB | `Buffer` | Raw binary data |
| STRING | `string` | UTF-8 decoded |
| DATE | `Date` | Days since epoch converted to Date |
| TIMESTAMP | `Date` | Milliseconds since epoch |

## Null Values

All data types support null values. Null values are represented using a bitmap in the binary protocol:

```typescript
// Query results may contain null values
const result = await session.executeQueryStatement('SELECT * FROM root.test.device1');

for (const row of result.rows) {
  if (row[1] === null) {
    console.log('Value is null');
  }
}
```

## Best Practices

1. **Use appropriate data types**: Choose the smallest type that fits your data to optimize storage
2. **INT64 for large integers**: Use `bigint` in JavaScript for values that exceed Number.MAX_SAFE_INTEGER
3. **FLOAT vs DOUBLE**: Use FLOAT (4 bytes) for sensor data where precision is less critical
4. **TEXT vs STRING**: Both are UTF-8 strings; use based on IoTDB version compatibility
5. **DATE for dates only**: Use DATE type when you only need date precision (not time of day)
6. **TIMESTAMP for full datetime**: Use TIMESTAMP when you need millisecond precision

## Encoding Options

Different data types support different encoding methods for compression:

- **BOOLEAN**: PLAIN, RLE
- **INT32/INT64**: PLAIN, RLE, TS_2DIFF, GORILLA
- **FLOAT/DOUBLE**: PLAIN, RLE, TS_2DIFF, GORILLA
- **TEXT/STRING**: PLAIN
- **BLOB**: PLAIN

Example:
```typescript
await session.executeNonQueryStatement(
  'CREATE TIMESERIES root.test.device1.sensor WITH DATATYPE=INT32, ENCODING=RLE'
);
```

## Testing

A comprehensive test suite covering all data types is available in `tests/e2e/AllDataTypes.test.ts`. This test:

- Creates timeseries with all data types
- Inserts data with proper type conversions
- Queries and validates returned data types
- Tests null value handling
- Verifies aggregation queries work with different types

Run the test with:
```bash
npm run test:e2e -- --testPathPattern=AllDataTypes
```

## Compatibility

This client supports IoTDB versions that include these data types. For older IoTDB versions:
- Types 0-5 (BOOLEAN through TEXT) are universally supported
- Types 6-9 (BLOB, STRING, DATE, TIMESTAMP) require newer IoTDB versions (check your IoTDB version)

If you use unsupported types, you'll receive an error from the IoTDB server during timeseries creation.
