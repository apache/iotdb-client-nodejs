# IoTDB Client Benchmark Tools

Comprehensive performance testing tools for Apache IoTDB Node.js client, inspired by the [thulab/iot-benchmark](https://github.com/thulab/iot-benchmark) project.

## Overview

This benchmark suite provides two specialized tools for testing IoTDB write performance:

- **Tree Model Benchmark** (`benchmark-tree.js`) - Tests timeseries data model using `insertTablet` API
- **Table Model Benchmark** (`benchmark-table.js`) - Tests relational data model using `insertTablet` API

### Key Features

✅ **Pre-generated Test Data** - Eliminates data generation overhead during testing  
✅ **Pre-registered Metadata** - Avoids metadata creation impact on write performance  
✅ **Flexible Configuration** - Extensive parameters for customizing test scenarios  
✅ **Concurrent Testing** - Simulates multiple clients with configurable concurrency  
✅ **Detailed Metrics** - Comprehensive performance statistics including latency percentiles  
✅ **Progress Monitoring** - Real-time progress reporting during long tests  
✅ **Multi-node Support** - Tests against IoTDB clusters with load balancing  

## Quick Start

### Prerequisites

1. Node.js >= 14.0.0
2. Running IoTDB instance (v1.0+)
3. Built IoTDB client library

**Note:** The benchmark tools require a working IoTDB instance. If you encounter connection issues, please ensure:
- IoTDB is fully started and accepting connections
- The host and port are correctly configured
- Network connectivity is available
- The client library's SessionPool is properly initialized

### Testing the Benchmark Infrastructure

To verify the benchmark tools are correctly installed and configured:

```bash
node benchmark/test-benchmark.js
```

This will test the benchmark infrastructure without requiring IoTDB connection, validating:
- Configuration management
- Data generation
- Metrics collection
- Performance reporting

### Build the Client

```bash
npm install
npm run build
```

### Run Tree Model Benchmark

```bash
# Using default settings
node benchmark/benchmark-tree.js

# With custom parameters
DEVICE_NUMBER=50 CLIENT_NUMBER=5 node benchmark/benchmark-tree.js
```

### Run Table Model Benchmark

```bash
# Using default settings
node benchmark/benchmark-table.js

# With custom parameters
DEVICE_NUMBER=50 CLIENT_NUMBER=5 node benchmark/benchmark-table.js
```

## Configuration

All benchmarks support configuration through environment variables. Default values are used if not specified.

### Connection Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `IOTDB_HOST` | `localhost` | IoTDB server host |
| `IOTDB_PORT` | `6667` | IoTDB server port |
| `IOTDB_USER` | `root` | Username for authentication |
| `IOTDB_PASSWORD` | `root` | Password for authentication |
| `NODE_URLS` | - | Multi-node URLs (e.g., `"host1:6667,host2:6668"`) |

### Test Parameters

| Variable | Default | Description |
|----------|---------|-------------|
| `CLIENT_NUMBER` | `10` | Number of concurrent clients |
| `DEVICE_NUMBER` | `100` | Number of devices to simulate |
| `SENSOR_NUMBER` | `10` | Number of sensors per device |
| `BATCH_SIZE_PER_WRITE` | `100` | Data rows per write operation |
| `LOOP` | - | Total execution loops (alternative to TOTAL_DATA_POINTS) |
| `TOTAL_DATA_POINTS` | `100000` | Total data points (used when LOOP not set) |

**Note on LOOP mode**: When `LOOP` is set, total data points = DEVICE_NUMBER × BATCH_SIZE × SENSOR_NUMBER × LOOP. Each loop writes one complete batch for all devices (one tablet per device).

### Data Generation Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `POINT_STEP` | `1000` | Time interval between points (ms) |
| `TIMESTAMP_PRECISION` | `ms` | Timestamp precision (`ms`, `us`, `ns`) |
| `STRING_LENGTH` | `16` | Length of TEXT/STRING values |
| `REGENERATE_DATA` | `false` | Force regenerate test data |
| `DATA_FILE_PATH` | `./benchmark/benchmark_data.json` | Path to pre-generated data |

### Data Type Distribution

Configure the proportion of different sensor types. Must sum to 1.0.

Default distribution:
- FLOAT: 30%
- DOUBLE: 20%
- INT32: 20%
- INT64: 10%
- TEXT: 10%
- BOOLEAN: 10%

### Test Execution Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `WARMUP_ROUNDS` | `0` | Number of warmup iterations |
| `TEST_ROUNDS` | `1` | Number of test iterations |
| `REPORT_INTERVAL` | `5000` | Progress report interval (ms) |
| `ENABLE_DETAILED_METRICS` | `true` | Enable percentile calculations |

### Connection Pool Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `POOL_MAX_SIZE` | `20` | Maximum connections in pool |
| `POOL_MIN_SIZE` | `5` | Minimum connections in pool |
| `POOL_MAX_IDLE_TIME` | `60000` | Maximum idle time (ms) |
| `POOL_WAIT_TIMEOUT` | `60000` | Wait timeout for connection (ms) |
| `ENABLE_DEVICE_SESSION_BINDING` | `false` | Bind devices to sessions (requires DEVICE_NUMBER % POOL_MAX_SIZE == 0) |

**Device-Session Binding**: When enabled, each session is bound to a specific set of devices, avoiding connection redirects and improving performance. Only enable this when DEVICE_NUMBER is evenly divisible by POOL_MAX_SIZE.

## Usage Examples

### Loop-Based Execution (Recommended)

```bash
# Execute 1000 loops, each writing one batch for all devices
LOOP=1000 \
DEVICE_NUMBER=100 \
SENSOR_NUMBER=10 \
BATCH_SIZE_PER_WRITE=100 \
CLIENT_NUMBER=10 \
node benchmark/benchmark-tree.js

# Total data points = 100 devices × 100 rows × 10 sensors × 1000 loops = 100,000,000
```

### Device-Session Binding for Optimal Performance

```bash
# Bind 100 devices to 10 sessions (10 devices per session)
LOOP=1000 \
DEVICE_NUMBER=100 \
SENSOR_NUMBER=10 \
BATCH_SIZE_PER_WRITE=100 \
POOL_MAX_SIZE=10 \
ENABLE_DEVICE_SESSION_BINDING=true \
node benchmark/benchmark-tree.js
```

### Basic Test with Moderate Load (Legacy Mode)

```bash
CLIENT_NUMBER=5 \
DEVICE_NUMBER=50 \
SENSOR_NUMBER=5 \
BATCH_SIZE_PER_WRITE=100 \
TOTAL_DATA_POINTS=50000 \
node benchmark/benchmark-tree.js
```

### High Concurrency Test

```bash
CLIENT_NUMBER=50 \
DEVICE_NUMBER=1000 \
SENSOR_NUMBER=10 \
BATCH_SIZE_PER_WRITE=1000 \
TOTAL_DATA_POINTS=1000000 \
node benchmark/benchmark-tree.js
```

### Multi-Node Cluster Test

```bash
NODE_URLS="node1:6667,node2:6667,node3:6667" \
CLIENT_NUMBER=20 \
DEVICE_NUMBER=500 \
node benchmark/benchmark-tree.js
```

### Test with Custom Data Types

Create a custom configuration file:

```javascript
// custom-config.js
const { createConfig } = require('./benchmark/config');

const config = createConfig({
  CLIENT_NUMBER: 10,
  DEVICE_NUMBER: 100,
  SENSOR_NUMBER: 8,
  INSERT_DATATYPE_PROPORTION: {
    3: 0.5,  // 50% FLOAT
    4: 0.3,  // 30% DOUBLE
    1: 0.2,  // 20% INT32
  },
});

module.exports = config;
```

### Test with Warmup

```bash
WARMUP_ROUNDS=3 \
TEST_ROUNDS=1 \
CLIENT_NUMBER=10 \
node benchmark/benchmark-tree.js
```

### Test with Progress Monitoring

```bash
REPORT_INTERVAL=2000 \
ENABLE_DETAILED_METRICS=true \
CLIENT_NUMBER=10 \
TOTAL_DATA_POINTS=500000 \
node benchmark/benchmark-tree.js
```

## Understanding Results

### Performance Metrics

The benchmark reports the following metrics:

#### Execution Time
- **Duration** - Total test duration in seconds/milliseconds

#### Operations
- **Total Operations** - Number of write operations executed
- **Successful** - Number of successful operations
- **Failed** - Number of failed operations
- **Success Rate** - Percentage of successful operations

#### Data Points
- **Total Points Written** - Total number of data points inserted

#### Throughput
- **Operations/sec** - Write operations per second
- **Points/sec** - Data points inserted per second

#### Latency (milliseconds)
- **Min** - Minimum operation latency
- **Max** - Maximum operation latency
- **Average** - Mean operation latency
- **P50 (Median)** - 50th percentile latency
- **P90** - 90th percentile latency
- **P95** - 95th percentile latency
- **P99** - 99th percentile latency

### Sample Output

```
================================================================================
BENCHMARK RESULTS
================================================================================

[Execution Time]
  Duration:              45.23s (45234ms)

[Operations]
  Total Operations:      1000
  Successful:            998
  Failed:                2
  Success Rate:          99.80%

[Data Points]
  Total Points Written:  100,000

[Throughput]
  Operations/sec:        22.11
  Points/sec:            2,210

[Latency (ms)]
  Min:                   15.23ms
  Max:                   1250.45ms
  Average:               45.23ms
  P50 (Median):          42.15ms
  P90:                   78.45ms
  P95:                   95.23ms
  P99:                   125.67ms

================================================================================
```

## Benchmark Workflow

### 1. Data Preparation Phase
- Checks if pre-generated data exists
- Generates new data if needed or if `REGENERATE_DATA=true`
- Saves generated data to file for reuse
- Data includes all sensor values pre-calculated

### 2. Schema Registration Phase
- Creates storage groups/databases
- Creates timeseries/tables with appropriate data types
- Pre-registers all metadata to avoid creation overhead during testing

### 3. Warmup Phase (Optional)
- Runs limited operations to warm up connections
- Not included in final metrics
- Helps stabilize performance before actual testing

### 4. Main Test Phase
- Spawns concurrent worker clients
- Each worker reads from pre-generated data
- Updates timestamps to current time
- Executes write operations
- Records latency and success/failure
- Reports progress at configured intervals

### 5. Results Analysis Phase
- Calculates throughput metrics
- Computes latency statistics
- Generates percentile distributions
- Prints comprehensive report

## Architecture

### Core Components

```
benchmark/
├── config.js              # Configuration management
├── data-generator.js      # Pre-generate test data
├── schema-manager.js      # Metadata registration
├── benchmark-core.js      # Core benchmark engine
├── benchmark-tree.js      # Tree model entry point
├── benchmark-table.js     # Table model entry point
└── README.md             # This file
```

### Component Responsibilities

- **config.js** - Centralized configuration with validation
- **data-generator.js** - Generates and caches test data
- **schema-manager.js** - Creates and manages database schema
- **benchmark-core.js** - Metrics collection, concurrency control, statistics
- **benchmark-tree.js** - Tree model specific implementation
- **benchmark-table.js** - Table model specific implementation

## Performance Tuning Tips

### 1. Optimize Batch Size
- Larger batches = fewer operations but more data per operation
- Sweet spot typically between 100-1000 rows per batch
- Test different values for your workload

### 2. Adjust Concurrency
- More clients = higher throughput (up to a point)
- Too many clients may saturate server or network
- Start with 10-20 clients and adjust based on results

### 3. Use Connection Pooling
- Set `POOL_MIN_SIZE` to warm up connections
- Set `POOL_MAX_SIZE` based on expected peak concurrency
- Larger pools help with bursty workloads

### 4. Pre-generate Data
- Always use pre-generated data for accurate results
- Set `REGENERATE_DATA=false` after first run
- Cached data eliminates generation overhead

### 5. Monitor System Resources
- Use system monitoring tools (htop, iostat, vmstat)
- Watch CPU, memory, disk I/O, and network
- Identify bottlenecks in client or server

### 6. Network Considerations
- Test with server on same network
- Consider network latency in results
- Use multi-node testing for cluster performance

## Troubleshooting

### Common Issues

#### "Configuration validation failed"
- Check that all proportions sum to 1.0
- Verify numeric parameters are positive
- Ensure required connection parameters are provided

#### "Connection refused" or "Cannot connect"
- Verify IoTDB is running
- Check host and port configuration
- Ensure firewall allows connections

#### "Out of memory" errors
- Reduce `BATCH_SIZE_PER_WRITE`
- Reduce `CLIENT_NUMBER`
- Reduce `TOTAL_DATA_POINTS`
- Increase Node.js heap size: `NODE_OPTIONS=--max-old-space-size=4096`

#### "Schema already exists" warnings
- Normal if rerunning tests
- Clean up with: `DELETE DATABASE root.benchmark.*` (tree model)
- Or: `DROP DATABASE benchmark_db` (table model)

#### Poor performance
- Check server load and resources
- Verify network connectivity
- Try fewer concurrent clients
- Increase batch size
- Enable warmup rounds

## Best Practices

1. **Run Multiple Tests** - Execute several runs and average results
2. **Use Warmup** - Set `WARMUP_ROUNDS=3` for stable results
3. **Monitor Server** - Watch server metrics during tests
4. **Clean Between Tests** - Drop and recreate schema between major tests
5. **Document Configuration** - Save test configurations for reproducibility
6. **Baseline Tests** - Establish baseline before making changes
7. **Isolate Variables** - Change one parameter at a time
8. **Test Realistic Scenarios** - Match production data patterns

## Contributing

Contributions are welcome! Please:

1. Follow existing code style
2. Add comments for complex logic
3. Test thoroughly before submitting
4. Update documentation as needed

## License

Apache License 2.0

## References

- [Apache IoTDB Documentation](https://iotdb.apache.org/)
- [thulab/iot-benchmark](https://github.com/thulab/iot-benchmark)
- [IoTDB Client Documentation](../README.md)
