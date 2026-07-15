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

import {
  serializeBooleanColumn,
  serializeInt32Column,
  serializeInt64Column,
  serializeFloatColumn,
  serializeDoubleColumn,
  serializeTextColumn,
  serializeTimestampColumn,
  serializeDateColumn,
  serializeBlobColumn,
  serializeTimestamps,
  serializeColumnFast,
  writeInt64BE,
} from "../../src/utils/FastSerializer";
import { globalBufferPool } from "../../src/utils/BufferPool";

describe("FastSerializer", () => {
  afterEach(() => {
    // Clear buffer pool after each test to avoid interference
    globalBufferPool.clear();
  });

  describe("Boolean Serialization", () => {
    it("should serialize boolean values correctly", () => {
      const values = [true, false, true, null, undefined];
      const buffer = serializeBooleanColumn(values);

      expect(buffer.length).toBe(5);
      expect(buffer[0]).toBe(1); // true
      expect(buffer[1]).toBe(0); // false
      expect(buffer[2]).toBe(1); // true
      expect(buffer[3]).toBe(0); // null -> 0
      expect(buffer[4]).toBe(0); // undefined -> 0
    });
  });

  describe("INT32 Serialization", () => {
    it("should serialize INT32 values correctly", () => {
      const values = [100, -200, 0, null, undefined];
      const buffer = serializeInt32Column(values);

      expect(buffer.length).toBe(20); // 5 * 4 bytes
      expect(buffer.readInt32BE(0)).toBe(100);
      expect(buffer.readInt32BE(4)).toBe(-200);
      expect(buffer.readInt32BE(8)).toBe(0);
      expect(buffer.readInt32BE(12)).toBe(0); // null -> 0
      expect(buffer.readInt32BE(16)).toBe(0); // undefined -> 0
    });
  });

  describe("INT64 Serialization", () => {
    it("should serialize INT64 values correctly", () => {
      const values = [BigInt(1000), BigInt(-2000), 0, null, undefined];
      const buffer = serializeInt64Column(values);

      expect(buffer.length).toBe(40); // 5 * 8 bytes
      expect(buffer.readBigInt64BE(0)).toBe(BigInt(1000));
      expect(buffer.readBigInt64BE(8)).toBe(BigInt(-2000));
      expect(buffer.readBigInt64BE(16)).toBe(BigInt(0));
      expect(buffer.readBigInt64BE(24)).toBe(BigInt(0)); // null -> 0
      expect(buffer.readBigInt64BE(32)).toBe(BigInt(0)); // undefined -> 0
    });
  });

  describe("BigInt-free INT64 hi/lo writes", () => {
    const roundTrip = (v: number | bigint): bigint => {
      const buf = Buffer.allocUnsafe(8);
      writeInt64BE(buf, v, 0);
      return buf.readBigInt64BE(0);
    };

    it("should write positive numbers correctly", () => {
      expect(roundTrip(0)).toBe(BigInt(0));
      expect(roundTrip(1)).toBe(BigInt(1));
      expect(roundTrip(0xffffffff)).toBe(BigInt(0xffffffff)); // 32-bit boundary
      expect(roundTrip(0x100000000)).toBe(BigInt("4294967296"));
      expect(roundTrip(Number.MAX_SAFE_INTEGER)).toBe(BigInt(Number.MAX_SAFE_INTEGER));
    });

    it("should write negative numbers correctly (two's complement)", () => {
      expect(roundTrip(-1)).toBe(BigInt(-1));
      expect(roundTrip(-2000)).toBe(BigInt(-2000));
      expect(roundTrip(-0x100000000)).toBe(BigInt("-4294967296"));
      expect(roundTrip(-0x100000001)).toBe(BigInt("-4294967297"));
      expect(roundTrip(Number.MIN_SAFE_INTEGER)).toBe(BigInt(Number.MIN_SAFE_INTEGER));
    });

    it("should handle BigInt inputs", () => {
      expect(roundTrip(BigInt(1000))).toBe(BigInt(1000));
      expect(roundTrip(BigInt(-2000))).toBe(BigInt(-2000));
      expect(roundTrip(BigInt("-9223372036854775808"))).toBe(BigInt("-9223372036854775808")); // i64 min
      expect(roundTrip(BigInt("9223372036854775807"))).toBe(BigInt("9223372036854775807")); // i64 max
    });

    it("should match legacy BigInt output for INT64 columns with negatives", () => {
      const values = [
        Number.MIN_SAFE_INTEGER,
        -1,
        -0x100000000,
        0,
        0xffffffff,
        Number.MAX_SAFE_INTEGER,
        BigInt(-42),
      ];
      const buffer = serializeInt64Column(values);
      const legacy = Buffer.alloc(values.length * 8);
      values.forEach((v, i) => legacy.writeBigInt64BE(BigInt(v), i * 8));
      expect(buffer.equals(legacy)).toBe(true);
    });

    it("should serialize negative timestamps (pre-1970) correctly", () => {
      const values = [-1, -86400000, 0, 1700000000000];
      const buffer = serializeTimestampColumn(values);
      values.forEach((v, i) => {
        expect(buffer.readBigInt64BE(i * 8)).toBe(BigInt(v));
      });
      // serializeTimestamps (time column) too
      const tsBuffer = serializeTimestamps(values as number[]);
      values.forEach((v, i) => {
        expect(tsBuffer.readBigInt64BE(i * 8)).toBe(BigInt(v));
      });
    });
  });

  describe("String encode cache", () => {
    it("should reuse encoding for repeated strings (TAG-like column)", () => {
      const values = Array.from({ length: 100 }, () => "device_001");
      const buffer = serializeTextColumn(values);
      let offset = 0;
      for (let i = 0; i < 100; i++) {
        const len = buffer.readInt32BE(offset);
        offset += 4;
        expect(buffer.toString("utf8", offset, offset + len)).toBe("device_001");
        offset += len;
      }
      expect(offset).toBe(buffer.length);
    });

    it("should not wrongly reuse cache for different strings", () => {
      const values = ["aaa", "aaa", "bbb", "aaa", "cc", "你好", "你好", "cc"];
      const buffer = serializeTextColumn(values);
      let offset = 0;
      for (const v of values) {
        const expected = Buffer.from(v, "utf8");
        const len = buffer.readInt32BE(offset);
        offset += 4;
        expect(len).toBe(expected.length);
        expect(buffer.toString("utf8", offset, offset + len)).toBe(v);
        offset += len;
      }
      expect(offset).toBe(buffer.length);
    });

    it("should handle nulls interleaved with cached strings", () => {
      const values = ["x", null, "x", undefined, "y"];
      const buffer = serializeTextColumn(values);
      let offset = 0;
      const expected = ["x", "", "x", "", "y"];
      for (const v of expected) {
        const len = buffer.readInt32BE(offset);
        offset += 4;
        expect(buffer.toString("utf8", offset, offset + len)).toBe(v);
        offset += len;
      }
      expect(offset).toBe(buffer.length);
    });
  });

  describe("FLOAT Serialization", () => {
    it("should serialize FLOAT values correctly", () => {
      const values = [1.5, -2.5, 0.0, null, undefined];
      const buffer = serializeFloatColumn(values);

      expect(buffer.length).toBe(20); // 5 * 4 bytes
      expect(buffer.readFloatBE(0)).toBeCloseTo(1.5);
      expect(buffer.readFloatBE(4)).toBeCloseTo(-2.5);
      expect(buffer.readFloatBE(8)).toBe(0.0);
      expect(buffer.readFloatBE(12)).toBe(0.0); // null -> 0
      expect(buffer.readFloatBE(16)).toBe(0.0); // undefined -> 0
    });
  });

  describe("DOUBLE Serialization", () => {
    it("should serialize DOUBLE values correctly", () => {
      const values = [1.5, -2.5, 0.0, null, undefined];
      const buffer = serializeDoubleColumn(values);

      expect(buffer.length).toBe(40); // 5 * 8 bytes
      expect(buffer.readDoubleBE(0)).toBe(1.5);
      expect(buffer.readDoubleBE(8)).toBe(-2.5);
      expect(buffer.readDoubleBE(16)).toBe(0.0);
      expect(buffer.readDoubleBE(24)).toBe(0.0); // null -> 0
      expect(buffer.readDoubleBE(32)).toBe(0.0); // undefined -> 0
    });
  });

  describe("TEXT Serialization", () => {
    it("should serialize TEXT values correctly", () => {
      const values = ["hello", "world", "", null, undefined];
      const buffer = serializeTextColumn(values);

      // Read first string
      let offset = 0;
      const len1 = buffer.readInt32BE(offset);
      offset += 4;
      const str1 = buffer.toString("utf8", offset, offset + len1);
      offset += len1;
      expect(str1).toBe("hello");

      // Read second string
      const len2 = buffer.readInt32BE(offset);
      offset += 4;
      const str2 = buffer.toString("utf8", offset, offset + len2);
      expect(str2).toBe("world");
    });

    it("should handle UTF-8 multibyte characters", () => {
      const values = ["你好", "世界"];
      const buffer = serializeTextColumn(values);

      let offset = 0;
      const len1 = buffer.readInt32BE(offset);
      offset += 4;
      const str1 = buffer.toString("utf8", offset, offset + len1);
      expect(str1).toBe("你好");
    });
  });

  describe("TIMESTAMP Serialization", () => {
    it("should serialize TIMESTAMP values correctly", () => {
      const now = Date.now();
      const values = [now, new Date(now + 1000), null, undefined];
      const buffer = serializeTimestampColumn(values);

      expect(buffer.length).toBe(32); // 4 * 8 bytes
      expect(buffer.readBigInt64BE(0)).toBe(BigInt(now));
      expect(buffer.readBigInt64BE(8)).toBe(BigInt(now + 1000));
      expect(buffer.readBigInt64BE(16)).toBe(BigInt(0)); // null -> 0
      expect(buffer.readBigInt64BE(24)).toBe(BigInt(0)); // undefined -> 0
    });
  });

  describe("DATE Serialization", () => {
    it("should serialize DATE values as INT32 yyyyMMdd", () => {
      const date1 = new Date("2024-01-01");
      const values = [date1, 20241231, null, undefined];
      const buffer = serializeDateColumn(values);

      expect(buffer.length).toBe(16); // 4 * 4 bytes
      expect(buffer.readInt32BE(0)).toBe(20240101); // yyyyMMdd, NOT days since epoch
      expect(buffer.readInt32BE(4)).toBe(20241231); // numbers pass through unchanged
      expect(buffer.readInt32BE(8)).toBe(0); // null -> 0
      expect(buffer.readInt32BE(12)).toBe(0); // undefined -> 0
    });

    it("should produce exact wire bytes for 2026-07-13", () => {
      // IoTDB DATE wire format: INT32 yyyyMMdd, big-endian
      // 20260713 = 0x01352769
      const buffer = serializeDateColumn([new Date("2026-07-13")]);
      expect(Array.from(buffer)).toEqual([0x01, 0x35, 0x27, 0x69]);
    });

    it("should reject invalid DATE values", () => {
      expect(() => serializeDateColumn([20230229])).toThrow(/Invalid DATE/); // not a leap year
      expect(() => serializeDateColumn([new Date(NaN)])).toThrow(
        /Invalid DATE/,
      );
    });
  });

  describe("BLOB Serialization", () => {
    it("should serialize BLOB values correctly", () => {
      const blob1 = Buffer.from([1, 2, 3]);
      const blob2 = Buffer.from([4, 5, 6, 7]);
      const values = [blob1, blob2, null];
      const buffer = serializeBlobColumn(values);

      // Read first blob
      let offset = 0;
      const len1 = buffer.readInt32BE(offset);
      offset += 4;
      expect(len1).toBe(3);
      const data1 = buffer.subarray(offset, offset + len1);
      offset += len1;
      expect(data1).toEqual(blob1);

      // Read second blob
      const len2 = buffer.readInt32BE(offset);
      offset += 4;
      expect(len2).toBe(4);
      const data2 = buffer.subarray(offset, offset + len2);
      expect(data2).toEqual(blob2);
    });
  });

  describe("Timestamp Array Serialization", () => {
    it("should serialize timestamp array correctly", () => {
      const timestamps = [1000, 2000, 3000];
      const buffer = serializeTimestamps(timestamps);

      expect(buffer.length).toBe(24); // 3 * 8 bytes
      expect(buffer.readBigInt64BE(0)).toBe(BigInt(1000));
      expect(buffer.readBigInt64BE(8)).toBe(BigInt(2000));
      expect(buffer.readBigInt64BE(16)).toBe(BigInt(3000));
    });

    it("should throw error for invalid timestamp", () => {
      const timestamps = [1000, NaN, 3000];
      expect(() => serializeTimestamps(timestamps)).toThrow("Invalid timestamp");
    });
  });

  describe("Fast Column Serialization Dispatcher", () => {
    it("should dispatch to correct serializer for each type", () => {
      // BOOLEAN (0)
      const boolBuffer = serializeColumnFast([true, false], 0);
      expect(boolBuffer.length).toBe(2);

      // INT32 (1)
      const int32Buffer = serializeColumnFast([100, 200], 1);
      expect(int32Buffer.length).toBe(8);

      // INT64 (2)
      const int64Buffer = serializeColumnFast([100, 200], 2);
      expect(int64Buffer.length).toBe(16);

      // FLOAT (3)
      const floatBuffer = serializeColumnFast([1.5, 2.5], 3);
      expect(floatBuffer.length).toBe(8);

      // DOUBLE (4)
      const doubleBuffer = serializeColumnFast([1.5, 2.5], 4);
      expect(doubleBuffer.length).toBe(16);

      // TEXT (5)
      const textBuffer = serializeColumnFast(["hello", "world"], 5);
      expect(textBuffer.length).toBeGreaterThan(0);

      // TIMESTAMP (8)
      const tsBuffer = serializeColumnFast([1000, 2000], 8);
      expect(tsBuffer.length).toBe(16);

      // DATE (9) - values must be valid yyyyMMdd integers
      const dateBuffer = serializeColumnFast([20240101, 20241231], 9);
      expect(dateBuffer.length).toBe(8);

      // BLOB (10)
      const blobBuffer = serializeColumnFast([Buffer.from([1, 2])], 10);
      expect(blobBuffer.length).toBeGreaterThan(0);

      // STRING (11)
      const stringBuffer = serializeColumnFast(["test"], 11);
      expect(stringBuffer.length).toBeGreaterThan(0);
    });

    it("should throw error for unsupported type", () => {
      expect(() => serializeColumnFast([1, 2, 3], 99)).toThrow("Unsupported data type");
    });
  });

  describe("Buffer Pool Integration", () => {
    it("should no longer use the deprecated buffer pool", () => {
      const statsInitial = globalBufferPool.getStats();

      // Large buffers used to trigger pooling; serializers now allocate directly
      const largeValues = Array.from({ length: 300 }, (_, i) => i); // 300 * 4 = 1200 bytes
      serializeInt32Column(largeValues);
      serializeDoubleColumn(largeValues); // 300 * 8 = 2400 bytes

      const statsFinal = globalBufferPool.getStats();

      // The pool is deprecated: no acquire() calls should be made
      expect(statsFinal.allocations + statsFinal.hits).toBe(
        statsInitial.allocations + statsInitial.hits,
      );
    });
  });
});
