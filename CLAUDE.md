# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Apache IoTDB Node.js client library providing Session, SessionPool, and TableSessionPool for time-series database operations. Uses Apache Thrift for RPC communication.

## Build & Development Commands

```bash
npm install              # Install dependencies
npm run build            # Full build (esbuild + tsc + copy:thrift)
npm run lint             # Run ESLint
npm run lint:fix         # Fix lint issues
npm run format           # Format with Prettier
```

## Testing Commands

```bash
npm test                 # All tests (runs sequentially)
npm run test:unit        # Unit tests only
npm run test:e2e         # E2E tests (requires IoTDB instance)
```

**E2E tests require IoTDB**:

```bash
# Start single node
docker-compose -f docker-compose-1c1d.yml up -d

# Or 3-node cluster
docker-compose -f docker-compose-3c3d.yml up -d

# Environment variables
export IOTDB_HOST=localhost IOTDB_PORT=6667 IOTDB_USER=root IOTDB_PASSWORD=root
```

## Architecture

Three-layer design: **Connection** → **Session** → **Pool**

```
┌─────────────────────────────────────────────────────┐
│  Pool Layer (SessionPool / TableSessionPool)        │
│  - Round-robin load balancing across nodeUrls       │
│  - Connection pooling (min/max size, idle cleanup)  │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  Session Layer                                      │
│  - executeQueryStatement() → SessionDataSet         │
│  - executeNonQueryStatement()                       │
│  - insertTablet() (TreeTablet or TableTablet)       │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  Connection Layer (Thrift)                          │
│  - TFramedTransport + TBinaryProtocol               │
│  - TCP/SSL transport                                │
└─────────────────────────────────────────────────────┘
```

**Key files**:

- `src/client/Session.ts` - Single connection session
- `src/client/BaseSessionPool.ts` - Abstract pool with common logic
- `src/client/SessionPool.ts` - Tree model pool (sql_dialect='tree')
- `src/client/TableSessionPool.ts` - Table model pool (sql_dialect='table')
- `src/connection/Connection.ts` - Low-level Thrift connection

## Critical Patterns

### Constructor Overloading (Maintain Both Signatures)

```typescript
// New format (recommended):
new SessionPool({ nodeUrls: ["host1:6667", "host2:6667"], maxPoolSize: 10 });

// Old format (backward compatible):
new SessionPool(["host1", "host2"], 6667, { maxPoolSize: 10 });
```

### Data Types - Use Official TSFile Codes

| Code | Type      | JavaScript Type |
| ---- | --------- | --------------- |
| 0    | BOOLEAN   | boolean         |
| 1    | INT32     | number          |
| 2    | INT64     | number/string   |
| 3    | FLOAT     | number          |
| 4    | DOUBLE    | number          |
| 5    | TEXT      | string          |
| 8    | TIMESTAMP | number/Date     |
| 9    | DATE      | number/Date     |
| 10   | BLOB      | Buffer          |
| 11   | STRING    | string          |

### TreeTablet vs TableTablet

**TreeTablet** (timeseries model - Session/SessionPool):

```typescript
{ deviceId: "root.sg.device1", measurements: ["temp"], dataTypes: [3], timestamps: [...], values: [...] }
```

**TableTablet** (relational model - TableSession/TableSessionPool):

```typescript
{ tableName: "sensor_data", columnNames: ["device_id", "temp"], columnTypes: [11, 3],
  columnCategories: [ColumnCategory.TAG, ColumnCategory.FIELD], timestamps: [...], values: [...] }
```

**CRITICAL**: Never include `ColumnCategory.TIME` in columnCategories - timestamps are handled separately.

### SessionDataSet (Lazy Loading)

```typescript
const dataSet = await session.executeQueryStatement("SELECT * FROM root.test");
while (await dataSet.hasNext()) {
  // async - fetches batches
  const row = dataSet.next(); // sync - returns cached row
}
await dataSet.close(); // REQUIRED - releases server resources
```

### Thrift Integration

- Generated code in `src/thrift/generated/` - **DO NOT modify directly**
- Use `require()` not `import` for Thrift files (CommonJS)
- Regenerate with: `npm run generate:thrift`

## E2E Test Patterns

```typescript
beforeAll(async () => {
  session = new Session({
    host: process.env.IOTDB_HOST || "localhost",
    port: 6667,
  });
  await session.open();
}, 60000); // 60s timeout - IoTDB startup is slow

test("example", async () => {
  if (!session.isOpen()) return; // Skip gracefully if no IoTDB

  // Cleanup with error tolerance
  try {
    await session.executeNonQueryStatement("DROP DATABASE root.test");
  } catch (e: any) {
    if (!e.message?.includes("not exist")) throw e;
  }
});
```

Tests run sequentially (`maxWorkers: 1`) to avoid database conflicts.

## Common Pitfalls

1. **Build order**: `copy:thrift` must run after compilation to copy JS files to dist
2. **Pool vs Session**: Session uses first node; Pool does round-robin across all nodes
3. **SessionDataSet**: Always call `close()` or resources leak on server
4. **Test isolation**: Tests share database names (`root.test`), run sequentially

# 📁 文件修改规则

<FILE_MODIFICATION_RULE>

## 核心原则

Write 单次 < 150 行，Edit 单次 < 50 行，超过必须分块

## ⚠️ API 限制适配（重要）

由于 API 代理服务器对输出长度有限制，禁止一次性写入大文件。

Task 子代理使用同一 API，同样受限，所以分块写入是唯一解决方案。

## 分块写入流程

| 步骤 | 操作           | 限制         |
| ---- | -------------- | ------------ |
| 1    | Write 创建骨架 | < 100 行     |
| 2    | Edit 逐步添加  | 每次 < 50 行 |
| 3    | Read 验证      | 确认完整性   |

## 各类型文件的骨架示例

| 文件类型 | 骨架内容                       |
| -------- | ------------------------------ |
| 代码     | import + 类/函数签名（空实现） |
| Markdown | 标题 + 章节占位符              |
| JSON     | 基础结构 {} + 顶层 key         |
| YAML     | 顶层 key + 空值                |
| 配置     | 最小必需配置                   |

## 判断标准

| 操作     | 行数     | 方法                   |
| -------- | -------- | ---------------------- |
| 创建文件 | < 150 行 | Write 一次完成         |
| 创建文件 | > 150 行 | 分块：骨架 + 多次 Edit |
| 修改文件 | < 50 行  | Edit 一次完成          |
| 修改文件 | > 50 行  | 分多次 Edit            |

## 失败处理

```Plain
Write/Edit 失败 → 不要重试相同内容 → 改用更小的分块
```

### ❌ 禁止行为

- 禁止 Write 超过 150 行
- 禁止 Edit 超过 50 行
- 禁止重复尝试失败的工具
- 禁止使用 heredoc 写代码（特殊字符会失败）

</FILE_MODIFICATION_RULE>
