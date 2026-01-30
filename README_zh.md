# Apache IoTDB Node.js 客户端

[![License](https://img.shields.io/badge/license-Apache%202-4EB1BA.svg)](https://www.apache.org/licenses/LICENSE-2.0.html)
[![npm version](https://img.shields.io/npm/v/iotdb-client-nodejs.svg)](https://www.npmjs.com/package/iotdb-client-nodejs)
[![Node.js Version](https://img.shields.io/node/v/iotdb-client-nodejs.svg)](https://nodejs.org/)

用于 Apache IoTDB 的 Node.js 客户端，支持 SessionPool 和 TableSessionPool，提供高效的连接管理和全面的查询功能。

## 目录

- [概述](#概述)
- [特性](#特性)
- [安装](#安装)
- [快速开始](#快速开始)
- [技术架构](#技术架构)
- [API 参考](#api-参考)
- [开发](#开发)
- [测试](#测试)
- [性能测试](#性能测试)
- [示例](#示例)
- [文档](#文档)
- [贡献](#贡献)
- [发布流程](#发布流程)
- [许可证](#许可证)

## 概述

Apache IoTDB Node.js 客户端是一个高性能、功能丰富的客户端库，用于与 Apache IoTDB 交互。Apache IoTDB 是一个专为 IoT 数据管理设计的时序数据库。该客户端提供了树模型（时间序列）和表模型（关系型）API，实现灵活的数据管理策略。

## 特性

- **会话管理**：支持查询、非查询和 insertTablet 操作的单一会话
- **SessionPool**：用于高并发场景的连接池，支持自动负载均衡
- **TableSessionPool**：专门用于表模型操作的连接池，支持数据库上下文管理
- **多节点支持**：跨多个 IoTDB 节点的轮询负载均衡和故障转移
- **SSL/TLS 支持**：可自定义 SSL 选项和证书验证的安全连接
- **TypeScript 支持**：完整的 TypeScript 类型定义和严格的类型检查
- **构建器模式**：用于优雅配置管理的流式 API
- **内存高效**：SessionDataSet 支持延迟加载和分页处理大型结果集
- **全面测试**：包含单元测试、端到端测试和基准测试工具
- **生产就绪**：连接池、空闲清理、健康检查和错误处理

## 安装

```bash
npm install iotdb-client-nodejs
```

## 环境要求

- Node.js >= 14.0.0
- Apache IoTDB >= 1.0.0

## 快速开始

### 基本会话使用

```typescript
import { Session } from 'iotdb-client-nodejs';

const session = new Session({
  host: 'localhost',
  port: 6667,
  username: 'root',
  password: 'root',
});

await session.open();

// 执行非查询语句
await session.executeNonQueryStatement('CREATE DATABASE root.test');

// 使用 SessionDataSet 执行查询（迭代器模式 - 内存高效）
const dataSet = await session.executeQueryStatement('SELECT * FROM root.test.**');
while (await dataSet.hasNext()) {
  const row = dataSet.next();
  console.log(row.getTimestamp(), row.getFields());
}
await dataSet.close();

// 或使用 toArray() 辅助方法处理小型结果集（将所有数据加载到内存）
const dataSet2 = await session.executeQueryStatement('SHOW DATABASES');
const allRows = await dataSet2.toArray(); // 返回 [[timestamp, ...fields], ...]
console.log('所有行:', allRows);

// 插入 Tablet 数据
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

### 使用构建器模式（推荐）

构建器模式提供更优雅和流畅的配置 API：

```typescript
import { Session, ConfigBuilder } from 'iotdb-client-nodejs';

// 构建会话配置
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
// ... 使用会话
await session.close();
```

### SessionPool 使用

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

// 使用连接池执行查询
const result = await pool.executeQueryStatement('SELECT * FROM root.test.**');

// 执行非查询语句
await pool.executeNonQueryStatement(
  'CREATE TIMESERIES root.test.device1.temperature WITH DATATYPE=FLOAT'
);

// 插入数据
await pool.insertTablet({
  deviceId: 'root.test.device1',
  measurements: ['temperature'],
  dataTypes: [3], // FLOAT
  timestamps: [Date.now()],
  values: [[25.5]],
});

// 获取连接池统计信息
console.log('连接池大小:', pool.getPoolSize());
console.log('可用连接:', pool.getAvailableSize());

await pool.close();
```

### 多节点支持

#### 方法 1：使用字符串格式的 nodeUrls（推荐）

当节点具有不同的 host:port 组合时，使用字符串数组格式的 `nodeUrls` 配置：

```typescript
import { SessionPool, PoolConfigBuilder } from 'iotdb-client-nodejs';

// 使用字符串数组的配置对象（推荐）
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

// 或使用字符串数组的构建器模式
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
// 连接将使用轮询方式分布在所有节点上
```

### SSL/TLS 支持

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

### TableSessionPool 使用

```typescript
import { TableSessionPool } from 'iotdb-client-nodejs';

const tablePool = new TableSessionPool('localhost', 6667, {
  username: 'root',
  password: 'root',
  database: 'my_database', // 为表模型设置默认数据库
  maxPoolSize: 10,
  minPoolSize: 2,
});

await tablePool.init();

// 在表模式下执行查询
const result = await tablePool.executeQueryStatement('SHOW DATABASES');

await tablePool.close();
```

## 技术架构

### 概述

IoTDB Node.js 客户端采用三层架构设计，针对单会话和高并发场景进行了优化：

```
┌─────────────────────────────────────────────────────┐
│  应用层（您的代码）                                 │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  连接池层                                           │
│  ┌──────────────────┐    ┌──────────────────────┐  │
│  │  SessionPool     │    │ TableSessionPool     │  │
│  │  - 负载均衡      │    │ - 数据库上下文       │  │
│  │  - 连接池管理    │    │ - 连接池管理         │  │
│  └──────────────────┘    └──────────────────────┘  │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  会话层                                             │
│  ┌──────────────────────────────────────────────┐  │
│  │  Session                                     │  │
│  │  - 查询 / 非查询                             │  │
│  │  - InsertTablet                              │  │
│  │  - 结果解析                                  │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  连接层                                             │
│  ┌──────────────────────────────────────────────┐  │
│  │  Connection (Thrift)                         │  │
│  │  - TCP/SSL 传输                              │  │
│  │  - 会话生命周期                              │  │
│  │  - 低级协议                                  │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                    ↓
              Apache IoTDB
```

### 核心组件

#### 1. 连接层 (`src/connection/Connection.ts`)
- 通过 TCP 或 SSL/TLS 管理低级 Thrift 连接
- 处理会话生命周期（使用 sessionId/statementId 打开/关闭）
- 实现 TFramedTransport 和 TBinaryProtocol
- 支持单端点连接
- **关键模式**：一个连接 = 一个 IoTDB 节点端点

#### 2. 会话层 (`src/client/Session.ts`)
- 用于数据库操作的高级 API
- 方法：`executeQueryStatement()`、`executeNonQueryStatement()`、`insertTablet()`
- 使用 SessionDataSet 处理查询结果解析
- 支持可配置 fetchSize 的分页
- **关键模式**：单会话场景使用 nodeUrls 中的第一个节点

#### 3. 连接池层 (`src/client/BaseSessionPool.ts`、`SessionPool.ts`、`TableSessionPool.ts`)
- 可配置最小/最大大小的连接池
- 跨多个端点的轮询负载均衡
- 自动空闲连接清理（maxIdleTime）
- 连接池耗尽时的等待队列（waitTimeout）
- 健康检查和连接回收
- **关键模式**：在 nodeUrls 中的所有节点上分配连接

#### 4. 配置系统 (`src/utils/Config.ts`)
- 用于流式配置的构建器模式
- 支持旧格式（host/port）和新格式（nodeUrls）
- TypeScript 接口的类型安全
- 验证和默认值

### 数据流

#### 查询执行流程
```
1. 应用调用 pool.executeQueryStatement()
2. 池获取可用的 Session（轮询）
3. Session 通过 Connection 向 IoTDB 发送查询
4. IoTDB 返回带有 queryId 的 SessionDataSet
5. SessionDataSet 批量获取数据（fetchSize）
6. 应用使用 hasNext()/next() 迭代结果
7. Session 释放回池
8. SessionDataSet.close() 释放服务器资源
```

#### 插入流程
```
1. 应用调用 pool.insertTablet()
2. 池获取可用的 Session（轮询）
3. Session 按列序列化 Tablet 数据
4. 通过 Connection 将数据发送到 IoTDB
5. IoTDB 确认写入
6. Session 释放回池
```

### 线程安全和并发

- **会话**：非线程安全；使用 SessionPool 进行并发
- **SessionPool**：线程安全；会话管理的内部锁定
- **连接生命周期**：由池自动管理
- **负载均衡**：会话获取时的轮询分配
- **空闲清理**：后台任务删除空闲连接

### Thrift 集成

客户端使用 Apache Thrift 进行 RPC 通信：

- **生成的代码**：`src/thrift/generated/` 来自 IoTDB 的 `.thrift` 文件
- **协议**：TBinaryProtocol（紧凑、高效）
- **传输**：TFramedTransport（消息边界）
- **SSL 支持**：可配置的 TLS 传输层
- **版本**：兼容 Apache IoTDB 1.0+

### 内存管理

- **SessionDataSet**：延迟加载与分页（默认：1024 行/次）
- **连接池**：有界大小防止资源耗尽
- **空闲清理**：maxIdleTime 后自动连接清理
- **结果集**：必须调用 `close()` 以释放服务器资源

### 错误处理

- **连接错误**：使用池中的下一个节点自动重试
- **超时处理**：可配置的查询超时（默认：60秒）
- **池耗尽**：带超时的等待队列
- **Thrift 错误**：使用堆栈跟踪包装在 JavaScript 错误中
- **重定向处理**：自动缓存设备到端点映射以优化写入路由（基础设施已完成，运行时集成待实现）

### 重定向支持（实验性 - 尚未实现）

**⚠️ 状态：仅基础设施 - 运行时集成待完成**

客户端包含用于客户端重定向支持的基础设施，但实际的运行时集成尚未实现。以下类可供将来使用：

- `RedirectException`：处理重定向响应的异常类
- `RedirectCache`：具有 TTL 的设备到端点映射 LRU 缓存

**为什么没有实现？**
- 需要真实的 IoTDB 多节点集群进行测试和验证
- Java 客户端使用状态码 **400**（而不是最初假设的 531）
- 需要复杂的多设备和批量操作支持
- 边缘情况（重定向循环、连接失败）需要彻底测试

**当前行为：**
所有写入操作使用标准轮询负载均衡跨配置的节点。

**未来实现：**
详细设计和实现计划请参见 [docs/redirection-design.md](docs/redirection-design.md)。

**注意**：基础类（RedirectException、RedirectCache）经过单元测试的充分测试。配置选项将在运行时集成完成后添加。

## API 参考

### 配置构建器

#### ConfigBuilder

用于构建 Session 配置的流式 API：

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

**方法：**
- `host(host: string): this` - 设置主机
- `port(port: number): this` - 设置端口
- `nodeUrls(nodeUrls: EndPoint[]): this` - 设置多个节点 URL
- `username(username: string): this` - 设置用户名
- `password(password: string): this` - 设置密码
- `database(database: string): this` - 设置数据库
- `timezone(timezone: string): this` - 设置时区
- `fetchSize(fetchSize: number): this` - 设置获取大小
- `enableSSL(enable: boolean): this` - 启用或禁用 SSL
- `sslOptions(sslOptions: SSLOptions): this` - 设置 SSL 选项
- `build(): Config` - 构建并返回配置

#### PoolConfigBuilder

用于构建 SessionPool 配置的流式 API（扩展 ConfigBuilder）：

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

**附加方法：**
- `maxPoolSize(size: number): this` - 设置最大连接池大小
- `minPoolSize(size: number): this` - 设置最小连接池大小
- `maxIdleTime(time: number): this` - 设置最大空闲时间（毫秒）
- `waitTimeout(timeout: number): this` - 设置等待超时（毫秒）
- `build(): PoolConfig` - 构建并返回连接池配置

### 数据类型

插入 Tablet 时，使用以下常量指定数据类型：

- `0` - BOOLEAN
- `1` - INT32
- `2` - INT64
- `3` - FLOAT
- `4` - DOUBLE
- `5` - TEXT
- `8` - TIMESTAMP
- `9` - DATE
- `10` - BLOB
- `11` - STRING

完整的数据类型参考，请参见 [DATA_TYPES.md](./DATA_TYPES.md)。

### Session

#### 构造函数

**选项 1：使用配置对象**
```typescript
new Session(config: Config)
```

**选项 2：使用构建器模式**（推荐）
```typescript
new Session(new ConfigBuilder()...build())
```

配置必须包括：
- `host` 和 `port` 用于单节点连接
- `nodeUrls` 用于多节点连接（使用第一个节点）

#### 方法
- `async open(): Promise<void>` - 打开会话
- `async close(): Promise<void>` - 关闭会话
- `async executeQueryStatement(sql: string, timeoutMs?: number): Promise<QueryResult>` - 执行带可选超时的查询（默认：60000毫秒）
- `async executeNonQueryStatement(sql: string): Promise<void>` - 执行非查询语句
- `async insertTablet(tablet: Tablet): Promise<void>` - 插入 Tablet 数据
- `isOpen(): boolean` - 检查会话是否打开

### SessionPool

#### 构造函数

**选项 1：传统 API**（向后兼容）
```typescript
new SessionPool(hosts: string | string[], port: number, config?: Partial<PoolConfig>)
```

**选项 2：使用带 nodeUrls 的配置对象**
```typescript
new SessionPool(config: PoolConfig)
```

**选项 3：使用构建器模式**（推荐）
```typescript
new SessionPool(new PoolConfigBuilder()...build())
```

#### 方法

**连接管理：**
- `async init(): Promise<void>` - 初始化连接池
- `async close(): Promise<void>` - 关闭所有连接

**自动会话管理：**
- `async executeQueryStatement(sql: string, timeoutMs?: number): Promise<QueryResult>` - 执行带可选超时的查询（默认：60000毫秒）
- `async executeNonQueryStatement(sql: string): Promise<void>` - 执行非查询语句
- `async insertTablet(tablet: Tablet): Promise<void>` - 插入 Tablet 数据

**显式会话管理：**
- `async getSession(): Promise<Session>` - 从池中获取会话（必须释放）
- `releaseSession(session: Session): void` - 将会话释放回池

**连接池统计：**
- `getPoolSize(): number` - 获取当前连接池大小
- `getAvailableSize(): number` - 获取可用连接
- `getInUseSize(): number` - 获取当前正在使用的会话数

### TableSessionPool

与 SessionPool 相同，但针对表模型操作进行了优化。配置数据库时自动执行 `USE DATABASE`。所有查询方法都支持相同的超时参数（默认：60000毫秒）。

## 开发

### 前置条件

- Node.js >= 14.0.0
- npm >= 6.0.0
- Apache Thrift 编译器（可选，用于重新生成 Thrift 文件）
- Git

### 开发设置

1. 克隆仓库：
```bash
git clone https://github.com/CritasWang/iotdb-client-nodejs.git
cd iotdb-client-nodejs
```

2. 安装依赖：
```bash
npm install
```

3. 构建项目：
```bash
npm run build
```

### 构建系统

项目使用两步构建过程：

1. **esbuild**：快速 TypeScript 编译
   - 在 `esbuild.config.js` 中配置
   - 将 `src/` 编译到 `dist/` 目录
   - 不包含类型声明文件

2. **tsc**：类型声明生成
   - 为 TypeScript 支持生成 `.d.ts` 文件
   - 使用 `--emitDeclarationOnly` 标志运行
   - 确保消费者的类型安全

3. **copy:thrift**：复制生成的 Thrift 文件
   - 将 `.js` 文件从 `src/thrift/generated/` 复制到 `dist/thrift/generated/`
   - 必需，因为 Thrift 代码使用 `require()` 语句

构建命令：
```bash
npm run build          # 完整构建（esbuild + tsc + copy）
npm run build:esbuild  # 仅 esbuild 编译
npm run build:types    # 仅类型声明
```

### 开发工作流

1. **在 `src/` 目录中进行更改**
2. **使用 `npm run build` 构建**
3. **使用 `npm test` 测试**
4. **使用 `npm run lint` 检查代码**
5. **使用 `npm run format` 格式化**

### 代码风格

- 使用 TypeScript 严格模式
- 遵循现有的代码格式（Prettier）
- 为公共 API 添加 JSDoc 注释
- 保持函数专注和简洁
- 使用 async/await 而不是回调
- 适当处理错误
- 优先使用显式类型而不是 `any`

### 重新生成 Thrift 文件

如果需要更新到 IoTDB 的 Thrift 定义的新版本：

1. 从 Apache IoTDB 下载最新的 Thrift 文件：
```bash
git clone --depth 1 https://github.com/apache/iotdb.git /tmp/iotdb
```

2. 复制 Thrift 文件：
```bash
cp /tmp/iotdb/iotdb-protocol/thrift-datanode/src/main/thrift/client.thrift thrift/
cp /tmp/iotdb/iotdb-protocol/thrift-commons/src/main/thrift/common.thrift thrift/
```

3. 重新生成 Node.js 客户端：
```bash
npm run generate:thrift
```

4. 彻底测试以确保兼容性

## 测试

### 测试结构

```
tests/
├── unit/           # 单元测试（快速，无外部依赖）
│   ├── Config.test.ts
│   ├── Logger.test.ts
│   └── ...
└── e2e/            # 端到端测试（需要 IoTDB）
    ├── Session.test.ts
    ├── SessionPool.test.ts
    ├── TableSessionPool.test.ts
    └── ...
```

### 运行测试

运行所有测试：
```bash
npm test
```

仅运行单元测试：
```bash
npm run test:unit
```

仅运行端到端测试（需要 IoTDB 实例）：
```bash
export IOTDB_HOST=localhost
export IOTDB_PORT=6667
export IOTDB_USER=root
export IOTDB_PASSWORD=root
npm run test:e2e
```

### 端到端测试设置

端到端测试需要运行中的 IoTDB 实例。您可以使用 Docker Compose：

**单节点（1c1d）：**
```bash
docker-compose -f docker-compose-1c1d.yml up -d
```

**3节点集群（3c3d）：**
```bash
docker-compose -f docker-compose-3c3d.yml up -d
```

**停止容器：**
```bash
docker-compose -f docker-compose-1c1d.yml down
```

### 测试模式

#### 单元测试示例
```typescript
describe('ConfigBuilder', () => {
  test('应使用所有选项构建配置', () => {
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

#### 端到端测试示例
```typescript
describe('Session 端到端测试', () => {
  let session: Session;

  beforeAll(async () => {
    session = new Session({
      host: process.env.IOTDB_HOST || 'localhost',
      port: parseInt(process.env.IOTDB_PORT || '6667'),
      username: process.env.IOTDB_USER || 'root',
      password: process.env.IOTDB_PASSWORD || 'root',
    });
    await session.open();
  }, 60000); // 连接60秒超时

  afterAll(async () => {
    if (session?.isOpen()) {
      await session.close();
    }
  });

  test('应执行查询', async () => {
    if (!session.isOpen()) return; // 无连接时跳过
    
    const dataSet = await session.executeQueryStatement('SHOW DATABASES');
    const rows = await dataSet.toArray();
    expect(Array.isArray(rows)).toBe(true);
    await dataSet.close();
  });
});
```

### 测试覆盖率

当前测试覆盖：
- 单元测试：核心工具（Config、Logger、数据序列化）
- 端到端测试：Session、SessionPool、TableSessionPool
- 同时测试所有数据类型
- 测试多节点场景
- 测试连接池行为（大小限制、超时、清理）

### 调试测试

调试单个测试：
```bash
npm run test:debug
```

调试端到端测试：
```bash
npm run test:e2e:debug
```

检查未关闭的句柄：
```bash
npm run test:e2e:check-handles
```

## 性能测试

`benchmark/` 目录中提供了全面的基准测试工具，用于性能测试和优化。

### 概述

- **树模型基准测试**：使用 `insertTablet` API 测试时间序列数据模型
- **表模型基准测试**：使用 `insertTablet` API 测试关系数据模型
- **预生成数据**：消除测试期间的数据生成开销
- **并发客户端**：模拟真实世界的高并发场景
- **详细指标**：吞吐量、延迟、百分位数（P50、P90、P95、P99）

### 快速开始

测试基准测试基础设施（不需要 IoTDB）：
```bash
node benchmark/test-benchmark.js
```

运行树模型基准测试：
```bash
CLIENT_NUMBER=10 DEVICE_NUMBER=100 node benchmark/benchmark-tree.js
```

运行表模型基准测试：
```bash
CLIENT_NUMBER=10 DEVICE_NUMBER=100 node benchmark/benchmark-table.js
```

### 关键配置参数

| 参数 | 默认值 | 描述 |
|------|--------|------|
| `CLIENT_NUMBER` | 10 | 并发客户端数 |
| `DEVICE_NUMBER` | 100 | 要模拟的设备数 |
| `SENSOR_NUMBER` | 10 | 每个设备的传感器数 |
| `BATCH_SIZE_PER_WRITE` | 100 | 每次写入操作的数据行数 |
| `TOTAL_DATA_POINTS` | 100000 | 要生成的总数据点 |
| `POOL_MAX_SIZE` | 20 | 连接池中的最大连接数 |

### 示例：高并发测试

```bash
CLIENT_NUMBER=50 \
DEVICE_NUMBER=1000 \
SENSOR_NUMBER=10 \
BATCH_SIZE_PER_WRITE=1000 \
TOTAL_DATA_POINTS=1000000 \
node benchmark/benchmark-tree.js
```

### 性能指标

基准测试报告：
- **执行时间**：总测试时长
- **操作**：总操作数、成功、失败、成功率
- **数据点**：写入的总数据点
- **吞吐量**：操作数/秒、数据点数/秒
- **延迟**：最小、最大、平均、P50、P90、P95、P99

### 示例输出

```
================================================================================
基准测试结果
================================================================================

[执行时间]
  时长:                  45.23秒 (45234毫秒)

[操作]
  总操作数:              1000
  成功:                  998
  失败:                  2
  成功率:                99.80%

[数据点]
  写入的总数据点:        100,000

[吞吐量]
  操作数/秒:             22.11
  数据点数/秒:           2,210

[延迟 (毫秒)]
  最小:                  15.23毫秒
  最大:                  1250.45毫秒
  平均:                  45.23毫秒
  P50 (中位数):          42.15毫秒
  P90:                   78.45毫秒
  P95:                   95.23毫秒
  P99:                   125.67毫秒
================================================================================
```

### 性能调优技巧

1. **优化批量大小**：测试不同的值（100-1000行）
2. **调整并发**：从10-20个客户端开始，根据结果调整
3. **使用连接池**：设置适当的 `POOL_MIN_SIZE` 和 `POOL_MAX_SIZE`
4. **预生成数据**：使用缓存数据以获得准确结果
5. **监控资源**：监视 CPU、内存、磁盘 I/O 和网络

完整文档请参见 [benchmark/README.md](benchmark/README.md)。

## 示例

有关更多使用示例，请参见 `examples/` 目录：

- `examples/basic-session.ts` - 基本会话使用
- `examples/session-pool.ts` - SessionPool 使用
- `examples/table-session-pool.ts` - TableSessionPool 使用
- `examples/multi-node.ts` - 多节点配置
- `examples/ssl-connection.ts` - SSL/TLS 连接

## 文档

`docs/` 目录中提供了全面的文档：

### 用户指南

- **[树模型用户指南](docs/user-guide-tree-zh.md)** - 时间序列数据模型完整指南
- **[表模型用户指南](docs/user-guide-table-zh.md)** - 关系数据模型完整指南
- **[SessionDataSet 指南](docs/sessiondataset-guide.md)** - 使用查询结果
- **[数据类型参考](docs/data-types.md)** - 完整的数据类型文档
- **[TypeScript 示例](docs/typescript-examples.md)** - TypeScript 使用指南

### 技术文档

- **[实现指南](docs/implementation.md)** - 架构和核心组件
- **[Thrift 文档](docs/thrift.md)** - Thrift 代码生成
- **[构建基础设施](docs/development/build-infrastructure.md)** - 构建系统详情

### 贡献者文档

- **[贡献指南](CONTRIBUTING.md)** - 如何贡献
- **[调试端到端测试](docs/development/debugging-e2e.md)** - 测试指南
- **[测试数据库参考](docs/development/test-database.md)** - 测试设置

### 其他资源

- **[项目状态](docs/project-status.md)** - 实现状态和路线图
- **[更新日志](CHANGELOG.md)** - 版本历史
- **[GitHub 工作流](.github/workflows/README.md)** - CI/CD 文档

## 贡献

我们欢迎社区贡献！无论您是修复错误、添加功能、改进文档还是报告问题，我们都非常感谢您的帮助。

### 如何贡献

1. **在 GitHub 上 Fork 仓库**
2. **从 `main` 创建功能分支**
3. **遵循我们的代码风格指南进行更改**
4. **为新功能添加测试**
5. **根据需要更新文档**
6. **提交包含清晰描述的 Pull Request**

### 开发指南

- 遵循现有的代码风格和约定
- 编写清晰、简洁的提交消息
- 为新功能添加单元测试
- 确保在提交 PR 之前所有测试通过
- 为显著更改更新 CHANGELOG.md
- 保持 PR 专注于单个功能或修复

### 代码审查流程

所有提交在合并前都需要审查：
1. 自动化测试必须通过（CI/CD）
2. 维护者进行代码审查
3. 文档审查（如适用）
4. 最终批准和合并

### 报告问题

报告错误时，请包括：
- Node.js 版本
- IoTDB 版本
- 操作系统
- 重现步骤
- 预期行为与实际行为
- 错误消息和堆栈跟踪

有关详细的贡献指南，请参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 发布流程

本项目遵循语义化版本控制（SemVer）并维护定期发布周期。

### 版本编号

给定版本号 `MAJOR.MINOR.PATCH`：
- **MAJOR**：破坏性 API 更改
- **MINOR**：新功能，向后兼容
- **PATCH**：错误修复，向后兼容

### 发布工作流

#### 1. 发布前准备

更新版本和更新日志：
```bash
# 更新 package.json 中的版本
npm version [major|minor|patch] --no-git-tag-version

# 使用发布说明更新 CHANGELOG.md
# - 新功能
# - 错误修复
# - 破坏性更改
# - 弃用
```

#### 2. 测试

运行全面测试：
```bash
# 单元测试
npm run test:unit

# 端到端测试（需要 IoTDB）
export IOTDB_HOST=localhost
export IOTDB_PORT=6667
npm run test:e2e

# 代码检查
npm run lint

# 构建验证
npm run build
```

#### 3. 版本标记

创建并推送版本标签：
```bash
# 提交版本更新
git add package.json CHANGELOG.md
git commit -m "chore: bump version to X.Y.Z"

# 创建标签
git tag -a vX.Y.Z -m "Release vX.Y.Z"

# 推送到远程
git push origin main
git push origin vX.Y.Z
```

#### 4. 发布到 npm

构建和发布：
```bash
# 构建生产资源
npm run build

# 发布到 npm（需要 npm 帐户）
npm publish

# 对于 beta/RC 版本
npm publish --tag beta
```

#### 5. GitHub 发布

创建 GitHub 发布：
1. 转到 GitHub 发布页面
2. 点击"创建新发布"
3. 选择版本标签
4. 添加发布标题：`v X.Y.Z - 发布名称`
5. 将更新日志条目复制到发布说明
6. 附加构建工件（如适用）
7. 发布版本

### 发布检查清单

- [ ] 所有测试通过
- [ ] CHANGELOG.md 已更新
- [ ] package.json 中的版本已更新
- [ ] 文档已更新
- [ ] 破坏性更改已记录
- [ ] 迁移指南（用于主要版本）
- [ ] Git 标签已创建
- [ ] npm 包已发布
- [ ] GitHub 发布已创建
- [ ] 发布公告（如果是主要版本）

### 发布计划

- **补丁版本**：根据关键错误需要
- **次要版本**：每月或功能准备就绪时
- **主要版本**：需要破坏性更改时

### Beta/RC 版本

稳定版本发布前的测试：

```bash
# 创建 beta 版本
npm version 1.2.0-beta.1 --no-git-tag-version

# 使用 beta 标签发布
npm publish --tag beta

# 安装 beta 版本
npm install iotdb-client-nodejs@beta
```

### 热修复流程

对于关键生产问题：

1. 从发布标签创建热修复分支
2. 修复问题
3. 增加补丁版本
4. 立即标记和发布
5. 合并回 main

### 发布后任务

- 更新文档站点（如适用）
- 在项目频道上宣布
- 监控问题和反馈
- 准备下一个发布里程碑

## 许可证

Apache License 2.0

版权所有 © 2024 Apache IoTDB

根据 Apache 许可证 2.0 版（"许可证"）许可；
除非遵守许可证，否则您不得使用此文件。
您可以在以下地址获取许可证副本：

    http://www.apache.org/licenses/LICENSE-2.0

除非适用法律要求或书面同意，否则根据许可证分发的软件
按"原样"分发，不提供任何明示或暗示的保证或条件。
有关许可证下的特定权限和限制，请参见许可证。

## 参考资料

- [Apache IoTDB](https://iotdb.apache.org/)
- [Apache IoTDB GitHub](https://github.com/apache/iotdb)
- [Apache IoTDB 文档](https://iotdb.apache.org/zh/UserGuide/Master/QuickStart/QuickStart.html)
- [Apache IoTDB C# 客户端](https://github.com/apache/iotdb-client-csharp)
- [Apache Thrift](https://thrift.apache.org/)
