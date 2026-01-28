# 数据库统一修改总结

## 修改目的

因为资源有限，将所有测试用例统一使用单一数据库，以减少资源消耗。

## 修改内容

### 树模型测试 - 统一使用 `root.test` 数据库

**修改前：**

- Session.test.ts: `root.ln`
- AllDataTypes.test.ts: `root.all_types_test`
- SessionPool.test.ts: `root.test_pool`
- LargeQuery.test.ts: `root.large_query_test`
- MultiNode.test.ts: `root.multinode_test`

**修改后：**

- 所有树模型测试统一使用 `root.test` 数据库

**修改的文件：**

1. `tests/e2e/Session.test.ts`
   - 将所有 `root.ln` 改为 `root.test`
   - 添加 afterAll 清理逻辑 `DROP DATABASE root.test`

2. `tests/e2e/AllDataTypes.test.ts`
   - 将所有 `root.all_types_test` 改为 `root.test`
   - 已有 afterAll 清理逻辑，更新为 `DROP DATABASE root.test`

3. `tests/e2e/SessionPool.test.ts`
   - 将所有 `root.test_pool` 改为 `root.test`
   - 添加 afterAll 清理逻辑 `DROP DATABASE root.test`

4. `tests/e2e/LargeQuery.test.ts`
   - 将所有 `root.large_query_test` 改为 `root.test`
   - 已有 afterAll 清理逻辑，更新为 `DROP DATABASE root.test`

5. `tests/e2e/MultiNode.test.ts`
   - 将所有 `root.multinode_test` 改为 `root.test`
   - 已有 afterAll 清理逻辑，更新为 `DROP DATABASE root.test`

### 表模型测试 - 统一使用 `test` 数据库

**修改前：**

- TableSessionPool.test.ts: `test1`, `test2` (两个数据库，还测试数据库切换)
- TableModelDataTypes.test.ts: `table_types_test`, `test_db2` (两个数据库，还测试数据库切换)

**修改后：**

- 所有表模型测试统一使用 `test` 数据库

**修改的文件：**

1. `tests/e2e/TableSessionPool.test.ts`
   - 配置的默认数据库从 `test1` 改为 `test`
   - 删除 beforeAll 中对 `test1`, `test2` 的清理
   - 修改 afterAll 只清理 `test` 数据库
   - 简化测试逻辑，删除数据库切换测试
   - 在单一数据库 `test` 中创建多个表来测试功能

2. `tests/e2e/TableModelDataTypes.test.ts`
   - 配置的默认数据库从 `table_types_test` 改为 `test`
   - 修改 beforeAll 和 afterAll 只操作 `test` 数据库
   - 删除数据库切换测试 (原来的 "Should support table model context switching")
   - 改为在同一数据库中创建多个表的测试

## 测试清理策略

所有测试文件现在都遵循以下清理策略：

1. **beforeAll**: 尝试删除测试数据库 (忽略错误)
2. **测试执行**: 创建数据库和测试数据
3. **afterAll**: 删除测试数据库 (确保清理)

### 树模型 (5个测试文件)

```typescript
afterAll(async () => {
  if (session / pool && isOpen / isConnected) {
    try {
      await executeNonQueryStatement("DROP DATABASE root.test");
    } catch (error) {
      // Ignore cleanup errors
    }
    await close();
  }
}, 60000);
```

### 表模型 (2个测试文件)

```typescript
afterAll(async () => {
  if (pool && isConnected) {
    try {
      await pool.executeNonQueryStatement("DROP DATABASE test");
    } catch (error) {
      // Ignore cleanup errors
    }
    await pool.close();
  }
}, 60000);
```

## 验证结果

✅ 所有修改已完成
✅ 代码编译成功 (`npm run build`)
✅ TypeScript 类型检查通过
✅ 所有测试文件更新完毕

## 影响的测试用例

### 树模型测试 (使用 root.test)

- Session.test.ts: 9个测试用例
- AllDataTypes.test.ts: 5个测试用例
- SessionPool.test.ts: 7个测试用例
- LargeQuery.test.ts: 6个测试用例
- MultiNode.test.ts: 7个测试用例

### 表模型测试 (使用 test)

- TableSessionPool.test.ts: 10个测试用例
- TableModelDataTypes.test.ts: 7个测试用例

**总计：51个测试用例**

## 注意事项

1. **并发运行**: 虽然所有树模型测试使用同一个数据库 `root.test`，但它们不应该并发运行，因为会互相干扰。建议顺序执行测试。

2. **表模型测试**: 同样，两个表模型测试文件使用同一个 `test` 数据库，也不应该并发运行。

3. **资源节约**: 通过统一数据库名称，减少了 IoTDB 的资源消耗：
   - 树模型：从5个数据库减少到1个 (`root.test`)
   - 表模型：从4个数据库减少到1个 (`test`)

4. **清理保证**: 每个测试文件的 afterAll 都会尝试删除数据库，确保测试环境干净。

## 下一步

可以运行测试验证修改：

```bash
# 运行所有 E2E 测试
npm run test:e2e

# 或者单独运行某个测试文件
npm test -- tests/e2e/Session.test.ts
```

**注意**: 需要先启动 IoTDB 实例，并设置环境变量：

```bash
export IOTDB_HOST=localhost
export IOTDB_PORT=6667
export IOTDB_USER=root
export IOTDB_PASSWORD=root
```
