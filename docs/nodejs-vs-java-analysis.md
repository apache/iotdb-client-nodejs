# Node.js SessionPool vs Java SessionPool Analysis

## Overview

This document analyzes the differences between the Node.js IoTDB client's SessionPool implementation and the Java version, and provides Node.js-specific performance optimization recommendations.

## Key Differences

### 1. Concurrency Model

| Aspect | Java | Node.js |
|--------|------|---------|
| **Concurrency Model** | Multi-threaded (Thread Pool) | Single-threaded Event Loop |
| **Parallelism** | True parallel execution | Promise-based async concurrency |
| **Best For** | CPU-bound operations | I/O-bound operations (network) |
| **Session Handling** | Thread-per-session | Session pool with async acquire/release |

**Key Insight**: Node.js excels at I/O-bound operations like database writes. For IoTDB operations, high concurrency levels (10-50) can achieve excellent throughput despite single-threaded execution.

### 2. Batch Insert API

| Feature | Java | Node.js |
|---------|------|---------|
| **insertTablet** | ✅ Single tablet insert | ✅ Single tablet insert |
| **insertTablets** | ✅ Multiple tablets in one RPC | ✅ Added (new) |
| **insertTabletsParallel** | Via thread pool | ✅ Added (new) - Promise.all |
| **sortTablet** | ✅ Client-side sorting | ❌ Not supported by server |

### 3. Pool Configuration

| Configuration | Java Default | Node.js Default | Notes |
|---------------|--------------|-----------------|-------|
| maxPoolSize | 5 | 10 | Node.js can handle higher due to async |
| minPoolSize | 1 | 1 | Same |
| maxIdleTime | 60s | 60s | Same |
| waitTimeout | 60s | 60s | Same |
| enableRedirection | true | true | Same |

## Performance Optimization Recommendations

### 1. Use Batch Tablet Insert (`insertTablets`)

For tree model, inserting multiple tablets in a single RPC call is more efficient:

```typescript
// ❌ Less efficient: Multiple RPC calls
for (const tablet of tablets) {
  await session.insertTablet(tablet);
}

// ✅ More efficient: Single RPC call (tree model only)
await session.insertTablets(tablets);
```

### 2. Use Concurrent Execution with Pool

The SessionPool now provides `insertTabletsParallel` for high-throughput scenarios:

```typescript
import { SessionPool } from 'iotdb-client-nodejs';

const pool = new SessionPool({
  nodeUrls: ['host1:6667', 'host2:6667'],
  maxPoolSize: 20,
});
await pool.init();

// Generate 1000 tablets
const tablets = generateTablets(1000);

// Insert with concurrent execution (uses pool efficiently)
await pool.insertTabletsParallel(tablets, { concurrency: 20 });
```

### 3. Use Generic Concurrent Execution

For custom operations, use `executeParallel`:

```typescript
const devices = Array.from({ length: 100 }, (_, i) => `d${i}`);

await pool.executeParallel(
  devices,
  async (session, deviceId) => {
    await session.executeNonQueryStatement(
      `CREATE TIMESERIES root.sg.${deviceId}.temperature WITH DATATYPE=FLOAT`
    );
    return deviceId;
  },
  { concurrency: 10 }
);
```

### 4. Use Utility Functions for Manual Control

```typescript
import { 
  executeConcurrent, 
  chunkArray, 
  createSemaphore 
} from 'iotdb-client-nodejs';

// Chunk large arrays
const chunks = chunkArray(tablets, 100);

// Process with controlled concurrency
const result = await executeConcurrent(
  tablets,
  async (tablet, index) => {
    await pool.insertTablet(tablet);
    return index;
  },
  { concurrency: 20, logProgressEvery: 100 }
);

console.log(`Success: ${result.successCount}, Failed: ${result.failureCount}`);
```

### 5. Use Semaphore for Fine-Grained Control

```typescript
const sem = createSemaphore(10);  // Max 10 concurrent

async function processItem(item) {
  await sem.acquire();
  try {
    await doWork(item);
  } finally {
    sem.release();
  }
}
```

## Benchmark Comparison

### Java iot-benchmark Features vs Node.js Benchmark

| Feature | Java iot-benchmark | Node.js benchmark |
|---------|-------------------|-------------------|
| Multi-threaded clients | ✅ Thread per client | ✅ Worker pattern (Promise) |
| Device-session binding | ✅ | ✅ |
| Pre-generated data | ✅ | ✅ |
| Metrics collection | ✅ Comprehensive | ✅ Comprehensive |
| Progress reporting | ✅ | ✅ |
| Warmup rounds | ✅ | ✅ |
| Batch insert | ✅ | ✅ |

### Performance Tuning Guide

**Optimal concurrency for Node.js:**

| Scenario | Recommended Concurrency | Notes |
|----------|------------------------|-------|
| Single IoTDB node | 10-20 | Limited by server capacity |
| 3-node cluster | 20-30 | Can distribute load |
| High-latency network | 30-50 | More concurrent to hide latency |
| Low-latency (same DC) | 5-10 | Lower is sufficient |

**Pool size recommendations:**

| Workload | maxPoolSize | minPoolSize | Notes |
|----------|-------------|-------------|-------|
| Light (< 100 ops/s) | 5 | 1 | Default is fine |
| Medium (100-1000 ops/s) | 10-20 | 3 | Scale with load |
| Heavy (> 1000 ops/s) | 20-50 | 10 | May need cluster |

## What's NOT Recommended

### 1. Don't Use Unsupported Server Features

```typescript
// ❌ NOT SUPPORTED: Compressed tablets
const req = {
  ...tablet,
  isCompressed: true,  // Server doesn't support this yet
  compressType: 1,
};

// ❌ NOT SUPPORTED: sortTablet option
// The server doesn't have this optimization, don't implement client-side
```

### 2. Don't Create Too Many Connections

```typescript
// ❌ Bad: Creating new session for each operation
for (const data of dataPoints) {
  const session = new Session(config);
  await session.open();
  await session.insertTablet(data);
  await session.close();
}

// ✅ Good: Use pool
const pool = new SessionPool(config);
await pool.init();
for (const data of dataPoints) {
  await pool.insertTablet(data);  // Automatically manages sessions
}
```

### 3. Don't Block the Event Loop

```typescript
// ❌ Bad: Synchronous CPU-bound work in main thread
const hugeArray = generateHugeDataset();  // Blocks event loop

// ✅ Good: Use worker threads for CPU-bound work, or process in chunks
const chunks = chunkArray(hugeArray, 1000);
for (const chunk of chunks) {
  await processChunk(chunk);  // Async, yields to event loop
}
```

## Running the Comparison Benchmark

To compare the different insertion methods, use the benchmark-comparison tool:

```bash
# Basic usage
node benchmark/benchmark-comparison.js

# With custom settings
TABLET_COUNT=200 CONCURRENCY=20 POOL_SIZE=20 node benchmark/benchmark-comparison.js
```

Expected output shows the comparison between methods:

```
┌─────────────────────────────────────────────┬────────────┬────────────────┬──────────────────┐
│ Method                                      │ Duration   │ Tablets/sec    │ Points/sec       │
├─────────────────────────────────────────────┼────────────┼────────────────┼──────────────────┤
│ Sequential insertTablet                     │  1234.56ms │          81.00 │          16200.00│
│ insertTablets (batch RPC)                   │   234.56ms │         426.32 │          85264.00│
│ insertTabletsParallel (c=10)                │   345.67ms │         289.34 │          57868.00│
└─────────────────────────────────────────────┴────────────┴────────────────┴──────────────────┘

Speedup Analysis:
  insertTablets (batch RPC): 5.26x faster than baseline
  insertTabletsParallel (c=10): 3.57x faster than baseline
```

**Key Findings:**
- `insertTablets` (batch RPC) typically achieves **3-6x speedup** over sequential insertion
- `insertTabletsParallel` achieves **2-4x speedup** with the benefit of error isolation
- Combine both for optimal performance: batch tablets then insert in parallel

## Summary

The Node.js IoTDB client now provides:

1. **`insertTablets`**: Batch insert multiple tablets in one RPC call (tree model)
2. **`insertTabletsParallel`**: Concurrent tablet insertion with pool management
3. **`executeParallel`**: Generic concurrent execution for any operations
4. **Utility functions**: `executeConcurrent`, `chunkArray`, `createSemaphore`

These optimizations leverage Node.js's strengths (async I/O, event loop efficiency) while providing the batch and concurrent execution capabilities comparable to Java's thread-based approach.

## References

- [Node.js Event Loop](https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick/)
- [Java SessionPool](https://github.com/apache/iotdb/blob/master/iotdb-client/session/src/main/java/org/apache/iotdb/session/pool/SessionPool.java)
- [Performance Guide](./performance-guide.md)
- [pg-inspired optimizations](./pg-inspired-optimizations.md)
