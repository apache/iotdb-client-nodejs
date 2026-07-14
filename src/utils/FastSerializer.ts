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

import { parseDateToInt } from "./DataTypes";

/**
 * Fast serialization utilities for IoTDB data types
 * Optimized for performance with:
 * - Single exact-size buffer allocation per tablet (no Buffer.concat re-copy)
 * - BigInt-free int64 writes (hi/lo 32-bit pair)
 * - Single-entry string encode cache (TAG columns repeat the same value)
 * - Minimal object allocation
 */

/**
 * Write a 64-bit big-endian signed integer without allocating a BigInt.
 *
 * For any safe integer v (positive or negative):
 *   hi = Math.floor(v / 2^32)  — arithmetic shift, sign-correct
 *   lo = v >>> 0               — ToUint32 performs the mod-2^32 reduction
 * so that hi * 2^32 + lo === v, which is exactly the two's complement
 * representation split into two 32-bit halves.
 *
 * Falls back to writeBigInt64BE for BigInt inputs and non-safe-integer
 * numbers (preserves legacy error behavior for invalid values like 1.5).
 */
export function writeInt64BE(buffer: Buffer, v: number | bigint, offset: number): void {
  if (typeof v === "number" && Number.isSafeInteger(v)) {
    buffer.writeInt32BE(Math.floor(v / 0x100000000), offset);
    buffer.writeUInt32BE(v >>> 0, offset + 4);
  } else {
    buffer.writeBigInt64BE(typeof v === "bigint" ? v : BigInt(v as any), offset);
  }
}

/**
 * Byte length of a BLOB cell value without materializing a Buffer.
 * Accepts Buffer, Uint8Array, UTF-8 string, or array-like of bytes
 * (the same inputs the legacy serializer accepted via Buffer.from).
 */
function blobByteLength(v: any): number {
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) {
    return v.length;
  }
  if (typeof v === "string") {
    return Buffer.byteLength(v, "utf8");
  }
  if (isArrayBufferLike(v)) {
    return v.byteLength; // ArrayBuffer / SharedArrayBuffer have no .length
  }
  return v.length; // array-like of bytes
}

/** ArrayBuffer / SharedArrayBuffer (raw memory, no .length property). */
function isArrayBufferLike(v: any): v is ArrayBufferLike {
  return (
    v instanceof ArrayBuffer ||
    (typeof SharedArrayBuffer !== "undefined" && v instanceof SharedArrayBuffer)
  );
}

/**
 * Serialize BOOLEAN column (1 byte per value)
 */
export function serializeBooleanColumn(values: any[]): Buffer {
  const buffer = Buffer.allocUnsafe(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    buffer[i] = (v === null || v === undefined) ? 0 : (v ? 1 : 0);
  }
  return buffer;
}

/**
 * Serialize INT32 column (4 bytes per value, big-endian)
 */
export function serializeInt32Column(values: any[]): Buffer {
  const buffer = Buffer.allocUnsafe(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    buffer.writeInt32BE(v === null || v === undefined ? 0 : v, i * 4);
  }
  return buffer;
}

/**
 * Serialize INT64 column (8 bytes per value, big-endian)
 * Optimized: BigInt-free hi/lo writes for number inputs
 */
export function serializeInt64Column(values: any[]): Buffer {
  const buffer = Buffer.allocUnsafe(values.length * 8);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || v === undefined) {
      buffer.writeInt32BE(0, i * 8);
      buffer.writeUInt32BE(0, i * 8 + 4);
    } else {
      writeInt64BE(buffer, v, i * 8);
    }
  }
  return buffer;
}

/**
 * Serialize FLOAT column (4 bytes per value, big-endian)
 */
export function serializeFloatColumn(values: any[]): Buffer {
  const buffer = Buffer.allocUnsafe(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    buffer.writeFloatBE(v === null || v === undefined ? 0.0 : v, i * 4);
  }
  return buffer;
}

/**
 * Serialize DOUBLE column (8 bytes per value, big-endian)
 */
export function serializeDoubleColumn(values: any[]): Buffer {
  const buffer = Buffer.allocUnsafe(values.length * 8);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    buffer.writeDoubleBE(v === null || v === undefined ? 0.0 : v, i * 8);
  }
  return buffer;
}

/**
 * Serialize TEXT/STRING column (4 bytes length + UTF-8 bytes per value)
 * Optimized: single-entry encode cache — TAG columns repeat the same string
 * for every row of a tablet, so the encoded Buffer is reused on consecutive
 * identical values instead of re-encoding.
 */
export function serializeTextColumn(values: any[]): Buffer {
  // Phase 1: Calculate total size (byteLength only — no Buffer allocation)
  let totalSize = 0;
  let lastSizeStr: string | null = null;
  let lastSizeLen = 0;

  for (const v of values) {
    if (v === null || v === undefined) {
      totalSize += 4;
      continue;
    }
    const str = typeof v === "string" ? v : String(v);
    if (str !== lastSizeStr) {
      lastSizeLen = Buffer.byteLength(str, "utf8");
      lastSizeStr = str;
    }
    totalSize += 4 + lastSizeLen;
  }

  // Phase 2: Single allocation, encode with single-entry cache
  const result = Buffer.allocUnsafe(totalSize);
  let offset = 0;
  let lastStr: string | null = null;
  let lastBuf: Buffer | null = null;

  for (const v of values) {
    if (v === null || v === undefined) {
      result.writeInt32BE(0, offset);
      offset += 4;
      continue;
    }
    const str = typeof v === "string" ? v : String(v);
    if (str !== lastStr || lastBuf === null) {
      lastBuf = Buffer.from(str, "utf8");
      lastStr = str;
    }
    result.writeInt32BE(lastBuf.length, offset);
    offset += 4;
    lastBuf.copy(result, offset);
    offset += lastBuf.length;
  }

  return result;
}

/**
 * Serialize TIMESTAMP column (8 bytes per value, big-endian)
 * Handles both Date objects and numeric timestamps
 * Optimized: BigInt-free hi/lo writes
 */
export function serializeTimestampColumn(values: any[]): Buffer {
  const buffer = Buffer.allocUnsafe(values.length * 8);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || v === undefined) {
      buffer.writeInt32BE(0, i * 8);
      buffer.writeUInt32BE(0, i * 8 + 4);
    } else {
      writeInt64BE(buffer, v instanceof Date ? v.getTime() : v, i * 8);
    }
  }
  return buffer;
}

/**
 * Serialize DATE column (4 bytes per value, INT32 yyyyMMdd encoding)
 */
export function serializeDateColumn(values: any[]): Buffer {
  const buffer = Buffer.allocUnsafe(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const encoded = v === null || v === undefined ? 0 : parseDateToInt(v);
    buffer.writeInt32BE(encoded, i * 4);
  }
  return buffer;
}

/**
 * Serialize BLOB column (4 bytes length + binary data per value)
 * Two-pass approach to pre-calculate total size
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
  const result = Buffer.allocUnsafe(totalSize);
  let offset = 0;

  for (const blob of blobBuffers) {
    result.writeInt32BE(blob.length, offset);
    offset += 4;
    blob.copy(result, offset);
    offset += blob.length;
  }

  return result;
}

/**
 * Serialize timestamps array to buffer (used by insertTablet)
 * Optimized: BigInt-free hi/lo writes (timestamps are safe integers)
 */
export function serializeTimestamps(timestamps: number[]): Buffer {
  const buffer = Buffer.allocUnsafe(timestamps.length * 8);
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];
    if (typeof t !== "number" || !Number.isFinite(t)) {
      throw new Error(`Invalid timestamp at index ${i}: ${t}`);
    }
    const v = Math.floor(t);
    buffer.writeInt32BE(Math.floor(v / 0x100000000), i * 8);
    buffer.writeUInt32BE(v >>> 0, i * 8 + 4);
  }
  return buffer;
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

/**
 * Serialize a whole tablet's values (all columns + null bitmaps) into ONE buffer.
 *
 * Wire format (identical to the legacy per-column path):
 *   [col0 data][col1 data]...[colN data]
 *   then per column: [hasNull flag byte][bitmap bytes, only when flag=1]
 *   Bitmap: ceil(rowCount/8) bytes, LSB-first, bit=1 means NULL.
 *
 * Optimizations over the legacy path:
 * - No rows→columns transpose (reads values[row][col] directly)
 * - No per-column intermediate buffers or boolean[] bitmaps
 * - No trailing Buffer.concat (exact data size pre-computed; bitmap section
 *   allocated worst-case and trimmed with a zero-copy subarray)
 * - Null bitmaps are packed inline during the value pass; the flag byte
 *   stays 0 and no bitmap bytes are emitted when a column has no nulls
 *
 * @param values Row-major tablet values: values[rowIndex][colIndex]
 * @param dataTypes TSDataType code per column
 * @param rowCount Number of rows
 */
export function serializeTabletValuesFast(
  values: any[][],
  dataTypes: number[],
  rowCount: number,
): Buffer {
  const numCols = dataTypes.length;
  const bitmapBytes = Math.ceil(rowCount / 8);

  // ---- Pass 1: exact data-section size (fixed widths from schema; one
  // byteLength scan for variable-width columns, memoizing repeated strings) ----
  let dataSize = 0;
  for (let c = 0; c < numCols; c++) {
    switch (dataTypes[c]) {
      case 0: // BOOLEAN
        dataSize += rowCount;
        break;
      case 1: // INT32
      case 3: // FLOAT
      case 9: // DATE
        dataSize += rowCount * 4;
        break;
      case 2: // INT64
      case 4: // DOUBLE
      case 8: // TIMESTAMP
        dataSize += rowCount * 8;
        break;
      case 5: // TEXT
      case 11: { // STRING
        let lastStr: string | null = null;
        let lastLen = 0;
        for (let r = 0; r < rowCount; r++) {
          const v = values[r][c];
          if (v === null || v === undefined) {
            dataSize += 4;
            continue;
          }
          const str = typeof v === "string" ? v : String(v);
          if (str !== lastStr) {
            lastLen = Buffer.byteLength(str, "utf8");
            lastStr = str;
          }
          dataSize += 4 + lastLen;
        }
        break;
      }
      case 10: { // BLOB
        for (let r = 0; r < rowCount; r++) {
          const v = values[r][c];
          dataSize += 4 + (v === null || v === undefined ? 0 : blobByteLength(v));
        }
        break;
      }
      default:
        throw new Error(`Unsupported data type: ${dataTypes[c]}`);
    }
  }

  // Single allocation: data section + worst-case bitmap section
  // (flag byte per column + bitmap per column); trimmed at the end.
  const buffer = Buffer.allocUnsafe(dataSize + numCols * (1 + bitmapBytes));

  // ---- Pass 2: write values and pack null bitmaps inline ----
  let off = 0; // data-section write offset
  let bmOff = dataSize; // bitmap-section write offset (compact)

  for (let c = 0; c < numCols; c++) {
    const flagPos = bmOff;
    buffer[flagPos] = 0; // hasNull flag; flipped on first null
    let hasNull = false;

    // Marks row r as NULL: lazily initializes this column's bitmap region.
    const markNull = (r: number): void => {
      if (!hasNull) {
        hasNull = true;
        buffer[flagPos] = 1;
        buffer.fill(0, flagPos + 1, flagPos + 1 + bitmapBytes);
      }
      buffer[flagPos + 1 + (r >>> 3)] |= 1 << (r & 7);
    };

    switch (dataTypes[c]) {
      case 0: // BOOLEAN
        for (let r = 0; r < rowCount; r++) {
          const v = values[r][c];
          if (v === null || v === undefined) {
            markNull(r);
            buffer[off] = 0;
          } else {
            buffer[off] = v ? 1 : 0;
          }
          off += 1;
        }
        break;
      case 1: // INT32
        for (let r = 0; r < rowCount; r++) {
          const v = values[r][c];
          if (v === null || v === undefined) {
            markNull(r);
            buffer.writeInt32BE(0, off);
          } else {
            buffer.writeInt32BE(v, off);
          }
          off += 4;
        }
        break;
      case 2: // INT64
        for (let r = 0; r < rowCount; r++) {
          const v = values[r][c];
          if (v === null || v === undefined) {
            markNull(r);
            buffer.writeInt32BE(0, off);
            buffer.writeUInt32BE(0, off + 4);
          } else {
            writeInt64BE(buffer, v, off);
          }
          off += 8;
        }
        break;
      case 3: // FLOAT
        for (let r = 0; r < rowCount; r++) {
          const v = values[r][c];
          if (v === null || v === undefined) {
            markNull(r);
            buffer.writeFloatBE(0.0, off);
          } else {
            buffer.writeFloatBE(v, off);
          }
          off += 4;
        }
        break;
      case 4: // DOUBLE
        for (let r = 0; r < rowCount; r++) {
          const v = values[r][c];
          if (v === null || v === undefined) {
            markNull(r);
            buffer.writeDoubleBE(0.0, off);
          } else {
            buffer.writeDoubleBE(v, off);
          }
          off += 8;
        }
        break;
      case 5: // TEXT
      case 11: { // STRING
        // Single-entry encode cache: TAG columns repeat one string per tablet
        let lastStr: string | null = null;
        let lastBuf: Buffer | null = null;
        for (let r = 0; r < rowCount; r++) {
          const v = values[r][c];
          if (v === null || v === undefined) {
            markNull(r);
            buffer.writeInt32BE(0, off);
            off += 4;
            continue;
          }
          const str = typeof v === "string" ? v : String(v);
          if (str !== lastStr || lastBuf === null) {
            lastBuf = Buffer.from(str, "utf8");
            lastStr = str;
          }
          buffer.writeInt32BE(lastBuf.length, off);
          off += 4;
          lastBuf.copy(buffer, off);
          off += lastBuf.length;
        }
        break;
      }
      case 8: // TIMESTAMP
        for (let r = 0; r < rowCount; r++) {
          const v = values[r][c];
          if (v === null || v === undefined) {
            markNull(r);
            buffer.writeInt32BE(0, off);
            buffer.writeUInt32BE(0, off + 4);
          } else {
            writeInt64BE(buffer, v instanceof Date ? v.getTime() : v, off);
          }
          off += 8;
        }
        break;
      case 9: // DATE (INT32 yyyyMMdd encoding)
        for (let r = 0; r < rowCount; r++) {
          const v = values[r][c];
          if (v === null || v === undefined) {
            markNull(r);
            buffer.writeInt32BE(0, off);
          } else {
            buffer.writeInt32BE(parseDateToInt(v), off);
          }
          off += 4;
        }
        break;
      case 10: { // BLOB
        for (let r = 0; r < rowCount; r++) {
          const v = values[r][c];
          if (v === null || v === undefined) {
            markNull(r);
            buffer.writeInt32BE(0, off);
            off += 4;
            continue;
          }
          // Write directly into the target buffer — no intermediate
          // Buffer.from() materialization (sizing used blobByteLength).
          const len = blobByteLength(v);
          buffer.writeInt32BE(len, off);
          off += 4;
          if (Buffer.isBuffer(v)) {
            v.copy(buffer, off);
          } else if (v instanceof Uint8Array) {
            buffer.set(v, off);
          } else if (typeof v === "string") {
            buffer.write(v, off, "utf8");
          } else if (isArrayBufferLike(v)) {
            // Raw memory: wrap in a zero-copy Uint8Array view to bulk-copy.
            buffer.set(new Uint8Array(v), off);
          } else {
            // Array-like of bytes (legacy accepted input)
            for (let i = 0; i < len; i++) {
              buffer[off + i] = v[i];
            }
          }
          off += len;
        }
        break;
      }
      default:
        throw new Error(`Unsupported data type: ${dataTypes[c]}`);
    }

    bmOff = flagPos + 1 + (hasNull ? bitmapBytes : 0);
  }

  // Zero-copy trim: unused worst-case bitmap space is dropped
  return buffer.subarray(0, bmOff);
}
