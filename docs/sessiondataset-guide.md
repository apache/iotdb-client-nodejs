# SessionDataSet Iterator Pattern Guide

This guide explains how to use the SessionDataSet iterator pattern for efficiently querying large datasets from Apache IoTDB.

## Overview

The SessionDataSet provides an iterator-based approach to reading query results, similar to JDBC ResultSet or database cursors. This approach offers several advantages over loading all data into memory at once:

- **Memory Efficient**: Only keeps the current batch in memory
- **Lazy Loading**: Fetches data on-demand as you iterate
- **Large Datasets**: Can handle result sets larger than available RAM
- **Resource Management**: Proper cleanup of server-side resources

## Basic Usage

### Simple Iteration

```typescript
import { Session } from 'iotdb-client-nodejs';

const session = new Session({
  host: 'localhost',
  port: 6667,
  username: 'root',
  password: 'root',
});

await session.open();

// Execute query and get SessionDataSet
const dataSet = await session.executeQueryStatement('SELECT * FROM root.test.d1');

// Iterate through results
while (await dataSet.hasNext()) {
  const row = dataSet.next();
  
  // Access timestamp
  const timestamp = row.getTimestamp();
  
  // Access values by column name
  const temperature = row.getFloat('temperature');
  const humidity = row.getDouble('humidity');
  const status = row.getString('status');
  
  console.log(`${timestamp}: temp=${temperature}, humidity=${humidity}, status=${status}`);
}

// Always close the dataset when done
await dataSet.close();

await session.close();
```

## API Reference

### SessionDataSet

#### Methods

##### `hasNext(): Promise<boolean>`
Checks if there are more rows available. This may trigger fetching the next batch from the server.

```typescript
while (await dataSet.hasNext()) {
  // Process next row
}
```

##### `next(): RowRecord`
Returns the next row. Must call `hasNext()` first to ensure a row is available.

```typescript
if (await dataSet.hasNext()) {
  const row = dataSet.next();
}
```

##### `close(): Promise<void>`
Closes the dataset and releases server-side resources. Always call this when done.

```typescript
await dataSet.close();
```

##### `getColumnNames(): string[]`
Returns array of column names.

```typescript
const columns = dataSet.getColumnNames();
console.log('Columns:', columns); // ['temperature', 'humidity', 'status']
```

##### `getColumnTypes(): string[]`
Returns array of column data types.

```typescript
const types = dataSet.getColumnTypes();
console.log('Types:', types); // ['FLOAT', 'DOUBLE', 'TEXT']
```

##### `findColumn(columnName: string): number`
Returns the zero-based index of a column by name.

```typescript
const tempIndex = dataSet.findColumn('temperature'); // Returns 0
```

##### `toArray(): Promise<any[][]>` (Deprecated)
Loads all remaining rows into memory as an array. Use only for small result sets.

```typescript
// ⚠️ Not recommended for large datasets
const allRows = await dataSet.toArray();
```

### RowRecord

Represents a single row of data from the query result.

#### Methods

##### Timestamp Access

```typescript
const timestamp = row.getTimestamp(); // Returns number (milliseconds)
```

##### Access by Column Name

```typescript
// Typed getters
const stringValue = row.getString('name');
const intValue = row.getInt('count');
const longValue = row.getLong('id');
const floatValue = row.getFloat('temperature');
const doubleValue = row.getDouble('humidity');
const boolValue = row.getBoolean('status');

// Generic getter (returns any)
const value = row.getValue('columnName');
```

##### Access by Column Index

```typescript
const stringValue = row.getStringByIndex(0);
const intValue = row.getIntByIndex(1);
const floatValue = row.getFloatByIndex(2);
const value = row.getValueByIndex(3);
```

##### Null Checking

```typescript
if (row.isNull('optionalColumn')) {
  console.log('Column is null');
} else {
  const value = row.getString('optionalColumn');
}

// By index
if (row.isNullByIndex(0)) {
  console.log('First column is null');
}
```

##### Get All Data

```typescript
const fields = row.getFields(); // Returns array of field values
const array = row.toArray(); // Returns [timestamp, ...fields]
```

## Advanced Usage

### Configuring Fetch Size

Control how many rows are fetched in each batch:

```typescript
const session = new Session({
  host: 'localhost',
  port: 6667,
  fetchSize: 1024, // Fetch 1024 rows at a time
});

const dataSet = await session.executeQueryStatement('SELECT * FROM root.test.d1');
// Will automatically fetch in batches of 1024 rows
```

### Processing Large Result Sets

For very large result sets, use iterator pattern to avoid memory issues:

```typescript
const dataSet = await session.executeQueryStatement('SELECT * FROM root.large_dataset');

let count = 0;
let sum = 0;

while (await dataSet.hasNext()) {
  const row = dataSet.next();
  sum += row.getDouble('value');
  count++;
  
  // Log progress every 10000 rows
  if (count % 10000 === 0) {
    console.log(`Processed ${count} rows...`);
  }
}

console.log(`Total rows: ${count}, Average: ${sum / count}`);

await dataSet.close();
```

### Error Handling

Always use try-finally to ensure cleanup:

```typescript
let dataSet;
try {
  dataSet = await session.executeQueryStatement('SELECT * FROM root.test.d1');
  
  while (await dataSet.hasNext()) {
    const row = dataSet.next();
    // Process row
  }
} catch (error) {
  console.error('Query error:', error);
  throw error;
} finally {
  if (dataSet) {
    await dataSet.close();
  }
}
```

### Working with Multiple Columns

```typescript
const dataSet = await session.executeQueryStatement(`
  SELECT temperature, humidity, pressure, status
  FROM root.weather.station1
  WHERE time > now() - 1h
`);

while (await dataSet.hasNext()) {
  const row = dataSet.next();
  
  const reading = {
    timestamp: new Date(row.getTimestamp()),
    temperature: row.getFloat('temperature'),
    humidity: row.getFloat('humidity'),
    pressure: row.getFloat('pressure'),
    status: row.getString('status'),
  };
  
  // Process reading
  if (!row.isNull('status') && reading.temperature > 30) {
    console.log('High temperature alert:', reading);
  }
}

await dataSet.close();
```

### Aggregation Queries

```typescript
const dataSet = await session.executeQueryStatement(`
  SELECT AVG(temperature), MAX(temperature), MIN(temperature)
  FROM root.test.d1
  GROUP BY ([2024-01-01, 2024-02-01), 1d)
`);

while (await dataSet.hasNext()) {
  const row = dataSet.next();
  
  console.log({
    timestamp: new Date(row.getTimestamp()),
    avg: row.getDouble('AVG(temperature)'),
    max: row.getDouble('MAX(temperature)'),
    min: row.getDouble('MIN(temperature)'),
  });
}

await dataSet.close();
```

## Migration from Old Pattern

The old pattern loaded all data into memory at once. The new pattern uses lazy loading with iterators.

### Old Approach (No Longer Supported)

```typescript
// ❌ This no longer works - executeQueryStatement now returns SessionDataSet
// const result = await session.executeQueryStatement('SELECT * FROM root.test.d1');
// for (const row of result.rows) {
//   const timestamp = row[0];
//   const value1 = row[1];
//   const value2 = row[2];
//   console.log(timestamp, value1, value2);
// }
```

### New Approach (Current Implementation)

```typescript
// ✅ New way - lazy loading with iterator
const dataSet = await session.executeQueryStatement('SELECT * FROM root.test.d1');

while (await dataSet.hasNext()) {
  const row = dataSet.next();
  
  const timestamp = row.getTimestamp();
  const value1 = row.getValueByIndex(0);
  const value2 = row.getValueByIndex(1);
  
  console.log(timestamp, value1, value2);
}

await dataSet.close();
```

### Migration Steps

1. **Change method call**: `executeQueryStatement()` now returns `SessionDataSet` (not `QueryResult`)
2. **Replace array access**: Use iterator pattern instead of `result.rows`
3. **Update row access**: Use `RowRecord` methods instead of array indices
4. **Add cleanup**: Always call `await dataSet.close()`

### For Small Datasets

If you need all data at once for small result sets, use `toArray()`:

```typescript
const dataSet = await session.executeQueryStatement('SELECT * FROM root.test.d1');
const allRows = await dataSet.toArray(); // Loads everything into memory
// allRows is [[timestamp, value1, value2], ...]
```

⚠️ **Warning**: `toArray()` loads all data into memory. Only use for small result sets.

## Best Practices

1. **Always Close**: Use try-finally to ensure `dataSet.close()` is called
2. **Check hasNext()**: Always call `hasNext()` before calling `next()`
3. **Use Fetch Size**: Set appropriate fetch size based on memory and network
4. **Handle Nulls**: Check `isNull()` before accessing nullable columns
5. **Typed Access**: Use typed getters (`getInt`, `getString`) for type safety
6. **Avoid toArray()**: Don't use `toArray()` for large datasets

## Performance Tips

1. **Fetch Size**: Larger fetch size = fewer network calls, more memory used
   - Small datasets: 100-1000
   - Large datasets: 1000-10000
   - Very large: 10000-50000

2. **Batch Processing**: Process rows in batches for better performance

```typescript
const dataSet = await session.executeQueryStatement('SELECT * FROM root.test.d1');
const batch = [];

while (await dataSet.hasNext()) {
  batch.push(dataSet.next());
  
  if (batch.length >= 1000) {
    await processBatch(batch);
    batch.length = 0;
  }
}

if (batch.length > 0) {
  await processBatch(batch);
}

await dataSet.close();
```

3. **Column Access**: Access by index is slightly faster than by name

```typescript
// Faster
const value = row.getIntByIndex(0);

// Slightly slower (name lookup)
const value = row.getInt('temperature');
```

## Troubleshooting

### "No more rows available" Error

```typescript
// ❌ Wrong - calling next() without checking hasNext()
const row = dataSet.next(); // May throw error

// ✅ Correct
if (await dataSet.hasNext()) {
  const row = dataSet.next();
}
```

### "Column not found" Error

```typescript
// Make sure column names match exactly (case-sensitive)
const columns = dataSet.getColumnNames();
console.log('Available columns:', columns);

// Use correct column name
const value = row.getString('temperature'); // Not 'Temperature' or 'temp'
```

### Memory Issues

```typescript
// ❌ Don't do this with large datasets
const allRows = await dataSet.toArray(); // Loads everything into memory

// ✅ Process iteratively instead
while (await dataSet.hasNext()) {
  const row = dataSet.next();
  // Process and discard each row
}
```

## See Also

- [Implementation Guide](implementation.md)
- [Data Types Reference](data-types.md)
- [TypeScript Examples](typescript-examples.md)
