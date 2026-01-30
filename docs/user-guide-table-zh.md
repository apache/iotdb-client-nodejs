# Apache IoTDB Node.js Client - 表模型用户指南

> **版本**: 1.0.0  
> **最后更新**: 2024

## 目录

- [1. 简介](#1-简介)
- [2. 安装](#2-安装)
- [3. 快速入门](#3-快速入门)
- [4. TableSessionPool API](#4-tablesessionpool-api)
- [5. 配置构建器](#5-配置构建器)
- [6. 数据类型](#6-数据类型)
- [7. 代码示例](#7-代码示例)
- [8. 最佳实践](#8-最佳实践)
- [9. 故障排查](#9-故障排查)

## 1. 简介

### 1.1 概述

Apache IoTDB Node.js Client 为表模型(关系数据模型)提供了原生支持,使用类 SQL 的表操作实现结构化数据的高效管理。本指南涵盖了表模型操作的 TableSessionPool API。

### 1.2 表模型特性

IoTDB 中的表模型采用关系格式组织数据:

- **基于数据库的组织**: 创建和管理包含多个表的数据库
- **表模式**: 使用标签(Tag)、属性(Attribute)和字段(Field)定义表
- **SQL 操作**: 使用熟悉的 SQL 语法进行查询和数据操作
- **连接池**: 为高并发场景提供内置连接池
- **自动上下文**: 使用 `USE DATABASE` 进行数据库上下文管理

### 1.3 核心概念

- **数据库(Database)**: 相关表的逻辑分组
- **表(Table)**: 包含列和列类别的模式定义
- **标签(Tag)**: 时间序列标识符(已索引,用于 WHERE 子句)
- **属性(Attribute)**: 时间序列元数据(未索引)
- **字段(Field)**: 实际测量值

### 1.4 表模型 vs 树模型

| 方面 | 表模型 | 树模型 |
|--------|-------------|------------|
| 组织方式 | 关系表 | 分层路径 |
| 模式 | 显式表模式 | 时间序列定义 |
| 查询语言 | 标准 SQL | 带路径的 IoTDB SQL |
| 使用场景 | 结构化关系数据 | 分层 IoT 数据 |
| 数据模型 | 标签 + 属性 + 字段 | 设备 + 测点 |

## 2. 安装

### 2.1 从 npm 安装

```bash
npm install iotdb-client-nodejs
```

**系统要求:**
- Node.js >= 14.0.0
- Apache IoTDB >= 1.0.0 (支持表模型)

### 2.2 在项目中导入

**TypeScript:**
```typescript
import { TableSessionPool, PoolConfigBuilder, TableTablet, ColumnCategory, TSDataType } from 'iotdb-client-nodejs';
```

**JavaScript:**
```javascript
const { TableSessionPool, PoolConfigBuilder, TableTablet, ColumnCategory, TSDataType } = require('iotdb-client-nodejs');
```

## 3. 快速入门

### 3.1 基础 TableSessionPool 示例

```typescript
import { TableSessionPool, TableTablet, ColumnCategory } from 'iotdb-client-nodejs';

async function quickStart() {
  // 创建并初始化表 session 连接池
  const pool = new TableSessionPool('localhost', 6667, {
    username: 'root',
    password: 'root',
    database: 'test_db', // 可选: 设置默认数据库
    maxPoolSize: 10,
    minPoolSize: 2,
  });
  
  await pool.open();
  
  try {
    // 创建数据库
    await pool.executeNonQueryStatement('CREATE DATABASE test_db');
    
    // 使用数据库
    await pool.executeNonQueryStatement('USE test_db');
    
    // 创建表
    await pool.executeNonQueryStatement(`
      CREATE TABLE sensor_data (
        region_id STRING TAG,
        device_id STRING TAG,
        model STRING ATTRIBUTE,
        temperature FLOAT FIELD,
        humidity DOUBLE FIELD
      ) WITH (TTL=3600000)
    `);
    
    // 使用 TableTablet 类与 addRow 插入数据
    const tablet = new TableTablet(
      'sensor_data',
      ['region_id', 'device_id', 'model', 'temperature', 'humidity'],
      [5, 5, 5, 3, 4], // STRING, STRING, STRING, FLOAT, DOUBLE
      [ColumnCategory.TAG, ColumnCategory.TAG, ColumnCategory.ATTRIBUTE, ColumnCategory.FIELD, ColumnCategory.FIELD]
    );
    tablet.addRow(Date.now(), ['region1', 'device001', 'ModelA', 25.5, 60.0]);
    
    await pool.insertTablet(tablet);
    
    // 查询数据
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

### 3.2 使用数据库上下文

```typescript
async function withDatabaseContext() {
  // 创建预配置了数据库的连接池
  const pool = new TableSessionPool('localhost', 6667, {
    username: 'root',
    password: 'root',
    database: 'production_db', // 自动执行 USE DATABASE
    maxPoolSize: 20,
  });
  
  await pool.open();
  
  try {
    // 无需显式 USE DATABASE
    // 已经在 'production_db' 上下文中
    
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

### 4.1 概述

TableSessionPool 是表模型操作的专用连接池。它扩展了基础 SessionPool 功能,提供表特定功能和自动数据库上下文管理。

**核心特性:**
- 与 SessionPool 相同的连接池功能
- 配置数据库时自动执行 `USE DATABASE`
- 带列类别的表特定 insertTablet
- 基于 SQL 的操作
- 轮询负载均衡

### 4.2 构造函数

#### 方式 1: 传统 API(相同端口)

```typescript
const pool = new TableSessionPool(
  'localhost',                    // 主机
  6667,                           // 端口
  {
    username: 'root',
    password: 'root',
    database: 'my_database',      // 可选
    maxPoolSize: 20,
    minPoolSize: 5,
  }
);
```

#### 方式 2: 使用 nodeUrls(不同端口)

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

#### 方式 3: 使用构建器模式(推荐)

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

### 4.3 配置选项

所有 SessionPool 选项加上:

| 选项 | 类型 | 默认值 | 说明 |
|--------|------|---------|-------------|
| `database` | string | `undefined` | 表操作的默认数据库 |

### 4.4 方法

#### 4.4.1 连接管理

##### `async open(enableRpcCompression?: boolean): Promise<void>`

打开连接池。可选择启用 RPC 压缩。

**参数:**
- `enableRpcCompression`: 启用 RPC 压缩(默认: false)

**示例:**
```typescript
// 不启用压缩打开
await pool.open();

// 启用压缩打开
await pool.open(true);
```

##### `async close(): Promise<void>`

关闭连接池中的所有 session。

**示例:**
```typescript
await pool.close();
```

#### 4.4.2 查询操作

##### `async executeQueryStatement(sql: string, timeoutMs?: number): Promise<SessionDataSet>`

执行 SQL 查询语句。

**参数:**
- `sql`: SQL 查询语句
- `timeoutMs`: 查询超时时间(毫秒,默认: 60000)

**返回值:** 用于遍历结果的 SessionDataSet

**示例:**
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

#### 4.4.3 非查询操作

##### `async executeNonQueryStatement(sql: string): Promise<void>`

执行 DDL 或 DML 语句。

**参数:**
- `sql`: SQL 语句

**示例:**
```typescript
// 创建数据库
await pool.executeNonQueryStatement('CREATE DATABASE my_db');

// 使用数据库
await pool.executeNonQueryStatement('USE my_db');

// 创建表
await pool.executeNonQueryStatement(`
  CREATE TABLE devices (
    device_id STRING TAG,
    location STRING ATTRIBUTE,
    value FLOAT FIELD
  )
`);

// 删除表
await pool.executeNonQueryStatement('DROP TABLE devices');

// 删除数据库
await pool.executeNonQueryStatement('DROP DATABASE my_db');
```

#### 4.4.4 数据插入

##### `async insertTablet(tablet: TableTablet | ITableTablet): Promise<void>`

使用 tablet 格式向表中插入数据。

**参数:**
- `tablet`: TableTablet 对象或包含表数据的普通对象

**TableTablet 接口 (用于普通对象):**
```typescript
interface ITableTablet {
  tableName: string;                    // 表名
  columnNames: string[];                // 列名
  columnTypes: number[];                // 数据类型代码 (TSDataType)
  columnCategories: ColumnCategory[];   // 列类别
  timestamps: number[];                 // 时间戳(毫秒)
  values: any[][];                     // 二维数组: [行][列]
}
```

**ColumnCategory 枚举:**
```typescript
enum ColumnCategory {
  TAG = 0,        // 标签列 - 用于 WHERE 子句筛选的索引列(如 device_id、region_id)
  FIELD = 2,      // 字段列 - 测量值(如 temperature、humidity)
  ATTRIBUTE = 1,  // 属性列 - 未索引的元数据(如 model、firmware_version)
  TIME = 3,       // 时间列(仅供内部使用)
}
```

**列类别说明:**
- `TAG` (0) - 用于 WHERE 子句筛选的索引列(例如 device_id、region_id)
- `FIELD` (2) - 测量值(例如 temperature、humidity)
- `ATTRIBUTE` (1) - 不用于筛选的元数据(例如 device_model、firmware_version)
- `TIME` (3) - 仅供内部使用。**不要在 columnCategories 数组中使用** - 时间戳通过 timestamps 数组单独处理

**TableTablet 类 (带辅助方法 - 推荐):**
```typescript
import { TableTablet, ColumnCategory, TSDataType } from 'iotdb-client-nodejs';

// 创建 tablet
const tablet = new TableTablet(
  'sensor_data',
  ['region_id', 'device_id', 'model', 'temperature', 'humidity'],
  [TSDataType.TEXT, TSDataType.TEXT, TSDataType.TEXT, TSDataType.FLOAT, TSDataType.DOUBLE],
  [ColumnCategory.TAG, ColumnCategory.TAG, ColumnCategory.ATTRIBUTE, ColumnCategory.FIELD, ColumnCategory.FIELD]
);

// 使用 addRow 方法逐行添加数据
tablet.addRow(Date.now(), ['region1', 'device001', 'ModelA', 25.5, 60.0]);
tablet.addRow(Date.now() + 1000, ['region1', 'device001', 'ModelA', 26.0, 61.5]);
tablet.addRow(Date.now() + 2000, ['region1', 'device002', 'ModelB', 24.8, 58.5]);

// 插入 tablet
await pool.insertTablet(tablet);
```

**替代方案: 普通对象方法 (仍支持):**
```typescript
import { ColumnCategory, TSDataType } from 'iotdb-client-nodejs';

await pool.insertTablet({
  tableName: 'sensor_data',
  columnNames: ['region_id', 'device_id', 'model', 'temperature', 'humidity'],
  columnTypes: [TSDataType.TEXT, TSDataType.TEXT, TSDataType.TEXT, TSDataType.FLOAT, TSDataType.DOUBLE],
  columnCategories: [
    ColumnCategory.TAG,        // region_id - 索引标签
    ColumnCategory.TAG,        // device_id - 索引标签
    ColumnCategory.ATTRIBUTE,  // model - 元数据
    ColumnCategory.FIELD,      // temperature - 测量值
    ColumnCategory.FIELD,      // humidity - 测量值
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

**使用数字值的示例(也支持):**
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

**TableTablet 类的优势:**
- ✅ **便捷**: `addRow()` 方法简化逐行添加数据
- ✅ **类型安全**: 构造函数验证参数长度
- ✅ **已验证**: 自动检查值是否与列数量匹配
- ✅ **流式友好**: 轻松在数据到达时添加行

## 5. 配置构建器

### 5.1 用于表模型的 PoolConfigBuilder

PoolConfigBuilder 用于创建 TableSessionPool 配置。

**可用方法:**
- `host(host: string): this`
- `port(port: number): this`
- `nodeUrls(urls: string[]): this`
- `username(username: string): this`
- `password(password: string): this`
- `database(database: string): this` - **对表模型很重要**
- `timezone(timezone: string): this`
- `fetchSize(size: number): this`
- `maxPoolSize(size: number): this`
- `minPoolSize(size: number): this`
- `maxIdleTime(time: number): this`
- `waitTimeout(timeout: number): this`
- `enableSSL(enable: boolean): this`
- `sslOptions(options: SSLOptions): this`
- `build(): PoolConfig`

**示例:**
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

## 6. 数据类型

### 6.1 支持的数据类型

表模型支持所有 IoTDB 数据类型:

| 代码 | 类型 | JavaScript 类型 | 在表模型中的使用 |
|------|------|-----------------|---------------------|
| 0 | BOOLEAN | boolean | 标签、属性、字段 |
| 1 | INT32 | number | 标签、属性、字段 |
| 2 | INT64 | number/string | 标签、属性、字段 |
| 3 | FLOAT | number | 属性、字段 |
| 4 | DOUBLE | number | 属性、字段 |
| 5 | TEXT | string | 标签、属性、字段 |
| 8 | TIMESTAMP | number/Date | 字段 |
| 9 | DATE | number/Date | 字段 |
| 10 | BLOB | Buffer | 字段 |
| 11 | STRING | string | 标签、属性、字段 |

### 6.2 列类别

| 代码 | 类别 | 用途 | 是否索引 | 使用场景 |
|------|----------|---------|---------|-------|
| 0 | TAG | 标识符 | 是 | 在 WHERE 子句中用于过滤 |
| 1 | ATTRIBUTE | 元数据 | 否 | 描述性信息 |
| 2 | FIELD | 测量值 | 否 | 实际传感器/测量值 |

### 6.3 在 insertTablet 中使用数据类型

**混合类型示例:**
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

## 7. 代码示例

### 7.1 完整的数据库和表设置

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
    // 创建数据库
    await pool.executeNonQueryStatement('CREATE DATABASE iot_platform');
    
    // 使用数据库
    await pool.executeNonQueryStatement('USE iot_platform');
    
    // 创建带 TTL 的表
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
    
    // 显示表
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

### 7.2 批量插入多条记录

```typescript
async function batchInsert(pool: TableSessionPool) {
  const regionIds = ['north', 'south', 'east', 'west'];
  const deviceIds = ['dev001', 'dev002', 'dev003'];
  
  const timestamps = [];
  const values = [];
  const now = Date.now();
  
  // 生成 100 条记录
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

### 7.3 带过滤的查询

```typescript
async function queryWithFilters(pool: TableSessionPool) {
  // 按 TAG 查询(已索引,高效)
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

### 7.4 聚合查询

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

### 7.5 多数据库操作

```typescript
async function multiDatabaseOps(pool: TableSessionPool) {
  await pool.open();
  
  try {
    // 创建多个数据库
    await pool.executeNonQueryStatement('CREATE DATABASE production');
    await pool.executeNonQueryStatement('CREATE DATABASE staging');
    
    // 使用生产数据库
    await pool.executeNonQueryStatement('USE production');
    await pool.executeNonQueryStatement(`
      CREATE TABLE metrics (
        device_id STRING TAG,
        value DOUBLE FIELD
      )
    `);
    
    // 切换到测试数据库
    await pool.executeNonQueryStatement('USE staging');
    await pool.executeNonQueryStatement(`
      CREATE TABLE test_metrics (
        device_id STRING TAG,
        value DOUBLE FIELD
      )
    `);
    
    // 使用完全限定名跨数据库查询
    const prodData = await pool.executeQueryStatement('SELECT * FROM production.metrics LIMIT 10');
    const stagingData = await pool.executeQueryStatement('SELECT * FROM staging.test_metrics LIMIT 10');
    
    await prodData.close();
    await stagingData.close();
    
  } finally {
    await pool.close();
  }
}
```

## 8. 最佳实践

### 8.1 表设计

**有效使用 TAG:**
- 将频繁用于 WHERE 子句的列设置为 TAG
- TAG 已索引,可实现快速查询
- 保持 TAG 基数合理(避免数百万个唯一值)

**使用 ATTRIBUTE 存储元数据:**
- 不需要索引的描述性信息
- 设备型号、制造商、位置等
- 不在 WHERE 子句中使用

**使用 FIELD 存储测量值:**
- 实际传感器读数和指标
- 时间序列数据值

**示例:**
```typescript
// 良好的表设计
CREATE TABLE sensor_data (
  region_id STRING TAG,        // 已索引,用于 WHERE
  device_id STRING TAG,        // 已索引,用于 WHERE
  manufacturer STRING ATTRIBUTE, // 元数据,未索引
  model STRING ATTRIBUTE,       // 元数据,未索引
  temperature FLOAT FIELD,     // 测量值
  humidity FLOAT FIELD         // 测量值
)

// 不良设计 - 使用 FIELD 作为标识符
CREATE TABLE sensor_data (
  temperature FLOAT FIELD,
  humidity FLOAT FIELD,
  device_id STRING FIELD       // 应该是 TAG!
)
```

### 8.2 查询优化

**在 WHERE 子句中按 TAG 过滤:**
```typescript
// 好: 使用索引的 TAG
SELECT * FROM sensors 
WHERE region_id = 'north' AND device_id = 'dev001'

// 差: 按未索引的 FIELD 过滤
SELECT * FROM sensors 
WHERE temperature > 25.0  // 没有 TAG 过滤
```

**使用适当的 LIMIT:**
```typescript
// 防止加载过多数据
SELECT * FROM sensors 
WHERE region_id = 'north'
LIMIT 1000
```

**使用时间范围过滤器:**
```typescript
SELECT * FROM sensors 
WHERE region_id = 'north'
  AND timestamp >= ${Date.now() - 3600000}
  AND timestamp <= ${Date.now()}
```

### 8.3 连接池管理

**合理设置连接池大小:**
```typescript
const pool = new TableSessionPool({
  nodeUrls: ['localhost:6667'],
  maxPoolSize: 50,    // 峰值并发查询数
  minPoolSize: 10,    // 保持热连接
  maxIdleTime: 60000, // 空闲 1 分钟后清理
  waitTimeout: 30000, // 最多等待 30 秒获取连接
});
```

**监控连接池健康状况:**
```typescript
setInterval(() => {
  console.log('Pool Stats:');
  console.log(`  Total: ${pool.getPoolSize()}`);
  console.log(`  Available: ${pool.getAvailableSize()}`);
  console.log(`  In Use: ${pool.getInUseSize()}`);
}, 60000); // 每分钟
```

### 8.4 错误处理

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

### 8.5 资源清理

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
        // 处理结果
      }
    } finally {
      await dataSet.close(); // 始终关闭 DataSet
    }
  } finally {
    await pool.close(); // 始终关闭连接池
  }
}
```

## 9. 故障排查

### 9.1 常见问题

#### 数据库不存在

**症状:**
```
Error: Database 'my_db' does not exist
```

**解决方案:**
```typescript
// 先创建数据库
await pool.executeNonQueryStatement('CREATE DATABASE my_db');
await pool.executeNonQueryStatement('USE my_db');

// 或使用现有数据库配置连接池
const pool = new TableSessionPool('localhost', 6667, {
  database: 'my_db',  // 必须存在
});
```

#### 表不存在

**症状:**
```
Error: Table 'my_table' does not exist
```

**解决方案:**
```typescript
// 检查表是否存在
const dataSet = await pool.executeQueryStatement('SHOW TABLES');
// ... 验证表存在

// 如果需要,创建表
await pool.executeNonQueryStatement(`
  CREATE TABLE my_table (...)
`);
```

#### 列不匹配

**症状:**
```
Error: Column count mismatch
```

**解决方案:**
- 确保 `columnNames`、`columnTypes` 和 `columnCategories` 长度相同
- 验证 `values` 数组与列数匹配
- 检查表模式是否与数据匹配

```typescript
// 验证模式
const dataSet = await pool.executeQueryStatement('DESCRIBE my_table');
while (await dataSet.hasNext()) {
  console.log(dataSet.next().getFields());
}
```

#### TTL 问题

**症状:**
一段时间后数据自动删除

**解决方案:**
```typescript
// 检查 TTL 设置
const dataSet = await pool.executeQueryStatement('SHOW TABLES');
// 查看表属性中的 TTL

// 修改 TTL
await pool.executeNonQueryStatement(`
  ALTER TABLE my_table SET PROPERTIES TTL=31536000000
`); // 1 年(毫秒)
```

### 9.2 性能问题

**查询慢:**
1. 通过适当使用 TAG 添加索引
2. 使用时间范围过滤器
3. 添加 LIMIT 子句
4. 考虑表分区

**插入慢:**
1. 增加批量大小(100-1000 行)
2. 使用连接池
3. 考虑多个并发写入器
4. 监控服务器资源

### 9.3 调试

**启用调试日志:**
```typescript
process.env.LOG_LEVEL = 'debug';
```

**检查 SQL 语法:**
```typescript
try {
  await pool.executeQueryStatement('EXPLAIN SELECT * FROM my_table');
} catch (error) {
  console.error('Invalid SQL:', error.message);
}
```

**监控查询执行:**
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

### 9.4 获取帮助

- **文档**: [IoTDB Table Model Docs](https://iotdb.apache.org/)
- **GitHub Issues**: [报告问题](https://github.com/CritasWang/iotdb-client-nodejs/issues)
- **社区**: dev@iotdb.apache.org

## 附录 A: 完整 API 参考

### TableSessionPool 方法
- `open(enableRpcCompression?)` - 打开连接池
- `close()` - 关闭所有 session
- `executeQueryStatement(sql, timeout?)` - 执行 SQL 查询
- `executeNonQueryStatement(sql)` - 执行 DDL/DML
- `insertTablet(tablet)` - 批量插入到表
- `getPoolSize()` - 总 session 数
- `getAvailableSize()` - 可用 session 数
- `getInUseSize()` - 活动 session 数

### SQL 语句
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

## 附录 B: 数据类型参考

详见 [data-types.md](data-types.md) 了解全面的数据类型文档。

---

**版本**: 1.0.0  
**最后更新**: 2024年1月  
**许可证**: Apache License 2.0
