# Apache IoTDB Node.js Client - 树模型用户指南

> **版本**: 1.0.0  
> **最后更新**: 2024

## 目录

- [1. 简介](#1-简介)
- [2. 安装](#2-安装)
- [3. 快速入门](#3-快速入门)
- [4. SessionPool API](#4-sessionpool-api)
- [5. 配置构建器](#5-配置构建器)
- [6. 数据类型](#6-数据类型)
- [7. 代码示例](#7-代码示例)
- [8. 最佳实践](#8-最佳实践)
- [9. 故障排查](#9-故障排查)

## 1. 简介

### 1.1 概述

Apache IoTDB Node.js Client 为树模型(时间序列数据模型)提供了原生支持,使用分层设备路径实现时间序列数据的高效管理。本指南涵盖了树模型操作的 SessionPool API,提供连接池和高并发支持。

### 1.2 树模型特性

IoTDB 中的树模型采用分层组织数据:

- **基于路径的组织**: `root.{storage_group}.{device}.{measurement}`
- **时间序列管理**: 创建和管理具有特定数据类型的独立时间序列
- **高效批量插入**: 使用 `insertTablet` 实现高性能批量写入
- **灵活的查询**: 支持路径模式和通配符查询
- **连接池**: 为高并发场景提供 SessionPool

### 1.3 核心概念

- **存储组(Storage Group)**: 顶层数据组织单元(例如 `root.test`)
- **设备(Device)**: 生成数据的物理或逻辑实体(例如 `root.test.device1`)
- **测点(Measurement)**: 传感器或指标名称(例如 `temperature`、`humidity`)
- **时间序列(Timeseries)**: 带有数据类型的完整路径(例如 `root.test.device1.temperature FLOAT`)

## 2. 安装

### 2.1 从 npm 安装

```bash
npm install iotdb-client-nodejs
```

**系统要求:**
- Node.js >= 14.0.0
- Apache IoTDB >= 1.0.0

### 2.2 在项目中导入

**TypeScript:**
```typescript
import { SessionPool, PoolConfigBuilder, TreeTablet, TSDataType } from 'iotdb-client-nodejs';
```

**JavaScript:**
```javascript
const { SessionPool, PoolConfigBuilder, TreeTablet, TSDataType } = require('iotdb-client-nodejs');
```

## 3. 快速入门

### 3.1 SessionPool 示例

```typescript
import { SessionPool, TreeTablet } from 'iotdb-client-nodejs';

async function quickStart() {
  // 创建并初始化连接池
  const pool = new SessionPool('localhost', 6667, {
    username: 'root',
    password: 'root',
    maxPoolSize: 10,
    minPoolSize: 2,
  });
  
  await pool.init();
  
  try {
    // 创建存储组
    await pool.executeNonQueryStatement('CREATE DATABASE root.test');
    
    // 创建时间序列
    await pool.executeNonQueryStatement(
      'CREATE TIMESERIES root.test.device1.temperature WITH DATATYPE=FLOAT, ENCODING=RLE'
    );
    
    // 使用 TreeTablet 类与 addRow 插入数据
    const tablet = new TreeTablet(
      'root.test.device1',
      ['temperature'],
      [3] // FLOAT
    );
    tablet.addRow(Date.now(), [25.5]);
    
    await pool.insertTablet(tablet);
    
    // 查询数据
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

### 4.1 概述

SessionPool 为高并发场景提供连接池。它自动管理多个 session,在节点间分配负载,并回收空闲连接。

**核心特性:**
- 跨多节点的轮询负载均衡
- 可配置的连接池大小(最小/最大)
- 自动空闲连接清理
- 连接池耗尽时的等待队列
- 线程安全操作

### 4.2 构造函数

#### 方式 1: 传统 API(相同端口)

```typescript
const pool = new SessionPool(
  ['node1', 'node2', 'node3'], // 主机列表
  6667,                         // 端口
  {
    username: 'root',
    password: 'root',
    maxPoolSize: 20,
    minPoolSize: 5,
  }
);
```

#### 方式 2: 使用 nodeUrls(不同端口)

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

#### 方式 3: 使用构建器模式(推荐)

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

### 4.3 连接池配置选项

| 选项 | 类型 | 默认值 | 说明 |
|--------|------|---------|-------------|
| `maxPoolSize` | number | `10` | 连接池中 session 的最大数量 |
| `minPoolSize` | number | `1` | 维护的最小 session 数量 |
| `maxIdleTime` | number | `60000` | 清理前的最大空闲时间(毫秒) |
| `waitTimeout` | number | `60000` | 等待可用 session 的最大时间(毫秒) |

### 4.4 方法

#### 4.4.1 连接池管理

##### `async init(): Promise<void>`

初始化连接池并创建最小数量的 session。

**示例:**
```typescript
await pool.init();
```

##### `async close(): Promise<void>`

关闭连接池中的所有 session 并释放资源。

**示例:**
```typescript
await pool.close();
```

#### 4.4.2 自动 Session 管理

连接池会自动为这些操作获取和释放 session:

##### `async executeQueryStatement(sql: string, timeoutMs?: number): Promise<QueryResult>`

使用连接池中的可用 session 执行查询。

**示例:**
```typescript
const result = await pool.executeQueryStatement('SELECT * FROM root.test.**');
```

##### `async executeNonQueryStatement(sql: string): Promise<void>`

使用可用 session 执行非查询语句。

**示例:**
```typescript
await pool.executeNonQueryStatement('CREATE DATABASE root.test');
```

##### `async insertTablet(tablet: Tablet): Promise<void>`

使用可用 session 插入数据。

**示例:**
```typescript
await pool.insertTablet({
  deviceId: 'root.test.device1',
  measurements: ['temperature'],
  dataTypes: [3],
  timestamps: [Date.now()],
  values: [[25.5]],
});
```

#### 4.4.3 显式 Session 管理

对于同一 session 上的多个操作:

##### `async getSession(): Promise<Session>`

从连接池获取一个 session。使用后**必须**释放。

**示例:**
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

将 session 释放回连接池。

**示例:**
```typescript
pool.releaseSession(session);
```

#### 4.4.4 连接池统计

##### `getPoolSize(): number`

返回连接池中当前 session 的总数。

##### `getAvailableSize(): number`

返回可用(空闲) session 的数量。

##### `getInUseSize(): number`

返回当前正在使用的 session 数量。

**示例:**
```typescript
console.log(`Total: ${pool.getPoolSize()}`);
console.log(`Available: ${pool.getAvailableSize()}`);
console.log(`In Use: ${pool.getInUseSize()}`);
```

## 5. 配置构建器

### 5.1 PoolConfigBuilder

用于构建 SessionPool 配置的流式 API。

**可用方法:**
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

**示例:**
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

## 6. 数据类型

### 6.1 支持的数据类型

树模型支持所有 IoTDB 数据类型:

| 代码 | 类型 | JavaScript 类型 | 说明 |
|------|------|-----------------|-------------|
| 0 | BOOLEAN | boolean | True 或 false |
| 1 | INT32 | number | 32 位有符号整数 |
| 2 | INT64 | number/string | 64 位有符号整数(大值使用字符串) |
| 3 | FLOAT | number | 32 位浮点数 |
| 4 | DOUBLE | number | 64 位浮点数 |
| 5 | TEXT | string | UTF-8 字符串 |
| 8 | TIMESTAMP | number/Date | 自纪元以来的毫秒数 |
| 9 | DATE | number/Date | 自纪元以来的天数 |
| 10 | BLOB | Buffer | 二进制数据 |
| 11 | STRING | string | 与 TEXT 相同 |

### 6.2 在 insertTablet 中使用数据类型

**多类型示例:**
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

### 6.3 处理 INT64

对于大于 JavaScript 安全整数范围(2^53 - 1)的 INT64 值,使用字符串:

```typescript
await pool.insertTablet({
  deviceId: 'root.test.device1',
  measurements: ['largeCounter'],
  dataTypes: [2], // INT64
  timestamps: [Date.now()],
  values: [['9223372036854775807']], // 大值 INT64 使用字符串
});
```

## 7. 代码示例

### 7.1 完整的 CRUD 示例

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
    // 创建(CREATE)
    await pool.executeNonQueryStatement('CREATE DATABASE root.factory');
    await pool.executeNonQueryStatement(
      'CREATE TIMESERIES root.factory.workshop1.temperature WITH DATATYPE=FLOAT'
    );
    
    // 插入(INSERT)
    await pool.insertTablet({
      deviceId: 'root.factory.workshop1',
      measurements: ['temperature'],
      dataTypes: [3],
      timestamps: [Date.now() - 3000, Date.now() - 2000, Date.now() - 1000],
      values: [[25.5], [26.0], [25.8]],
    });
    
    // 读取(READ)
    const result = await pool.executeQueryStatement(
      'SELECT temperature FROM root.factory.workshop1'
    );
    
    console.log('Temperature readings:', result);
    
    // 更新(UPDATE) - 删除并重新插入
    await pool.executeNonQueryStatement(
      `DELETE FROM root.factory.workshop1.temperature WHERE time <= ${Date.now() - 2500}`
    );
    
    // 删除(DELETE)
    await pool.executeNonQueryStatement('DELETE DATABASE root.factory');
    
  } finally {
    await pool.close();
  }
}

crudExample();
```

### 7.2 多节点 SessionPool 示例

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
    // 模拟并发操作
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
    
    // 连接池统计
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

### 7.3 时间范围查询示例

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

### 7.4 多设备批量插入

```typescript
async function batchInsertMultipleDevices(pool: SessionPool) {
  const devices = ['device1', 'device2', 'device3'];
  const timestamps = [];
  const now = Date.now();
  
  // 生成最近 10 分钟的时间戳
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

## 8. 最佳实践

### 8.1 资源管理

**始终关闭资源:**
```typescript
// SessionPool
try {
  await pool.init();
  // ... 操作
} finally {
  await pool.close();
}
```

### 8.2 批量插入

**优化批量大小:**
- 使用 `insertTablet` 而不是单条插入
- 每个 tablet 批量 100-1000 行
- 考虑内存与网络的权衡

**示例:**
```typescript
// 好的做法: 批量插入
await pool.insertTablet({
  deviceId: 'root.test.device1',
  measurements: ['temperature'],
  dataTypes: [3],
  timestamps: timestamps, // 100-1000 个时间戳
  values: values,         // 100-1000 个值
});

// 不好的做法: 单条插入
for (let i = 0; i < 1000; i++) {
  await pool.executeNonQueryStatement(
    `INSERT INTO root.test.device1(timestamp, temperature) VALUES(${timestamps[i]}, ${values[i]})`
  );
}
```

### 8.3 错误处理

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

### 8.4 连接池大小设置

**指导原则:**
- 将 `minPoolSize` 设置为平均并发负载
- 将 `maxPoolSize` 设置为峰值负载 + 缓冲(20-30%)
- 在生产环境中监控连接池统计
- 根据服务器容量调整

**示例:**
```typescript
const pool = new SessionPool({
  nodeUrls: ['localhost:6667'],
  maxPoolSize: 50,    // 峰值负载: 40 个客户端 + 25% 缓冲
  minPoolSize: 20,    // 平均负载: 20 个客户端
  maxIdleTime: 60000, // 空闲 1 分钟后清理
  waitTimeout: 30000, // 最多等待 30 秒获取可用 session
});
```

## 9. 故障排查

### 9.1 常见问题

#### 连接被拒绝

**症状:**
```
Error: connect ECONNREFUSED 127.0.0.1:6667
```

**解决方案:**
1. 验证 IoTDB 正在运行: `jps | grep IoTDB`
2. 检查 `iotdb-datanode.properties` 中的端口配置
3. 验证防火墙允许连接
4. 使用 telnet 测试: `telnet localhost 6667`

#### 连接池超时

**症状:**
```
Error: Timeout waiting for available session
```

**解决方案:**
1. 增加连接池配置中的 `waitTimeout`
2. 如果服务器能够处理,增加 `maxPoolSize`
3. 验证 session 正确释放
4. 检查连接泄漏(忘记 `releaseSession()`)

#### 内存不足

**症状:**
```
FATAL ERROR: Reached heap limit
```

**解决方案:**
1. 减少连接池配置中的 `fetchSize`
2. 分批处理查询结果
3. 增加 Node.js 堆: `node --max-old-space-size=4096 app.js`

### 9.2 调试技巧

**启用调试日志:**
```typescript
// 设置环境变量
process.env.LOG_LEVEL = 'debug';

// 或直接使用 logger
import { logger } from 'iotdb-client-nodejs';
logger.setLevel('debug');
```

**检查连接状态:**
```typescript
console.log('Pool size:', pool.getPoolSize());
console.log('Available:', pool.getAvailableSize());
console.log('In Use:', pool.getInUseSize());
```

**测试查询执行时间:**
```typescript
const start = Date.now();
const result = await pool.executeQueryStatement('SELECT ...');
console.log(`Query took ${Date.now() - start}ms`);
```

### 9.3 性能优化

1. **启用连接池**: 用于并发操作
2. **批量插入**: 使用 insertTablet,100-1000 行
3. **多节点设置**: 在节点间分配负载
4. **监控资源**: 关注 CPU、内存、网络
5. **调整连接池大小**: 根据工作负载设置最小/最大连接池大小

### 9.4 获取帮助

- **文档**: [IoTDB Docs](https://iotdb.apache.org/)
- **GitHub Issues**: [报告问题](https://github.com/CritasWang/iotdb-client-nodejs/issues)
- **邮件列表**: dev@iotdb.apache.org

## 附录 A: 完整类型参考

详见 [data-types.md](data-types.md) 了解全面的数据类型文档。

## 附录 B: API 快速参考

### SessionPool 方法
- `init()` - 初始化连接池
- `close()` - 关闭所有 session
- `executeQueryStatement(sql, timeout?)` - 执行查询
- `executeNonQueryStatement(sql)` - 执行 DDL/DML
- `insertTablet(tablet)` - 批量插入
- `getSession()` - 从连接池获取 session
- `releaseSession(session)` - 将 session 返回连接池
- `getPoolSize()` - 总 session 数
- `getAvailableSize()` - 可用 session 数
- `getInUseSize()` - 活动 session 数

---

**版本**: 1.0.0  
**最后更新**: 2024年1月  
**许可证**: Apache License 2.0
