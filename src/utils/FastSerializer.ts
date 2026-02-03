/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { globalBufferPool } from "./BufferPool";

/**
 * Fast serialization utilities for IoTDB data types
 * Optimized for performance with:
 * - Pre-allocated buffers
 * - Buffer pooling
 * - Single-pass serialization
 * - Minimal object allocation
 * 
 * Inspired by pg nodejs client's serialization strategy
 */

/**
 * Serialize BOOLEAN column (1 byte per value)
 * Optimized: Single buffer allocation
 */
export function serializeBooleanColumn(values: any[]): Buffer {
  // For small buffers, direct allocation is faster than pooling
  const buffer = Buffer.allocUnsafe(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    buffer[i] = (v === null || v === undefined) ? 0 : (v ? 1 : 0);
  }
  return buffer;
}

/**
 * Serialize INT32 column (4 bytes per value, big-endian)
 * Optimized: Single buffer allocation with direct writes
 */
export function serializeInt32Column(values: any[]): Buffer {
  const size = values.length * 4;
  const buffer = size >= 1024 ? globalBufferPool.acquire(size) : Buffer.allocUnsafe(size);
  
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    buffer.writeInt32BE(v === null || v === undefined ? 0 : v, i * 4);
  }
  
  return buffer.subarray(0, size);
}

/**
 * Serialize INT64 column (8 bytes per value, big-endian)
 * Optimized: Single buffer allocation with direct writes
 */
export function serializeInt64Column(values: any[]): Buffer {
  const size = values.length * 8;
  const buffer = size >= 1024 ? globalBufferPool.acquire(size) : Buffer.allocUnsafe(size);
  
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    buffer.writeBigInt64BE(
      v === null || v === undefined ? BigInt(0) : BigInt(v),
      i * 8
    );
  }
  
  return buffer.subarray(0, size);
}

/**
 * Serialize FLOAT column (4 bytes per value, big-endian)
 * Optimized: Single buffer allocation with direct writes
 */
export function serializeFloatColumn(values: any[]): Buffer {
  const size = values.length * 4;
  const buffer = size >= 1024 ? globalBufferPool.acquire(size) : Buffer.allocUnsafe(size);
  
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    buffer.writeFloatBE(v === null || v === undefined ? 0.0 : v, i * 4);
  }
  
  return buffer.subarray(0, size);
}

/**
 * Serialize DOUBLE column (8 bytes per value, big-endian)
 * Optimized: Single buffer allocation with direct writes
 */
export function serializeDoubleColumn(values: any[]): Buffer {
  const size = values.length * 8;
  const buffer = size >= 1024 ? globalBufferPool.acquire(size) : Buffer.allocUnsafe(size);
  
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    buffer.writeDoubleBE(v === null || v === undefined ? 0.0 : v, i * 8);
  }
  
  return buffer.subarray(0, size);
}

/**
 * Serialize TEXT/STRING column (4 bytes length + UTF-8 bytes per value)
 * Optimized: Two-pass approach to pre-calculate total size
 */
export function serializeTextColumn(values: any[]): Buffer {
  // Phase 1: Calculate total size and prepare string buffers
  const strBuffers: Buffer[] = [];
  let totalSize = 0;
  
  for (const v of values) {
    const str = v === null || v === undefined ? "" : String(v);
    const strBytes = Buffer.from(str, "utf8");
    strBuffers.push(strBytes);
    totalSize += 4 + strBytes.length;
  }
  
  // Phase 2: Single allocation and copy
  const result = totalSize >= 1024 ? globalBufferPool.acquire(totalSize) : Buffer.allocUnsafe(totalSize);
  let offset = 0;
  
  for (const strBytes of strBuffers) {
    result.writeInt32BE(strBytes.length, offset);
    offset += 4;
    strBytes.copy(result, offset);
    offset += strBytes.length;
  }
  
  return result.subarray(0, totalSize);
}

/**
 * Serialize TIMESTAMP column (8 bytes per value, big-endian)
 * Handles both Date objects and numeric timestamps
 * Optimized: Single buffer allocation with direct writes
 */
export function serializeTimestampColumn(values: any[]): Buffer {
  const size = values.length * 8;
  const buffer = size >= 1024 ? globalBufferPool.acquire(size) : Buffer.allocUnsafe(size);
  
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    let timestamp = BigInt(0);
    if (v !== null && v !== undefined) {
      if (v instanceof Date) {
        timestamp = BigInt(v.getTime());
      } else {
        timestamp = BigInt(v);
      }
    }
    buffer.writeBigInt64BE(timestamp, i * 8);
  }
  
  return buffer.subarray(0, size);
}

/**
 * Serialize DATE column (4 bytes per value, days since epoch)
 * Optimized: Single buffer allocation with direct writes
 */
export function serializeDateColumn(values: any[]): Buffer {
  const size = values.length * 4;
  const buffer = size >= 1024 ? globalBufferPool.acquire(size) : Buffer.allocUnsafe(size);
  
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    let days = 0;
    if (v !== null && v !== undefined) {
      if (v instanceof Date) {
        days = Math.floor(v.getTime() / (24 * 60 * 60 * 1000));
      } else {
        days = v;
      }
    }
    buffer.writeInt32BE(days, i * 4);
  }
  
  return buffer.subarray(0, size);
}

/**
 * Serialize BLOB column (4 bytes length + binary data per value)
 * Optimized: Two-pass approach to pre-calculate total size
 */
export function serializeBlobColumn(values: any[]): Buffer {
  // Phase 1: Calculate total size and prepare blob buffers
  const blobBuffers: Buffer[] = [];
  let totalSize = 0;
  
  for (const v of values) {
    const blob = v === null || v === undefined
      ? Buffer.alloc(0)
      : Buffer.isBuffer(v)
        ? v
        : Buffer.from(v);
    blobBuffers.push(blob);
    totalSize += 4 + blob.length;
  }
  
  // Phase 2: Single allocation and copy
  const result = totalSize >= 1024 ? globalBufferPool.acquire(totalSize) : Buffer.allocUnsafe(totalSize);
  let offset = 0;
  
  for (const blob of blobBuffers) {
    result.writeInt32BE(blob.length, offset);
    offset += 4;
    blob.copy(result, offset);
    offset += blob.length;
  }
  
  return result.subarray(0, totalSize);
}

/**
 * Serialize timestamps array to buffer (used by insertTablet)
 * Optimized: Direct conversion to BigInt buffer
 */
export function serializeTimestamps(timestamps: number[]): Buffer {
  const size = timestamps.length * 8;
  const buffer = size >= 1024 ? globalBufferPool.acquire(size) : Buffer.allocUnsafe(size);
  
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];
    if (typeof t !== "number" || !Number.isFinite(t)) {
      throw new Error(`Invalid timestamp at index ${i}: ${t}`);
    }
    buffer.writeBigInt64BE(BigInt(Math.floor(t)), i * 8);
  }
  
  return buffer.subarray(0, size);
}

/**
 * Fast column serializer dispatch
 * Maps data type to appropriate serialization function
 */
export function serializeColumnFast(values: any[], dataType: number): Buffer {
  switch (dataType) {
    case 0: // BOOLEAN
      return serializeBooleanColumn(values);
    case 1: // INT32
      return serializeInt32Column(values);
    case 2: // INT64
      return serializeInt64Column(values);
    case 3: // FLOAT
      return serializeFloatColumn(values);
    case 4: // DOUBLE
      return serializeDoubleColumn(values);
    case 5: // TEXT
    case 11: // STRING
      return serializeTextColumn(values);
    case 8: // TIMESTAMP
      return serializeTimestampColumn(values);
    case 9: // DATE
      return serializeDateColumn(values);
    case 10: // BLOB
      return serializeBlobColumn(values);
    default:
      throw new Error(`Unsupported data type: ${dataType}`);
  }
}
