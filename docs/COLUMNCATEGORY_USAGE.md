# ColumnCategory Usage Guide

## Overview

The `ColumnCategory` enum is used in IoTDB's table model to categorize columns. This guide clarifies the correct usage.

## Enum Definition

```typescript
enum ColumnCategory {
  TAG = 0,        // Tag column - indexed for WHERE clause filtering
  FIELD = 1,      // Field column - measurement values
  ATTRIBUTE = 2,  // Attribute column - metadata not indexed
  TIME = 3,       // Time column (reserved for internal use only)
}
```

## Important: TIME is Internal Only

**The TIME category is reserved for internal use and should NOT be used in user code.**

When creating a `TableTablet`, only use:
- `ColumnCategory.TAG`
- `ColumnCategory.FIELD`
- `ColumnCategory.ATTRIBUTE`

## Why TIME Exists in the Enum

The `TIME` category exists to match the Java and C# client implementations. However:
- **Timestamps are handled separately** via the `timestamps` array parameter
- **Do not include timestamp columns** in `columnNames` or `columnCategories`
- The TIME category is used internally by IoTDB, not by users

## Correct Usage Example

```typescript
import { TableSessionPool, ColumnCategory, TSDataType } from 'iotdb-client-nodejs';

await pool.insertTablet({
  tableName: 'sensor_data',
  columnNames: ['device_id', 'region', 'model', 'temperature', 'humidity'],
  columnTypes: [
    TSDataType.TEXT,    // device_id
    TSDataType.TEXT,    // region
    TSDataType.TEXT,    // model
    TSDataType.FLOAT,   // temperature
    TSDataType.DOUBLE   // humidity
  ],
  columnCategories: [
    ColumnCategory.TAG,        // device_id - indexed for filtering
    ColumnCategory.TAG,        // region - indexed for filtering
    ColumnCategory.ATTRIBUTE,  // model - metadata
    ColumnCategory.FIELD,      // temperature - measurement
    ColumnCategory.FIELD,      // humidity - measurement
  ],
  timestamps: [Date.now(), Date.now() + 1000],  // Timestamps here, not in values
  values: [
    ['device_001', 'region1', 'ModelA', 25.5, 60.0],
    ['device_002', 'region1', 'ModelB', 26.0, 61.5],
  ],
});
```

## Common Mistakes

### ❌ Wrong: Including timestamp column

```typescript
// DON'T DO THIS
await pool.insertTablet({
  tableName: 'sensor_data',
  columnNames: ['device_id', 'timestamp', 'temperature'],  // ❌
  columnTypes: [TSDataType.TEXT, TSDataType.TIMESTAMP, TSDataType.FLOAT],
  columnCategories: [
    ColumnCategory.TAG,
    ColumnCategory.TIME,   // ❌ Never use TIME
    ColumnCategory.FIELD
  ],
  timestamps: [Date.now()],
  values: [['device_001', Date.now(), 25.5]],  // ❌ Timestamp in values
});
```

### ✅ Correct: Timestamp separate

```typescript
// DO THIS
await pool.insertTablet({
  tableName: 'sensor_data',
  columnNames: ['device_id', 'temperature'],  // ✅
  columnTypes: [TSDataType.TEXT, TSDataType.FLOAT],
  columnCategories: [
    ColumnCategory.TAG,    // ✅
    ColumnCategory.FIELD   // ✅
  ],
  timestamps: [Date.now()],  // ✅ Timestamps handled separately
  values: [['device_001', 25.5]],  // ✅
});
```

## Column Category Purposes

### TAG (0) - Indexed Columns
- Used for filtering in WHERE clauses
- Automatically indexed by IoTDB
- Examples: device_id, region_id, sensor_type
- Use when you need to query by this column

### FIELD (1) - Measurement Values
- Stores actual measurement data
- Examples: temperature, humidity, pressure
- Use for time-series data values

### ATTRIBUTE (2) - Metadata
- Stores descriptive metadata
- Not indexed (slower for filtering)
- Examples: device_model, firmware_version, manufacturer
- Use when you don't need to filter by this column

## Array Alignment

Ensure these arrays have the same length:
- `columnNames` - Names of all columns (except timestamp)
- `columnTypes` - TSDataType for each column
- `columnCategories` - ColumnCategory for each column

The `timestamps` and `values` arrays should align:
- `timestamps.length` = number of rows
- `values.length` = number of rows
- `values[i].length` = `columnNames.length` for each row

## Migration from Incorrect Usage

If your code currently uses `ColumnCategory.TIME`:

1. Remove the timestamp column from `columnNames`
2. Remove the TIMESTAMP type from `columnTypes`
3. Remove `ColumnCategory.TIME` from `columnCategories`
4. Remove timestamp values from the `values` array
5. Ensure timestamps are only in the `timestamps` array

## References

- [Table Model User Guide](./user-guide-table.md)
- [Tablet Interfaces](./tablet-interfaces.md)
- [Tree Model vs Table Model](./user-guide-tree.md)
