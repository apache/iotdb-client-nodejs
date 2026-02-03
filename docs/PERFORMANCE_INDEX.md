# Performance Documentation Index

This document provides an overview of all performance-related documentation in the IoTDB Node.js client.

## 📊 Performance Documentation Overview

### Quick Navigation

- **Want to improve performance?** → Start with [Performance Guide](performance-guide.md)
- **Understanding the optimizations?** → See [pg-Inspired Optimizations](pg-inspired-optimizations.md)
- **Analyzing pool performance?** → Check [Performance Analysis Summary](../PERFORMANCE_ANALYSIS_SUMMARY.md)
- **Using redirection optimization?** → Read [Redirection Design](redirection-design.md)

## 📚 Performance Documents

### 1. Performance Guide (User-Focused)
**File:** [performance-guide.md](performance-guide.md)  
**Audience:** Users wanting to optimize their IoTDB client usage  
**Length:** ~331 lines

**Contents:**
- Overview of implemented optimizations
- Configuration options (`enableFastSerialization`)
- Usage examples and best practices
- Performance benchmarks
- Troubleshooting guide
- When to use columnar vs iterator patterns

**Key Features Covered:**
- Buffer Pooling (70-80% GC reduction)
- Fast Serialization (1.5-2x faster)
- Optimized Timestamp Handling (20-30% faster)
- Columnar Result Format (2-3x faster queries)

### 2. pg-Inspired Optimizations (Developer-Focused)
**File:** [pg-inspired-optimizations.md](pg-inspired-optimizations.md)  
**Audience:** Developers wanting to understand implementation details  
**Length:** ~447 lines

**Contents:**
- Problem statement and research analysis
- What makes pg nodejs fast
- Implementation details (Phase 1+2)
- Architecture diagrams (before/after)
- Code examples and patterns
- Testing strategy
- Future roadmap (Phase 3)

**Technical Deep Dives:**
- Buffer pooling system design
- Fast serializer implementation
- Columnar result API design
- Memory optimization techniques

### 3. Performance Analysis Summary (Post-Mortem)
**File:** [../PERFORMANCE_ANALYSIS_SUMMARY.md](../PERFORMANCE_ANALYSIS_SUMMARY.md)  
**Audience:** Developers, contributors, and maintainers  
**Length:** ~281 lines

**Contents:**
- Executive summary of pool optimization testing
- Performance regression data (7.4x degradation discovered)
- Root cause analysis
- Actions taken (reverted optimizations)
- Lessons learned

**Key Findings:**
- FIFO queue overhead analysis
- Lifecycle tracking overhead impact
- Why simple is sometimes better
- Benchmark methodology issues

### 4. Redirection Design (Advanced Feature)
**File:** [redirection-design.md](redirection-design.md)  
**Audience:** Users of multi-node clusters  
**Length:** ~524 lines

**Contents:**
- Client-side redirection optimization
- How IoTDB distributes data
- RedirectCache implementation
- Configuration options
- Usage examples
- Performance impact

## 📈 Performance Improvements Summary

### Implemented (Phase 1+2)
✅ **2-3x overall performance improvement**

| Feature | Improvement | Status |
|---------|-------------|--------|
| Buffer Pooling | 70-80% GC reduction | ✅ Implemented |
| Fast Serialization | 1.5-2x faster writes | ✅ Implemented |
| Timestamp Handling | 20-30% faster | ✅ Implemented |
| Columnar Results | 2-3x faster queries | ✅ Implemented |
| Redirection Caching | Reduces network hops | ✅ Implemented |

### Tested & Reverted (Lessons Learned)
❌ **Pool "optimizations" causing 7.4x degradation**

| Feature | Impact | Status |
|---------|--------|--------|
| FIFO Queue | 7.4x slower RPC | ❌ Reverted |
| Lifecycle Tracking | Added overhead | ❌ Reverted |

**Lesson:** Sometimes simple is better. Complex optimizations need real-world benchmarking.

## 🎯 Performance Benchmarks

### Write Performance

| Scenario | Before | After | Improvement |
|----------|--------|-------|-------------|
| Small batch (10 rows) | 2.5ms | 1.8ms | **1.4x** |
| Medium batch (100 rows) | 15ms | 6ms | **2.5x** |
| Large batch (1000 rows) | 180ms | 65ms | **2.8x** |

### Query Performance (with Columnar API)

| Result Size | Iterator | Columnar | Improvement |
|-------------|----------|----------|-------------|
| 1K rows | 45ms | 18ms | **2.5x** |
| 10K rows | 520ms | 180ms | **2.9x** |
| 100K rows | 5800ms | 1900ms | **3.1x** |

### Memory Usage

| Operation | Before | After | Improvement |
|-----------|--------|-------|-------------|
| GC Events (10K writes) | 150 | 45 | **70% reduction** |
| GC Events (100K query) | 280 | 60 | **78% reduction** |

## 🔧 Configuration & Usage

### Enable Fast Serialization (Default)

```typescript
import { Session } from 'iotdb-client-nodejs';

const session = new Session({
  host: 'localhost',
  port: 6667,
  enableFastSerialization: true,  // Default: true
});
```

### Use Columnar Results for Analytics

```typescript
const dataSet = await session.executeQueryStatement('SELECT temp FROM root.sensors');

// Columnar format: zero object allocation
const columnar = await dataSet.toColumnar();
const avg = columnar.values[0].reduce((a, b) => a + b) / columnar.values[0].length;

await dataSet.close();
```

### Enable Redirection (Multi-Node)

```typescript
import { SessionPool } from 'iotdb-client-nodejs';

const pool = new SessionPool({
  nodeUrls: ['node1:6667', 'node2:6667', 'node3:6667'],
  maxPoolSize: 20,
  enableRedirection: true,      // Default: true
  redirectCacheTTL: 300000,     // 5 minutes
});
```

## 📖 Reading Order Recommendation

### For Users (Just Want Performance)
1. Start with [Performance Guide](performance-guide.md)
2. Check [Redirection Design](redirection-design.md) if using multi-node clusters
3. Reference [Performance Analysis Summary](../PERFORMANCE_ANALYSIS_SUMMARY.md) to understand what NOT to do

### For Developers (Want to Understand)
1. Read [pg-Inspired Optimizations](pg-inspired-optimizations.md) for implementation details
2. Check [Performance Analysis Summary](../PERFORMANCE_ANALYSIS_SUMMARY.md) for lessons learned
3. Reference [Performance Guide](performance-guide.md) for usage patterns
4. See [Redirection Design](redirection-design.md) for advanced optimization

### For Contributors (Want to Improve)
1. Start with [Performance Analysis Summary](../PERFORMANCE_ANALYSIS_SUMMARY.md) to understand past mistakes
2. Read [pg-Inspired Optimizations](pg-inspired-optimizations.md) for current implementation
3. Check [Performance Guide](performance-guide.md) for expected behavior
4. Review benchmark code in [../benchmark/README.md](../benchmark/README.md)

## 🚀 Future Work

### Planned Improvements (Phase 3)
- Streaming/cursor API with backpressure
- Request pipelining
- Prepared statement caching
- Optional native bindings

**Note:** Pool FIFO queue and lifecycle management were attempted but reverted due to performance regression. See [Performance Analysis Summary](../PERFORMANCE_ANALYSIS_SUMMARY.md) for details.

## 🐛 Troubleshooting

### High Memory Usage
- Clear buffer pool periodically: `globalBufferPool.clear()`
- Use iterator pattern for large result sets instead of `toColumnar()`
- Check buffer pool stats: `globalBufferPool.getStats()`

### Slow Serialization
- Enable debug logging: `process.env.LOG_LEVEL = 'debug'`
- Check for disabled fast serialization
- Verify batch sizes are appropriate (100-1000 rows)

### Unexpected Results
- Disable fast serialization for debugging: `enableFastSerialization: false`
- Check [Performance Guide](performance-guide.md) troubleshooting section
- Review [Performance Analysis Summary](../PERFORMANCE_ANALYSIS_SUMMARY.md) for known issues

## 📞 Support

- **Documentation Issues:** Check [docs/README.md](README.md)
- **Performance Issues:** Open an issue with benchmark results
- **Questions:** See [Contributing Guidelines](../CONTRIBUTING.md)

---

**Last Updated:** 2026-02-03  
**Status:** Phase 1+2 Complete, Phase 3 Planned
