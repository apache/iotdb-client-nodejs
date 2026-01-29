# E2E 测试 Debug 指南

本文档说明如何调试 E2E 测试。

## 方法一：使用 VS Code Debug 配置（推荐）

项目已配置好多个 debug 启动配置，位于 `.vscode/launch.json`：

### 1. Debug E2E Tests

调试所有 E2E 测试

**使用步骤：**

1. 按 `F5` 或点击 VS Code 左侧的"运行和调试"图标
2. 选择 "Debug E2E Tests"
3. 点击绿色播放按钮或按 `F5`

### 2. Debug Current E2E Test File

调试当前打开的测试文件

**使用步骤：**

1. 在 VS Code 中打开要调试的测试文件（如 `Session.test.ts`）
2. 按 `F5` 或选择 "Debug Current E2E Test File"
3. 在代码中设置断点（点击行号左侧）

### 3. Debug Unit Tests

调试所有单元测试

### 4. Debug All Tests

调试所有测试（单元测试 + E2E 测试）

## 方法二：使用命令行脚本

### Debug E2E 测试

```bash
npm run test:e2e:debug
```

### Debug 所有测试

```bash
npm run test:debug
```

**使用步骤：**

1. 运行上述命令
2. 打开 Chrome 浏览器，访问 `chrome://inspect`
3. 点击 "inspect" 链接
4. 在 Chrome DevTools 中设置断点和调试

## 环境变量配置

E2E 测试需要连接到 IoTDB 实例。可以通过环境变量配置连接信息：

```bash
export IOTDB_HOST=localhost
export IOTDB_PORT=6667
export IOTDB_USER=root
export IOTDB_PASSWORD=root
export LOG_LEVEL=DEBUG  # 开启详细日志
```

### 使用 .env 文件（可选）

创建 `.env` 文件：

```bash
IOTDB_HOST=localhost
IOTDB_PORT=6667
IOTDB_USER=root
IOTDB_PASSWORD=root
LOG_LEVEL=DEBUG
```

然后在终端中执行：

```bash
source .env
npm run test:e2e:debug
```

## 设置断点

### VS Code 中设置断点

1. 在代码行号左侧点击，会出现红色圆点
2. 或者将光标放在要断点的行，按 `F9`

### 常见断点位置

- 测试文件中的 `test()` 函数内部
- Session 或 SessionPool 方法调用前后
- 数据处理逻辑
- 错误处理 `catch` 块

## Debug 技巧

### 1. 使用 `--runInBand`

所有 debug 配置都使用了 `--runInBand` 参数，这会：

- 串行运行测试（而非并行）
- 使调试更稳定
- 避免多个测试同时运行的干扰

### 2. 调试单个测试

在测试文件中，可以临时使用 `test.only()` 来只运行特定测试：

```typescript
test.only("Should execute query statement", async () => {
  // 只运行这个测试
});
```

### 3. 查看详细日志

设置 `LOG_LEVEL=DEBUG` 环境变量可以看到更详细的日志输出：

- Thrift 连接详情
- SQL 语句执行
- 数据序列化/反序列化过程

### 4. 使用 debugger 语句

在代码中直接添加 `debugger;` 语句：

```typescript
test("Should insert data", async () => {
  const tablet = {
    /* ... */
  };
  debugger; // 执行到这里会自动暂停
  await session.insertTablet(tablet);
});
```

## 使用 Docker 启动 IoTDB 实例

如果没有运行的 IoTDB 实例，可以使用 Docker 快速启动：

### 单节点（推荐用于调试）

```bash
docker-compose -f docker-compose-1c1d.yml up -d
```

### 3节点集群

```bash
docker-compose -f docker-compose-3c3d.yml up -d
```

### 停止 IoTDB

```bash
docker-compose -f docker-compose-1c1d.yml down
```

## 故障排查

### 问题：无法连接到 IoTDB

**解决方案：**

1. 检查 IoTDB 是否正在运行
2. 确认环境变量 `IOTDB_HOST` 和 `IOTDB_PORT` 是否正确
3. 查看 IoTDB 日志：`docker logs iotdb-datanode`

### 问题：断点不生效

**解决方案：**

1. 确保使用了 `--inspect-brk` 参数（已在配置中）
2. 检查是否使用了 `--runInBand` 参数（已在配置中）
3. 尝试重启 VS Code

### 问题：测试超时

**解决方案：**

1. 在 `jest.config.js` 中增加超时时间
2. 或在具体测试中设置：`test('...', async () => {...}, 120000)`

## 高级用法

### 条件断点

在 VS Code 中右键点击断点，选择"编辑断点" → "表达式"，可以设置条件：

```javascript
row.length > 10; // 只在满足条件时暂停
```

### Logpoint（日志点）

不想停止执行，只想输出日志？右键断点选择"Logpoint"：

```javascript
result.rows.length: {result.rows.length}
```

### Watch 表达式

在 Debug 面板的 "WATCH" 区域添加表达式，实时监控变量值。

## 示例：调试一个失败的测试

1. 打开 `tests/e2e/Session.test.ts`
2. 在失败的测试中设置断点
3. 选择 "Debug Current E2E Test File" 配置
4. 按 `F5` 开始调试
5. 使用 Debug 工具栏：
   - Continue (F5): 继续执行
   - Step Over (F10): 单步跳过
   - Step Into (F11): 单步进入
   - Step Out (Shift+F11): 跳出当前函数
6. 查看变量面板中的值
7. 在 Debug Console 中执行表达式查看状态

## 参考资源

- [VS Code Debugging Guide](https://code.visualstudio.com/docs/editor/debugging)
- [Jest Debugging Guide](https://jestjs.io/docs/troubleshooting)
- [Node.js Debugging Guide](https://nodejs.org/en/docs/guides/debugging-getting-started/)
