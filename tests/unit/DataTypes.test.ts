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

describe("DATE yyyyMMdd conversion", () => {
  describe("parseDateToInt", () => {
    it("should encode a Date as INT32 yyyyMMdd (year*10000 + month*100 + day)", () => {
      expect(parseDateToInt(new Date("2026-07-13"))).toBe(20260713);
      expect(parseDateToInt(new Date("2024-01-01"))).toBe(20240101);
      expect(parseDateToInt(new Date("2024-12-31"))).toBe(20241231);
      // Leap day
      expect(parseDateToInt(new Date("2024-02-29"))).toBe(20240229);
    });

    it("should pass through already-encoded numbers unchanged", () => {
      expect(parseDateToInt(20260713)).toBe(20260713);
      expect(parseDateToInt(0)).toBe(0);
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
});
