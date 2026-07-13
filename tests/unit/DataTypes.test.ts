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
  parseDateToInt,
  parseIntToDate,
} from "../../src/utils/DataTypes";
import {
  BaseColumnDecoder,
  ColumnEncoding,
} from "../../src/client/ColumnDecoder";
import { Session } from "../../src/client/Session";

describe("DATE yyyyMMdd conversion", () => {
  describe("parseDateToInt", () => {
    it("should encode a Date as INT32 yyyyMMdd (year*10000 + month*100 + day)", () => {
      expect(parseDateToInt(new Date("2026-07-13"))).toBe(20260713);
      expect(parseDateToInt(new Date("2024-01-01"))).toBe(20240101);
      expect(parseDateToInt(new Date("2024-12-31"))).toBe(20241231);
      // Leap day
      expect(parseDateToInt(new Date("2024-02-29"))).toBe(20240229);
    });

    it("should pass through already-encoded valid numbers unchanged", () => {
      expect(parseDateToInt(20260713)).toBe(20260713);
      expect(parseDateToInt(10000101)).toBe(10000101); // year lower bound
      expect(parseDateToInt(99991231)).toBe(99991231); // year upper bound
    });

    it("should accept the leap day of a leap year", () => {
      expect(parseDateToInt(20240229)).toBe(20240229);
      expect(parseDateToInt(new Date("2024-02-29"))).toBe(20240229);
    });

    it("should reject invalid Date objects", () => {
      expect(() => parseDateToInt(new Date(NaN))).toThrow(/Invalid DATE/);
    });

    it("should reject Date objects with years outside 1000-9999", () => {
      expect(() => parseDateToInt(new Date("0999-12-31"))).toThrow(
        /year 999/,
      );
    });

    it("should reject non-finite and non-integer numbers", () => {
      expect(() => parseDateToInt(NaN)).toThrow(/Invalid DATE/);
      expect(() => parseDateToInt(Infinity)).toThrow(/Invalid DATE/);
      expect(() => parseDateToInt(20240101.5)).toThrow(/Invalid DATE/);
    });

    it("should reject numbers that are not real calendar dates", () => {
      expect(() => parseDateToInt(20230229)).toThrow(/day 29/); // not a leap year
      expect(() => parseDateToInt(20241301)).toThrow(/month 13/);
      expect(() => parseDateToInt(20240100)).toThrow(/day 0/);
      expect(() => parseDateToInt(9991231)).toThrow(/year 999/);
      expect(() => parseDateToInt(100000101)).toThrow(/year 10000/);
      // Old days-since-epoch value: 19723 -> year 1, month 97 -> invalid
      expect(() => parseDateToInt(19723)).toThrow(/Invalid DATE/);
      expect(() => parseDateToInt(0)).toThrow(/Invalid DATE/);
    });
  });

  describe("parseIntToDate", () => {
    it("should decode INT32 yyyyMMdd to a Date at UTC midnight", () => {
      const date = parseIntToDate(20260713);
      expect(date.getUTCFullYear()).toBe(2026);
      expect(date.getUTCMonth()).toBe(6); // July (0-based)
      expect(date.getUTCDate()).toBe(13);
      expect(date.getUTCHours()).toBe(0);
      expect(date.getUTCMinutes()).toBe(0);
    });

    it("should decode the leap day of a leap year", () => {
      const date = parseIntToDate(20240229);
      expect(date.getUTCFullYear()).toBe(2024);
      expect(date.getUTCMonth()).toBe(1);
      expect(date.getUTCDate()).toBe(29);
    });

    it("should reject impossible calendar dates instead of normalizing", () => {
      // new Date(Date.UTC(2023, 1, 29)) would silently become 2023-03-01
      expect(() => parseIntToDate(20230229)).toThrow(/day 29/);
      expect(() => parseIntToDate(20241301)).toThrow(/month 13/);
      expect(() => parseIntToDate(20240100)).toThrow(/day 0/);
    });

    it("should reject years outside 1000-9999", () => {
      expect(() => parseIntToDate(9991231)).toThrow(/year 999/);
      expect(() => parseIntToDate(100000101)).toThrow(/year 10000/);
      // Old days-since-epoch value is not a valid yyyyMMdd
      expect(() => parseIntToDate(19723)).toThrow(/Invalid DATE/);
    });

    it("should reject non-integer numbers", () => {
      expect(() => parseIntToDate(NaN)).toThrow(/Invalid DATE/);
      expect(() => parseIntToDate(20240101.5)).toThrow(/Invalid DATE/);
    });
  });

  describe("round-trip", () => {
    it("should round-trip Date -> yyyyMMdd -> Date", () => {
      const dates = [
        new Date("1970-01-01"),
        new Date("2000-02-29"),
        new Date("2024-01-01"),
        new Date("2026-07-13"),
        new Date("9999-12-31"),
      ];
      for (const original of dates) {
        const encoded = parseDateToInt(original);
        const decoded = parseIntToDate(encoded);
        expect(decoded.getTime()).toBe(original.getTime());
        // And the integer round-trips too
        expect(parseDateToInt(decoded)).toBe(encoded);
      }
    });
  });

  describe("TsBlock column decode (Int32ArrayColumnDecoder)", () => {
    it("should decode a DATE column value as a Date from yyyyMMdd wire bytes", () => {
      // Column layout: 1 byte null flag (0 = no nulls) + INT32 BE values
      // 20260713 = 0x01352769
      const buffer = Buffer.from([0x00, 0x01, 0x35, 0x27, 0x69]);
      const decoder = BaseColumnDecoder.getDecoder(ColumnEncoding.Int32Array);
      const { column, bytesRead } = decoder.readColumn(buffer, 0, 9, 1);

      expect(bytesRead).toBe(5);
      const value = column.values[0];
      expect(value).toBeInstanceOf(Date);
      expect(value.getUTCFullYear()).toBe(2026);
      expect(value.getUTCMonth()).toBe(6);
      expect(value.getUTCDate()).toBe(13);
    });

    it("should still decode plain INT32 columns as numbers", () => {
      const buffer = Buffer.from([0x00, 0x01, 0x35, 0x27, 0x69]);
      const decoder = BaseColumnDecoder.getDecoder(ColumnEncoding.Int32Array);
      const { column } = decoder.readColumn(buffer, 0, 1, 1);
      expect(column.values[0]).toBe(20260713);
    });
  });

  describe("parseTsBlock DATE conversion with columnIndex2TsBlockColumnIndexList", () => {
    let session: Session;

    beforeEach(() => {
      session = new Session({
        host: "localhost",
        port: 6667,
        username: "root",
        password: "root",
      });
    });

    /**
     * Craft a TsBlock buffer with INT32 (wire type 1) value columns:
     * valueColumnCount i32 BE | type bytes | positionCount i32 BE |
     * time encoding byte | value encoding bytes | time column | value columns
     * Each column: 1-byte null flag (0 = no nulls) + big-endian values.
     */
    function craftInt32TsBlock(
      timestamps: number[],
      int32Columns: number[][],
    ): Buffer {
      const positionCount = timestamps.length;
      const parts: Buffer[] = [];

      const header = Buffer.alloc(4);
      header.writeInt32BE(int32Columns.length, 0);
      parts.push(header);
      // Wire type of every value column is INT32 (1)
      parts.push(Buffer.from(int32Columns.map(() => 1)));

      const posBuf = Buffer.alloc(4);
      posBuf.writeInt32BE(positionCount, 0);
      parts.push(posBuf);

      // Encodings: time column Int64Array (2), value columns Int32Array (1)
      parts.push(Buffer.from([2, ...int32Columns.map(() => 1)]));

      // Time column: null flag + INT64 BE timestamps
      const timeBuf = Buffer.alloc(1 + positionCount * 8);
      timeBuf.writeUInt8(0, 0);
      timestamps.forEach((t, i) => {
        timeBuf.writeBigInt64BE(BigInt(t), 1 + i * 8);
      });
      parts.push(timeBuf);

      // Value columns: null flag + INT32 BE values
      for (const columnValues of int32Columns) {
        const colBuf = Buffer.alloc(1 + positionCount * 4);
        colBuf.writeUInt8(0, 0);
        columnValues.forEach((v, i) => {
          colBuf.writeInt32BE(v, 1 + i * 4);
        });
        parts.push(colBuf);
      }

      return Buffer.concat(parts);
    }

    it("should convert the DATE column per the non-identity logical->physical mapping", async () => {
      // Logical columns: [DATE, INT32]; physical TsBlock columns reordered:
      // logical 0 (DATE) -> physical 1, logical 1 (INT32) -> physical 0
      const buffer = craftInt32TsBlock([1000], [[42], [20240101]]);

      const rows = await (session as any).parseQueryResult(
        [buffer],
        2,
        ["DATE", "INT32"],
        false,
        [1, 0],
      );

      expect(rows).toHaveLength(1);
      const [timestamp, physical0, physical1] = rows[0];
      expect(Number(timestamp)).toBe(1000);
      // Physical column 0 is logically INT32 -> stays a number
      expect(physical0).toBe(42);
      // Physical column 1 is logically DATE -> converted to Date
      expect(physical1).toBeInstanceOf(Date);
      expect(physical1.getUTCFullYear()).toBe(2024);
      expect(physical1.getUTCMonth()).toBe(0);
      expect(physical1.getUTCDate()).toBe(1);
    });

    it("should keep identity behavior when the mapping is absent", async () => {
      const buffer = craftInt32TsBlock([1000], [[20240101], [42]]);

      const rows = await (session as any).parseQueryResult(
        [buffer],
        2,
        ["DATE", "INT32"],
        false,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0][1]).toBeInstanceOf(Date);
      expect(rows[0][1].getUTCFullYear()).toBe(2024);
      expect(rows[0][2]).toBe(42);
    });

    it("should handle deduplicated columns (two logical columns -> one physical)", async () => {
      // SELECT d, d: logical [DATE, DATE] both map to physical 0
      const buffer = craftInt32TsBlock([1000], [[20240101]]);

      const rows = await (session as any).parseQueryResult(
        [buffer],
        2,
        ["DATE", "DATE"],
        false,
        [0, 0],
      );

      expect(rows).toHaveLength(1);
      expect(rows[0][1]).toBeInstanceOf(Date);
      expect(rows[0][1].getUTCFullYear()).toBe(2024);
    });

    it("should not crash nor convert when logical types disagree for one physical column", async () => {
      const buffer = craftInt32TsBlock([1000], [[20240101]]);

      const rows = await (session as any).parseQueryResult(
        [buffer],
        2,
        ["DATE", "INT32"],
        false,
        [0, 0],
      );

      expect(rows).toHaveLength(1);
      // Ambiguous type -> no DATE conversion applied
      expect(rows[0][1]).toBe(20240101);
    });
  });
});
