# 测试数据库使用快速参考

## 数据库命名规范

### 树模型（Tree Model）

**数据库名称**: `root.test`

使用该数据库的测试文件：

- `tests/e2e/Session.test.ts`
- `tests/e2e/AllDataTypes.test.ts`
- `tests/e2e/SessionPool.test.ts`
- `tests/e2e/LargeQuery.test.ts`
- `tests/e2e/MultiNode.test.ts`

### 表模型（Table Model）

**数据库名称**: `test`

使用该数据库的测试文件：

- `tests/e2e/TableSessionPool.test.ts`
- `tests/e2e/TableModelDataTypes.test.ts`

## 运行测试

### 前提条件

确保 IoTDB 实例正在运行，并设置环境变量：

```bash
export IOTDB_HOST=localhost
export IOTDB_PORT=6667
export IOTDB_USER=root
export IOTDB_PASSWORD=root
```

### 运行所有 E2E 测试

```bash
npm run test:e2e
```

### 运行单个测试文件

```bash
# 树模型测试
npm test -- tests/e2e/Session.test.ts
npm test -- tests/e2e/AllDataTypes.test.ts
npm test -- tests/e2e/SessionPool.test.ts
npm test -- tests/e2e/LargeQuery.test.ts
npm test -- tests/e2e/MultiNode.test.ts

# 表模型测试
npm test -- tests/e2e/TableSessionPool.test.ts
npm test -- tests/e2e/TableModelDataTypes.test.ts
```

## 注意事项

1. **不要并发运行**: 同一模型的测试不应并发执行，因为它们共享同一个数据库
2. **自动清理**: 每个测试文件在 `afterAll` 钩子中会自动清理数据库
3. **资源节约**: 通过使用单一数据库，减少了 IoTDB 的资源消耗

## 手动清理（如果需要）

如果测试异常中断，可能需要手动清理：

```bash
# 连接到 IoTDB CLI
./start-cli.sh -h localhost -p 6667 -u root -pw root

# 删除树模型测试数据库
DROP DATABASE root.test;

# 删除表模型测试数据库
DROP DATABASE test;
```
