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

import { logger } from "../utils/Logger";

/**
 * Column encoding types matching Apache IoTDB ColumnEncoding enum
 */
export enum ColumnEncoding {
  ByteArray = 0, // For BOOLEAN
  Int32Array = 1, // For INT32, DATE, FLOAT
  Int64Array = 2, // For INT64, TIMESTAMP, DOUBLE
  BinaryArray = 3, // For TEXT, STRING, BLOB
  Rle = 4, // Run-Length Encoding (compression)
}

/**
 * Decoded column interface - stores all values for a column
 */
export interface Column {
  dataType: number;
  encoding: ColumnEncoding;
  values: any[];
  nullIndicators: boolean[] | null;
  positionCount: number;
}

/**
 * Column decoder interface
 */
export interface ColumnDecoder {
  readColumn(
    buffer: Buffer,
    offset: number,
    dataType: number,
    positionCount: number,
  ): { column: Column; bytesRead: number };
}

/**
 * Helper functions for deserializing column data
 */
export class ColumnDeserializer {
  /**
   * Deserialize null indicators (bitmap) for a column
   * Format: 1 byte flag (0=no nulls, 1=has nulls) + optional bitmap
   */
  static deserializeNullIndicators(
    buffer: Buffer,
    offset: number,
    positionCount: number,
  ): { nullIndicators: boolean[] | null; bytesRead: number } {
    const mayHaveNull = buffer.readUInt8(offset) !== 0;
    let bytesRead = 1;

    if (!mayHaveNull) {
      return { nullIndicators: null, bytesRead };
    }

    // Read boolean array bitmap
    const { values, bytesRead: bitmapBytes } = this.deserializeBooleanArray(
      buffer,
      offset + 1,
      positionCount,
    );
    bytesRead += bitmapBytes;

    return { nullIndicators: values, bytesRead };
  }

  /**
   * Deserialize boolean array from packed bitmap
   * Each byte stores 8 boolean values (1 bit per value)
   */
  static deserializeBooleanArray(
    buffer: Buffer,
    offset: number,
    size: number,
  ): { values: boolean[]; bytesRead: number } {
    const packedSize = Math.ceil(size / 8);
    const values: boolean[] = new Array(size);

    let currentByte = 0;
    const fullGroups = size & ~0b111; // Round down to nearest 8

    // Process full groups of 8
    for (let pos = 0; pos < fullGroups; pos += 8) {
      const b = buffer.readUInt8(offset + currentByte++);
      values[pos + 0] = (b & 0b10000000) !== 0;
      values[pos + 1] = (b & 0b01000000) !== 0;
      values[pos + 2] = (b & 0b00100000) !== 0;
      values[pos + 3] = (b & 0b00010000) !== 0;
      values[pos + 4] = (b & 0b00001000) !== 0;
      values[pos + 5] = (b & 0b00000100) !== 0;
      values[pos + 6] = (b & 0b00000010) !== 0;
      values[pos + 7] = (b & 0b00000001) !== 0;
    }

    // Handle remaining bits
    if (size % 8 !== 0) {
      const b = buffer.readUInt8(offset + currentByte++);
      let mask = 0b10000000;
      for (let pos = fullGroups; pos < size; pos++) {
        values[pos] = (b & mask) !== 0;
        mask >>= 1;
      }
    }

    return { values, bytesRead: packedSize };
  }
}

/**
 * Decoder for INT32 array encoding (encoding=1)
 * Handles INT32, DATE, and FLOAT data types
 */
class Int32ArrayColumnDecoder implements ColumnDecoder {
  readColumn(
    buffer: Buffer,
    offset: number,
    dataType: number,
    positionCount: number,
  ): { column: Column; bytesRead: number } {
    let currentOffset = offset;

    // Read null indicators
    const { nullIndicators, bytesRead: nullBytes } =
      ColumnDeserializer.deserializeNullIndicators(
        buffer,
        currentOffset,
        positionCount,
      );
    currentOffset += nullBytes;

    const values: any[] = new Array(positionCount);

    switch (dataType) {
      case 1: // INT32
      case 9: // DATE
        for (let i = 0; i < positionCount; i++) {
          if (nullIndicators && nullIndicators[i]) {
            values[i] = null;
            continue;
          }
          values[i] = buffer.readInt32BE(currentOffset);
          currentOffset += 4;
        }
        break;

      case 3: // FLOAT
        for (let i = 0; i < positionCount; i++) {
          if (nullIndicators && nullIndicators[i]) {
            values[i] = null;
            continue;
          }
          values[i] = buffer.readFloatBE(currentOffset);
          currentOffset += 4;
        }
        break;

      default:
        throw new Error(
          `Invalid data type ${dataType} for Int32ArrayColumnDecoder`,
        );
    }

    return {
      column: {
        dataType,
        encoding: ColumnEncoding.Int32Array,
        values,
        nullIndicators,
        positionCount,
      },
      bytesRead: currentOffset - offset,
    };
  }
}

/**
 * Decoder for INT64 array encoding (encoding=2)
 * Handles INT64, TIMESTAMP, and DOUBLE data types
 */
class Int64ArrayColumnDecoder implements ColumnDecoder {
  readColumn(
    buffer: Buffer,
    offset: number,
    dataType: number,
    positionCount: number,
  ): { column: Column; bytesRead: number } {
    let currentOffset = offset;

    // Read null indicators
    const { nullIndicators, bytesRead: nullBytes } =
      ColumnDeserializer.deserializeNullIndicators(
        buffer,
        currentOffset,
        positionCount,
      );
    currentOffset += nullBytes;

    const values: any[] = new Array(positionCount);

    switch (dataType) {
      case 2: // INT64
      case 8: // TIMESTAMP
        for (let i = 0; i < positionCount; i++) {
          if (nullIndicators && nullIndicators[i]) {
            values[i] = null;
            continue;
          }
          values[i] = buffer.readBigInt64BE(currentOffset);
          currentOffset += 8;
        }
        break;

      case 4: // DOUBLE
        for (let i = 0; i < positionCount; i++) {
          if (nullIndicators && nullIndicators[i]) {
            values[i] = null;
            continue;
          }
          values[i] = buffer.readDoubleBE(currentOffset);
          currentOffset += 8;
        }
        break;

      default:
        throw new Error(
          `Invalid data type ${dataType} for Int64ArrayColumnDecoder`,
        );
    }

    return {
      column: {
        dataType,
        encoding: ColumnEncoding.Int64Array,
        values,
        nullIndicators,
        positionCount,
      },
      bytesRead: currentOffset - offset,
    };
  }
}

/**
 * Decoder for BOOLEAN byte array encoding (encoding=0)
 */
class ByteArrayColumnDecoder implements ColumnDecoder {
  readColumn(
    buffer: Buffer,
    offset: number,
    dataType: number,
    positionCount: number,
  ): { column: Column; bytesRead: number } {
    if (dataType !== 0) {
      // BOOLEAN
      throw new Error(
        `Invalid data type ${dataType} for ByteArrayColumnDecoder`,
      );
    }

    let currentOffset = offset;

    // Read null indicators
    const { nullIndicators, bytesRead: nullBytes } =
      ColumnDeserializer.deserializeNullIndicators(
        buffer,
        currentOffset,
        positionCount,
      );
    currentOffset += nullBytes;

    // Read boolean values
    const { values, bytesRead: boolBytes } =
      ColumnDeserializer.deserializeBooleanArray(
        buffer,
        currentOffset,
        positionCount,
      );
    currentOffset += boolBytes;

    return {
      column: {
        dataType,
        encoding: ColumnEncoding.ByteArray,
        values,
        nullIndicators,
        positionCount,
      },
      bytesRead: currentOffset - offset,
    };
  }
}

/**
 * Decoder for BINARY array encoding (encoding=3)
 * Handles TEXT, STRING, and BLOB data types with variable-length values
 */
class BinaryArrayColumnDecoder implements ColumnDecoder {
  readColumn(
    buffer: Buffer,
    offset: number,
    dataType: number,
    positionCount: number,
  ): { column: Column; bytesRead: number } {
    // Supports TEXT(5), BLOB(10), STRING(11)
    if (dataType !== 5 && dataType !== 10 && dataType !== 11) {
      throw new Error(
        `Invalid data type ${dataType} for BinaryArrayColumnDecoder`,
      );
    }

    let currentOffset = offset;

    // Read null indicators
    const { nullIndicators, bytesRead: nullBytes } =
      ColumnDeserializer.deserializeNullIndicators(
        buffer,
        currentOffset,
        positionCount,
      );
    currentOffset += nullBytes;

    const values: any[] = new Array(positionCount);

    for (let i = 0; i < positionCount; i++) {
      if (nullIndicators && nullIndicators[i]) {
        values[i] = null;
        continue;
      }

      // Read length (INT32 BE - Java standard for string/binary lengths)
      const length = buffer.readInt32BE(currentOffset);
      currentOffset += 4;

      // Read data
      const data = buffer.slice(currentOffset, currentOffset + length);
      currentOffset += length;

      // Convert to appropriate type
      if (dataType === 10) {
        // BLOB - keep as Buffer
        values[i] = data;
      } else {
        // TEXT/STRING - convert to UTF-8 string
        values[i] = data.toString("utf8");
      }
    }

    return {
      column: {
        dataType,
        encoding: ColumnEncoding.BinaryArray,
        values,
        nullIndicators,
        positionCount,
      },
      bytesRead: currentOffset - offset,
    };
  }
}

/**
 * Decoder for Run-Length Encoding (encoding=4)
 * Stores a single value that repeats for all positions (compression)
 */
class RunLengthColumnDecoder implements ColumnDecoder {
  readColumn(
    buffer: Buffer,
    offset: number,
    dataType: number,
    positionCount: number,
  ): { column: Column; bytesRead: number } {
    let currentOffset = offset;

    // Read the inner encoding type (1 byte)
    const innerEncoding: ColumnEncoding = buffer.readUInt8(currentOffset);
    currentOffset += 1;

    // Get decoder for inner encoding
    const innerDecoder = BaseColumnDecoder.getDecoder(innerEncoding);

    // Read single value (positionCount=1)
    const { column: innerColumn, bytesRead: innerBytes } =
      innerDecoder.readColumn(buffer, currentOffset, dataType, 1);
    currentOffset += innerBytes;

    // Expand the single value to fill all positions
    const singleValue = innerColumn.values[0];
    const values: any[] = new Array(positionCount).fill(singleValue);

    // Check if the single value is null
    const isNull = innerColumn.nullIndicators && innerColumn.nullIndicators[0];
    const nullIndicators = isNull ? new Array(positionCount).fill(true) : null;

    return {
      column: {
        dataType,
        encoding: ColumnEncoding.Rle,
        values,
        nullIndicators,
        positionCount,
      },
      bytesRead: currentOffset - offset,
    };
  }
}

/**
 * Base column decoder factory (declared after decoder classes)
 */
export class BaseColumnDecoder {
  private static decoders: Map<ColumnEncoding, ColumnDecoder> = new Map([
    [ColumnEncoding.Int32Array, new Int32ArrayColumnDecoder()],
    [ColumnEncoding.Int64Array, new Int64ArrayColumnDecoder()],
    [ColumnEncoding.ByteArray, new ByteArrayColumnDecoder()],
    [ColumnEncoding.BinaryArray, new BinaryArrayColumnDecoder()],
    [ColumnEncoding.Rle, new RunLengthColumnDecoder()],
  ]);

  static getDecoder(encoding: ColumnEncoding): ColumnDecoder {
    const decoder = this.decoders.get(encoding);
    if (!decoder) {
      throw new Error(`Unsupported encoding: ${encoding}`);
    }
    return decoder;
  }
}
