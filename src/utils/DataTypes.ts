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

/**
 * TSDataType enum for Apache IoTDB data types
 * Based on Apache TSFile type definitions
 *
 * @see https://github.com/apache/tsfile/blob/develop/java/common/src/main/java/org/apache/tsfile/enums/TSDataType.java
 */
export enum TSDataType {
  /**
   * Boolean type - stored as 1 byte (1 for true, 0 for false)
   * JavaScript type: boolean
   */
  BOOLEAN = 0,

  /**
   * 32-bit signed integer
   * JavaScript type: number
   * Storage size: 4 bytes
   */
  INT32 = 1,

  /**
   * 64-bit signed integer
   * JavaScript type: bigint (recommended) or number (may lose precision)
   * Storage size: 8 bytes
   */
  INT64 = 2,

  /**
   * 32-bit floating point number
   * JavaScript type: number
   * Storage size: 4 bytes
   */
  FLOAT = 3,

  /**
   * 64-bit floating point number
   * JavaScript type: number
   * Storage size: 8 bytes
   */
  DOUBLE = 4,

  /**
   * UTF-8 encoded text string
   * JavaScript type: string
   * Storage size: variable (4-byte length prefix + UTF-8 content)
   */
  TEXT = 5,

  // VECTOR = 6,    // Reserved - not yet implemented
  // UNKNOWN = 7,   // Reserved - not yet implemented

  /**
   * Timestamp with millisecond precision
   * JavaScript type: Date or number (milliseconds since epoch)
   * Storage size: 8 bytes (stored as INT64)
   */
  TIMESTAMP = 8,

  /**
   * Date with day precision (no time component)
   * JavaScript type: Date or number (yyyyMMdd integer, e.g. 20240101)
   * Storage size: 4 bytes (stored as INT32, encoded as year*10000 + month*100 + day)
   */
  DATE = 9,

  /**
   * Binary large object (BLOB)
   * JavaScript type: Buffer
   * Storage size: variable (4-byte length prefix + binary content)
   */
  BLOB = 10,

  /**
   * UTF-8 encoded string (similar to TEXT)
   * JavaScript type: string
   * Storage size: variable (4-byte length prefix + UTF-8 content)
   */
  STRING = 11,

  // OBJECT = 12,   // Reserved - not yet implemented
}

/**
 * Convert a JavaScript Date (or an already-encoded yyyyMMdd number) to the
 * IoTDB DATE wire format: an INT32 encoded as year*10000 + month*100 + day
 * (e.g. 2024-01-01 -> 20240101).
 *
 * This matches the Java client's DateUtils.parseDateExpressionToInt and the
 * C# client. The calendar date is taken from the Date's UTC components,
 * consistent with `new Date("2024-01-01")` which parses as UTC midnight.
 *
 * @param value - Date object or a yyyyMMdd integer (passed through unchanged)
 * @returns The yyyyMMdd integer encoding
 */
export function parseDateToInt(value: Date | number): number {
  if (value instanceof Date) {
    return (
      value.getUTCFullYear() * 10000 +
      (value.getUTCMonth() + 1) * 100 +
      value.getUTCDate()
    );
  }
  return value;
}

/**
 * Convert an IoTDB DATE wire value (INT32, year*10000 + month*100 + day)
 * back to a JavaScript Date at UTC midnight of that calendar date.
 *
 * Inverse of {@link parseDateToInt}; matches the Java client's
 * DateUtils.parseIntToDate.
 *
 * @param value - The yyyyMMdd integer (e.g. 20240101)
 * @returns Date at UTC midnight of the encoded calendar date
 */
export function parseIntToDate(value: number): Date {
  const year = Math.trunc(value / 10000);
  const month = Math.trunc(value / 100) % 100;
  const day = value % 100;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC maps years 0-99 to 1900-1999; correct that explicitly
  if (year >= 0 && year < 100) {
    date.setUTCFullYear(year);
  }
  return date;
}

/**
 * Get the name of a TSDataType from its numeric code
 * @param typeCode - The numeric type code
 * @returns The type name, or 'UNKNOWN' if not recognized
 */
export function getDataTypeName(typeCode: number): string {
  switch (typeCode) {
    case TSDataType.BOOLEAN:
      return "BOOLEAN";
    case TSDataType.INT32:
      return "INT32";
    case TSDataType.INT64:
      return "INT64";
    case TSDataType.FLOAT:
      return "FLOAT";
    case TSDataType.DOUBLE:
      return "DOUBLE";
    case TSDataType.TEXT:
      return "TEXT";
    case TSDataType.TIMESTAMP:
      return "TIMESTAMP";
    case TSDataType.DATE:
      return "DATE";
    case TSDataType.BLOB:
      return "BLOB";
    case TSDataType.STRING:
      return "STRING";
    default:
      return "UNKNOWN";
  }
}
