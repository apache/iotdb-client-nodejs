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

import { Session } from '../../src/client/Session';
import { TSDataType } from '../../src/utils/DataTypes';

describe('Tablet Serialization', () => {
  let session: Session;

  beforeEach(() => {
    // Create session instance for accessing protected methods
    session = new Session({
      host: 'localhost',
      port: 6667,
      username: 'root',
      password: 'root',
    });
  });

  describe('BitMap Serialization', () => {
    test('should serialize bitmap with correct LSB-first bit packing', () => {
      // Test data: 10 rows, nulls at indices [1, 4, 6, 9]
      const bitMaps = [
        [false, true, false, false, true, false, true, false, false, true], // Column 0
        null, // Column 1: no nulls
      ];

      const buffer = (session as any).serializeBitMaps(bitMaps, 10);

      // Expected format:
      // Column 0: [0x01] (has null) + [0x52, 0x02] (bitmap)
      //   Byte 1: bits 0-7 → binary 01010010 → 0x52 (indices 1,4,6 set)
      //   Byte 2: bits 8-9 → binary 00000010 → 0x02 (index 9 set)
      // Column 1: [0x00] (no null)

      expect(buffer.length).toBe(4); // 1 (col0 flag) + 2 (col0 bitmap) + 1 (col1 flag)
      expect(buffer[0]).toBe(0x01); // Column 0 has null
      expect(buffer[1]).toBe(0x52); // First byte: bits 1,4,6 set (01010010)
      expect(buffer[2]).toBe(0x02); // Second byte: bit 9 set (00000010)
      expect(buffer[3]).toBe(0x00); // Column 1 no null
    });

    test('should handle edge case: rowCount not multiple of 8', () => {
      // Test with 13 rows (needs 2 bytes, last 3 bits unused)
      // Nulls at indices [0, 3, 8, 10]
      const bitMaps = [
        [
          true,  // 0
          false, // 1
          false, // 2
          true,  // 3
          false, // 4
          false, // 5
          false, // 6
          false, // 7
          true,  // 8
          false, // 9
          true,  // 10
          false, // 11
          false, // 12
        ],
      ];
      const buffer = (session as any).serializeBitMaps(bitMaps, 13);

      // Expected: [0x01] + [0b00001001, 0b00000101]
      //   Byte 1: bits 0-7 → binary 00001001 → 0x09 (bits 0,3 set)
      //   Byte 2: bits 8-12 → binary 00000101 → 0x05 (bits 8,10 set)
      expect(buffer.length).toBe(3); // 1 (flag) + 2 (bitmap)
      expect(buffer[0]).toBe(0x01); // Has null
      expect(buffer[1]).toBe(0x09); // 00001001 (bits 0,3)
      expect(buffer[2]).toBe(0x05); // 00000101 (bits 8,10)
    });

    test('should handle all nulls', () => {
      const bitMaps = [
        [true, true, true, true, true, true, true, true],
      ];
      const buffer = (session as any).serializeBitMaps(bitMaps, 8);

      // All 8 bits set = 0xFF
      expect(buffer.length).toBe(2); // 1 (flag) + 1 (bitmap)
      expect(buffer[0]).toBe(0x01); // Has null
      expect(buffer[1]).toBe(0xff); // 11111111
    });

    test('should handle no nulls', () => {
      const bitMaps = [
        [false, false, false, false, false, false, false, false],
      ];
      const buffer = (session as any).serializeBitMaps(bitMaps, 8);

      // No bits set = 0x00
      expect(buffer.length).toBe(2); // 1 (flag) + 1 (bitmap)
      expect(buffer[0]).toBe(0x01); // Has null flag (but all false)
      expect(buffer[1]).toBe(0x00); // 00000000
    });

    test('should handle multiple columns with mixed nulls', () => {
      const bitMaps = [
        [true, false, false, false], // Column 0: null at index 0
        null, // Column 1: no nulls
        [false, false, true, false], // Column 2: null at index 2
      ];
      const buffer = (session as any).serializeBitMaps(bitMaps, 4);

      // Column 0: [0x01] + [0x01] (bit 0 set)
      // Column 1: [0x00]
      // Column 2: [0x01] + [0x04] (bit 2 set)
      expect(buffer.length).toBe(5);
      expect(buffer[0]).toBe(0x01); // Col 0 has null
      expect(buffer[1]).toBe(0x01); // Col 0 bitmap: bit 0
      expect(buffer[2]).toBe(0x00); // Col 1 no null
      expect(buffer[3]).toBe(0x01); // Col 2 has null
      expect(buffer[4]).toBe(0x04); // Col 2 bitmap: bit 2
    });

    test('should handle empty bitmap array', () => {
      const bitMaps: (boolean[] | null)[] = [];
      const buffer = (session as any).serializeBitMaps(bitMaps, 10);

      // No columns = empty buffer
      expect(buffer.length).toBe(0);
    });
  });

  describe('Column Serialization - Optimized TEXT/STRING/BLOB', () => {
    test('should serialize TEXT column efficiently', () => {
      const values = ['hello', 'world', 'test'];
      const buffer = (session as any).serializeColumn(values, TSDataType.TEXT);

      // Calculate expected size
      const expectedSize = 
        4 + Buffer.from('hello', 'utf8').length + // length + data
        4 + Buffer.from('world', 'utf8').length +
        4 + Buffer.from('test', 'utf8').length;

      expect(buffer.length).toBe(expectedSize);

      // Verify structure (length + data for each string)
      let offset = 0;
      expect(buffer.readInt32BE(offset)).toBe(5); // 'hello' length
      offset += 4;
      expect(buffer.toString('utf8', offset, offset + 5)).toBe('hello');
      offset += 5;

      expect(buffer.readInt32BE(offset)).toBe(5); // 'world' length
      offset += 4;
      expect(buffer.toString('utf8', offset, offset + 5)).toBe('world');
      offset += 5;

      expect(buffer.readInt32BE(offset)).toBe(4); // 'test' length
      offset += 4;
      expect(buffer.toString('utf8', offset, offset + 4)).toBe('test');
    });

    test('should serialize STRING column efficiently', () => {
      const values = ['abc', '123', 'xyz'];
      const buffer = (session as any).serializeColumn(values, TSDataType.STRING);

      const expectedSize = 
        4 + 3 + // 'abc'
        4 + 3 + // '123'
        4 + 3;  // 'xyz'

      expect(buffer.length).toBe(expectedSize);
    });

    test('should handle empty strings in TEXT', () => {
      const values = ['', 'data', ''];
      const buffer = (session as any).serializeColumn(values, TSDataType.TEXT);

      let offset = 0;
      expect(buffer.readInt32BE(offset)).toBe(0); // Empty string length
      offset += 4;

      expect(buffer.readInt32BE(offset)).toBe(4); // 'data' length
      offset += 4;
      expect(buffer.toString('utf8', offset, offset + 4)).toBe('data');
      offset += 4;

      expect(buffer.readInt32BE(offset)).toBe(0); // Empty string length
    });

    test('should handle null values in TEXT', () => {
      const values = ['hello', null, 'world'];
      const buffer = (session as any).serializeColumn(values, TSDataType.TEXT);

      let offset = 0;
      expect(buffer.readInt32BE(offset)).toBe(5); // 'hello'
      offset += 4 + 5;

      expect(buffer.readInt32BE(offset)).toBe(0); // null → empty string
      offset += 4;

      expect(buffer.readInt32BE(offset)).toBe(5); // 'world'
    });

    test('should handle UTF-8 multibyte characters in TEXT', () => {
      const values = ['你好', '世界', 'test'];
      const buffer = (session as any).serializeColumn(values, TSDataType.TEXT);

      let offset = 0;
      const bytes1 = Buffer.from('你好', 'utf8');
      expect(buffer.readInt32BE(offset)).toBe(bytes1.length); // Should be 6 bytes
      offset += 4;
      expect(buffer.toString('utf8', offset, offset + bytes1.length)).toBe('你好');
      offset += bytes1.length;

      const bytes2 = Buffer.from('世界', 'utf8');
      expect(buffer.readInt32BE(offset)).toBe(bytes2.length);
      offset += 4;
      expect(buffer.toString('utf8', offset, offset + bytes2.length)).toBe('世界');
    });

    test('should serialize BLOB column efficiently', () => {
      const values = [
        Buffer.from([0x01, 0x02, 0x03]),
        Buffer.from([0xff, 0xfe]),
        Buffer.from([0xaa, 0xbb, 0xcc, 0xdd]),
      ];
      const buffer = (session as any).serializeColumn(values, TSDataType.BLOB);

      const expectedSize = 
        4 + 3 +  // First blob
        4 + 2 +  // Second blob
        4 + 4;   // Third blob

      expect(buffer.length).toBe(expectedSize);

      let offset = 0;
      expect(buffer.readInt32BE(offset)).toBe(3);
      offset += 4;
      expect(buffer[offset]).toBe(0x01);
      expect(buffer[offset + 1]).toBe(0x02);
      expect(buffer[offset + 2]).toBe(0x03);
      offset += 3;

      expect(buffer.readInt32BE(offset)).toBe(2);
      offset += 4;
      expect(buffer[offset]).toBe(0xff);
      expect(buffer[offset + 1]).toBe(0xfe);
    });

    test('should handle empty BLOBs', () => {
      const values = [Buffer.alloc(0), Buffer.from([0x01]), Buffer.alloc(0)];
      const buffer = (session as any).serializeColumn(values, TSDataType.BLOB);

      let offset = 0;
      expect(buffer.readInt32BE(offset)).toBe(0); // Empty blob
      offset += 4;

      expect(buffer.readInt32BE(offset)).toBe(1); // One byte
      offset += 4;
      expect(buffer[offset]).toBe(0x01);
      offset += 1;

      expect(buffer.readInt32BE(offset)).toBe(0); // Empty blob
    });

    test('should handle null values in BLOB', () => {
      const values = [Buffer.from([0x01]), null, Buffer.from([0x02])];
      const buffer = (session as any).serializeColumn(values, TSDataType.BLOB);

      let offset = 0;
      expect(buffer.readInt32BE(offset)).toBe(1);
      offset += 4 + 1;

      expect(buffer.readInt32BE(offset)).toBe(0); // null → empty blob
      offset += 4;

      expect(buffer.readInt32BE(offset)).toBe(1);
    });
  });

  describe('Fast vs Legacy Tablet Serialization (golden wire-format test)', () => {
    let legacySession: Session;

    beforeEach(() => {
      legacySession = new Session({
        host: 'localhost',
        port: 6667,
        username: 'root',
        password: 'root',
        enableFastSerialization: false,
      });
    });

    const compare = (values: any[][], dataTypes: number[], rowCount: number) => {
      const fast: Buffer = (session as any).serializeTabletValues(values, dataTypes, rowCount);
      const legacy: Buffer = (legacySession as any).serializeTabletValues(values, dataTypes, rowCount);
      expect(fast.length).toBe(legacy.length);
      expect(fast.equals(legacy)).toBe(true);
    };

    test('mixed-type tablet with nulls matches legacy byte-for-byte', () => {
      // 10 rows × 8 columns covering every type, nulls scattered
      const dataTypes = [
        TSDataType.BOOLEAN,
        TSDataType.INT32,
        TSDataType.INT64,
        TSDataType.FLOAT,
        TSDataType.DOUBLE,
        TSDataType.TEXT,
        TSDataType.TIMESTAMP,
        TSDataType.STRING,
      ];
      const values: any[][] = [];
      for (let r = 0; r < 10; r++) {
        values.push([
          r % 3 === 0 ? null : r % 2 === 0,
          r === 1 ? null : r * 100 - 500,
          r === 4 ? null : BigInt(-1000000000000) + BigInt(r),
          r === 7 ? undefined : r * 1.5 - 3,
          r === 2 ? null : r * 2.5e10,
          r === 5 ? null : `tag_${r % 2}`, // repeated strings exercise the cache
          r === 8 ? null : 1700000000000 + r,
          r === 0 ? null : '设备_' + (r % 3),
        ]);
      }
      compare(values, dataTypes, 10);
    });

    test('tablet with no nulls matches legacy byte-for-byte', () => {
      const dataTypes = [TSDataType.DOUBLE, TSDataType.INT64, TSDataType.TEXT];
      const values: any[][] = [];
      for (let r = 0; r < 17; r++) {
        // 17 rows: bitmap byte-count edge (ceil(17/8)=3)
        values.push([r * 1.1, -r * 12345678901, 'constant_tag']);
      }
      compare(values, dataTypes, 17);
    });

    test('tablet with all-null column matches legacy byte-for-byte', () => {
      const dataTypes = [TSDataType.INT32, TSDataType.TEXT, TSDataType.BOOLEAN];
      const values: any[][] = [];
      for (let r = 0; r < 9; r++) {
        values.push([null, r % 2 === 0 ? 's' : null, true]);
      }
      compare(values, dataTypes, 9);
    });

    test('BLOB and DATE tablet matches legacy byte-for-byte', () => {
      const dataTypes = [TSDataType.BLOB, TSDataType.DATE];
      const values: any[][] = [
        [Buffer.from([1, 2, 3]), new Date('2024-01-01')],
        [null, 20240102],
        [Buffer.alloc(0), null],
        [Buffer.from([0xff]), new Date('2025-06-15')],
      ];
      compare(values, dataTypes, 4);
    });

    test('non-Buffer BLOB inputs (Uint8Array, byte array, string) match legacy', () => {
      const dataTypes = [TSDataType.BLOB];
      const values: any[][] = [
        [new Uint8Array([0x01, 0x02, 0x03, 0x04])],
        [[0x10, 0x20, 0x30]],
        ['hello-blob'],
        [null],
        [new Uint8Array(0)],
      ];
      compare(values, dataTypes, 5);
    });

    test('ArrayBuffer and SharedArrayBuffer BLOB inputs match legacy', () => {
      const dataTypes = [TSDataType.BLOB];
      const ab = new Uint8Array([0x01, 0x02, 0xff]).buffer;
      const sab = new SharedArrayBuffer(4);
      new Uint8Array(sab).set([0xaa, 0xbb, 0xcc, 0xdd]);
      const values: any[][] = [
        [ab],
        [sab],
        [new ArrayBuffer(0)],
        [null],
      ];
      compare(values, dataTypes, 4);
    });

    test('single-row and empty-ish edge cases match legacy', () => {
      compare([[42]], [TSDataType.INT32], 1);
      compare([[null]], [TSDataType.DOUBLE], 1);
      compare([[9007199254740991, -9007199254740991]].map((r) => r), [TSDataType.INT64, TSDataType.INT64], 1);
    });
  });

  describe('Column Serialization - Other Data Types', () => {
    test('should serialize BOOLEAN column', () => {
      const values = [true, false, true, false];
      const buffer = (session as any).serializeColumn(values, TSDataType.BOOLEAN);

      expect(buffer.length).toBe(4);
      expect(buffer[0]).toBe(1);
      expect(buffer[1]).toBe(0);
      expect(buffer[2]).toBe(1);
      expect(buffer[3]).toBe(0);
    });

    test('should serialize INT32 column', () => {
      const values = [100, -200, 0, 2147483647];
      const buffer = (session as any).serializeColumn(values, TSDataType.INT32);

      expect(buffer.length).toBe(16); // 4 values * 4 bytes
      expect(buffer.readInt32BE(0)).toBe(100);
      expect(buffer.readInt32BE(4)).toBe(-200);
      expect(buffer.readInt32BE(8)).toBe(0);
      expect(buffer.readInt32BE(12)).toBe(2147483647);
    });

    test('should serialize INT64 column', () => {
      const values = [BigInt(1000), BigInt(-2000), BigInt(0)];
      const buffer = (session as any).serializeColumn(values, TSDataType.INT64);

      expect(buffer.length).toBe(24); // 3 values * 8 bytes
      expect(buffer.readBigInt64BE(0)).toBe(BigInt(1000));
      expect(buffer.readBigInt64BE(8)).toBe(BigInt(-2000));
      expect(buffer.readBigInt64BE(16)).toBe(BigInt(0));
    });

    test('should serialize FLOAT column', () => {
      const values = [1.5, -2.5, 0.0, 3.14159];
      const buffer = (session as any).serializeColumn(values, TSDataType.FLOAT);

      expect(buffer.length).toBe(16); // 4 values * 4 bytes
      expect(buffer.readFloatBE(0)).toBeCloseTo(1.5, 5);
      expect(buffer.readFloatBE(4)).toBeCloseTo(-2.5, 5);
      expect(buffer.readFloatBE(8)).toBe(0.0);
      expect(buffer.readFloatBE(12)).toBeCloseTo(3.14159, 5);
    });

    test('should serialize DOUBLE column', () => {
      const values = [1.234567890123, -9.876543210987, 0.0];
      const buffer = (session as any).serializeColumn(values, TSDataType.DOUBLE);

      expect(buffer.length).toBe(24); // 3 values * 8 bytes
      expect(buffer.readDoubleBE(0)).toBeCloseTo(1.234567890123, 10);
      expect(buffer.readDoubleBE(8)).toBeCloseTo(-9.876543210987, 10);
      expect(buffer.readDoubleBE(16)).toBe(0.0);
    });

    test('should serialize DATE column as INT32 yyyyMMdd', () => {
      const date1 = new Date('2024-01-01');
      const date2 = new Date('2024-12-31');
      const values = [date1, date2, 20260713];
      const buffer = (session as any).serializeColumn(values, TSDataType.DATE);

      expect(buffer.length).toBe(12); // 3 values * 4 bytes
      expect(buffer.readInt32BE(0)).toBe(20240101); // yyyyMMdd, NOT days since epoch
      expect(buffer.readInt32BE(4)).toBe(20241231);
      expect(buffer.readInt32BE(8)).toBe(20260713); // numbers pass through unchanged
    });

    test('should reject invalid DATE values during serialization', () => {
      expect(() =>
        (session as any).serializeColumn([20230229], TSDataType.DATE),
      ).toThrow(/Invalid DATE/); // 2023 is not a leap year
      expect(() =>
        (session as any).serializeColumn([new Date(NaN)], TSDataType.DATE),
      ).toThrow(/Invalid DATE/);
    });

    test('should serialize DATE 2026-07-13 with exact wire bytes', () => {
      // IoTDB DATE wire format: INT32 yyyyMMdd, big-endian
      // 20260713 = 0x01352769
      const buffer = (session as any).serializeColumn(
        [new Date('2026-07-13')],
        TSDataType.DATE,
      );
      expect(Array.from(buffer)).toEqual([0x01, 0x35, 0x27, 0x69]);
    });

    test('should serialize TIMESTAMP column', () => {
      const ts1 = Date.now();
      const ts2 = ts1 + 1000;
      const values = [ts1, ts2, 0];
      const buffer = (session as any).serializeColumn(values, TSDataType.TIMESTAMP);

      expect(buffer.length).toBe(24); // 3 values * 8 bytes
      
      // TIMESTAMP now uses big-endian format for consistency with other types
      expect(buffer.readBigInt64BE(0)).toBe(BigInt(ts1));
      expect(buffer.readBigInt64BE(8)).toBe(BigInt(ts2));
      expect(buffer.readBigInt64BE(16)).toBe(BigInt(0));
    });
  });
});
