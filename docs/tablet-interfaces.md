# Tablet Interfaces Guide

## Overview

IoTDB Node.js client provides two distinct tablet interfaces for tree and table models, matching the design of C# and Java clients.

## TreeTablet - For Tree/Timeseries Model

Used with `Session` and `SessionPool` for timeseries data.

### Interface

```typescript
interface TreeTablet {
  deviceId: string;        // Full device path, e.g., "root.sg.device1"
  measurements: string[];  // Sensor names, e.g., ["temperature", "humidity"]
  dataTypes: number[];     // Data type for each measurement
  timestamps: number[];    // Timestamps in milliseconds
  values: any[][];         // Values array [rows][columns]
}
```

### Example

```typescript
await session.insertTreeTablet({
  deviceId: 'root.factory.workshop1.device1',
  measurements: ['temperature', 'humidity', 'pressure'],
  dataTypes: [TSDataType.FLOAT, TSDataType.FLOAT, TSDataType.DOUBLE],
  timestamps: [Date.now(), Date.now() + 1000, Date.now() + 2000],
  values: [
    [25.5, 60.0, 101.3],
    [26.0, 61.5, 101.2],
    [26.5, 62.0, 101.1],
  ],
});
```

## TableTablet - For Table/Relational Model

Used with `TableSessionPool` for relational data.

### Interface

```typescript
interface TableTablet {
  tableName: string;              // Table name
  columnNames: string[];          // All column names including time, tags, fields
  columnTypes: number[];          // Data type for each column
  columnCategories: ColumnCategory[];  // Category for each column
  timestamps: number[];           // Timestamps in milliseconds
  values: any[][];                // Values array [rows][columns]
}
```

### ColumnCategory Enum

Matches C# and Java client definitions:

```typescript
enum ColumnCategory {
  TAG = 0,        // Tag column - indexed for WHERE clause filtering
  FIELD = 1,      // Field column - measurement values
  ATTRIBUTE = 2,  // Attribute column - metadata not indexed
  TIME = 3,       // Time column (reserved for internal use only)
}
```

**Important:** TIME is reserved for internal use. Do not use it in columnCategories arrays. Timestamps are handled separately via the timestamps array.

### Example

```typescript
await tablePool.insertTablet({
  tableName: 'sensor_data',
  columnNames: ['device_id', 'model', 'temperature', 'humidity'],
  columnTypes: [
    TSDataType.STRING,
    TSDataType.STRING,
    TSDataType.FLOAT,
    TSDataType.FLOAT
  ],
  columnCategories: [
    ColumnCategory.TAG,        // device_id - indexed tag
    ColumnCategory.ATTRIBUTE,  // model - metadata
    ColumnCategory.FIELD,      // temperature - measurement
    ColumnCategory.FIELD       // humidity - measurement
  ],
  timestamps: [Date.now(), Date.now() + 1000],
  values: [
    ['device_001', 'model_A', 25.5, 60.0],
    ['device_001', 'model_A', 26.0, 61.5],
  ],
});
```

## Column Categories Explained

### TAG
- Used to identify devices or entities
- Typically indexed for fast lookups
- Example: device_id, sensor_id

### FIELD
- Actual measurement values
- The data being recorded
- Example: temperature, humidity, pressure

### ATTRIBUTE
- Metadata about the device or measurement
- Static or slowly changing values
- Example: model, location, version

### TIME
- Timestamp column
- Only one TIME column per table
- Always required

## Migration from Old Tablet Interface

### Before (Deprecated)

```typescript
await session.insertTablet({
  deviceId: 'root.test.device1',
  measurements: ['sensor1'],
  dataTypes: [TSDataType.FLOAT],
  timestamps: [Date.now()],
  values: [[25.5]],
});
```

### After (Tree Model)

```typescript
await session.insertTreeTablet({
  deviceId: 'root.test.device1',
  measurements: ['sensor1'],
  dataTypes: [TSDataType.FLOAT],
  timestamps: [Date.now()],
  values: [[25.5]],
});
```

### After (Table Model)

```typescript
await tablePool.insertTablet({
  tableName: 'my_table',
  columnNames: ['device_id', 'sensor1'],
  columnTypes: [TSDataType.STRING, TSDataType.FLOAT],
  columnCategories: [ColumnCategory.TAG, ColumnCategory.FIELD],
  timestamps: [Date.now()],
  values: [['device_001', 25.5]],
});
```

## Backward Compatibility

The old `insertTablet()` method is still available but deprecated. It internally calls `insertTreeTablet()` for backward compatibility.

## See Also

- [Tree Model User Guide](user-guide-tree.md)
- [Table Model User Guide](user-guide-table.md)
- [Data Types Reference](data-types.md)
