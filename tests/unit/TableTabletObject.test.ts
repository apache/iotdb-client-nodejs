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

import { ColumnCategory, Session, TableTablet } from "../../src/client/Session";
import { TSDataType } from "../../src/utils/DataTypes";

describe("TableTablet OBJECT write support", () => {
  const newObjectTablet = () =>
    new TableTablet(
      "object_table",
      ["region_id", "file"],
      [TSDataType.STRING, TSDataType.OBJECT],
      [ColumnCategory.TAG, ColumnCategory.FIELD],
    );

  describe("TableTablet.buildObjectValue", () => {
    it("builds the Java-compatible segment frame (isEOF + offset + content)", () => {
      expect(TableTablet.buildObjectValue(true, 0, Buffer.from([0x11, 0x22]))).toEqual(
        Buffer.from([1, 0, 0, 0, 0, 0, 0, 0, 0, 0x11, 0x22]),
      );
      expect(
        TableTablet.buildObjectValue(false, 512, Buffer.from([0x33])),
      ).toEqual(
        Buffer.from([0, 0, 0, 0, 0, 0, 0, 2, 0, 0x33]),
      );
    });

    it("accepts Uint8Array content and bigint offsets", () => {
      const value = TableTablet.buildObjectValue(
        true,
        BigInt(512),
        new Uint8Array([0x33]),
      );
      expect(value).toEqual(Buffer.from([1, 0, 0, 0, 0, 0, 0, 2, 0, 0x33]));
    });

    it("rejects negative and unsafe offsets", () => {
      expect(() => TableTablet.buildObjectValue(true, -1, Buffer.alloc(0))).toThrow(
        /offset/,
      );
      expect(() =>
        TableTablet.buildObjectValue(true, 2 ** 53, Buffer.alloc(0)),
      ).toThrow(/offset/);
    });
  });

  describe("TableTablet.setObjectValueAt", () => {
    it("writes whole-object and segmented values at the requested row/column", () => {
      const tablet = newObjectTablet();
      tablet.addRow(1, ["r1", null]);
      tablet.addRow(2, ["r2", null]);

      tablet.setObjectValueAt(true, 0, Buffer.from([0x11, 0x22]), 1, 0);
      tablet.setObjectValueAt(true, 512, Buffer.from([0x33]), 1, 1);

      expect(tablet.values[0][1]).toEqual(
        Buffer.from([1, 0, 0, 0, 0, 0, 0, 0, 0, 0x11, 0x22]),
      );
      expect(tablet.values[1][1]).toEqual(
        Buffer.from([1, 0, 0, 0, 0, 0, 0, 2, 0, 0x33]),
      );
    });

    it("rejects non-OBJECT columns and out-of-range indexes", () => {
      const tablet = newObjectTablet();
      tablet.addRow(1, ["r1", null]);

      expect(() =>
        tablet.setObjectValueAt(true, 0, Buffer.from([0x01]), 0, 0),
      ).toThrow(/must be of type OBJECT/);
      expect(() =>
        tablet.setObjectValueAt(true, 0, Buffer.from([0x01]), 1, -1),
      ).toThrow(/rowIndex/);
      expect(() =>
        tablet.setObjectValueAt(true, 0, Buffer.from([0x01]), -1, 0),
      ).toThrow(/columnIndex/);
      expect(() =>
        tablet.setObjectValueAt(true, 0, Buffer.from([0x01]), 1, 1),
      ).toThrow(/rowIndex/);
    });
  });

  describe("Session.insertTablet with a mocked Thrift client", () => {
    let session: Session;
    let capturedReq: any;
    let insertTablet: jest.Mock;

    beforeEach(() => {
      session = new Session({
        host: "localhost",
        port: 6667,
        username: "root",
        password: "root",
      });
      insertTablet = jest.fn((_req: unknown, callback: (err: null, response: any) => void) => {
        capturedReq = _req;
        callback(null, { code: 200 });
      });
      (session as any).connection = {
        getClient: () => ({ insertTablet }),
        getSessionId: () => 1,
      };
    });

    it("sends TSDataType 12 and the binary segment payload to the server", async () => {
      const tablet = newObjectTablet();
      tablet.addRow(1608268702780, ["r1", null]);
      tablet.setObjectValueAt(
        true,
        0,
        Buffer.from([0x01, 0x02, 0x03]),
        1,
        0,
      );

      await session.insertTablet(tablet);

      expect(insertTablet).toHaveBeenCalledTimes(1);
      expect(capturedReq.writeToTable).toBe(true);
      expect(capturedReq.types).toEqual([TSDataType.STRING, TSDataType.OBJECT]);
      expect(capturedReq.size).toBe(1);
      const expectedTimestamps = Buffer.alloc(8);
      expectedTimestamps.writeBigInt64BE(BigInt(1608268702780), 0);
      expect(capturedReq.timestamps.equals(expectedTimestamps)).toBe(true);

      // STRING 'r1': i32 len 2 + 'r1'; OBJECT segment: i32 len 12 + payload;
      // two no-null bitmap flags.
      const expectedValues = Buffer.concat([
        Buffer.from([0, 0, 0, 2, 0x72, 0x31]),
        Buffer.from([0, 0, 0, 12]),
        Buffer.from([1, 0, 0, 0, 0, 0, 0, 0, 0, 0x01, 0x02, 0x03]),
        Buffer.from([0, 0]),
      ]);
      expect(capturedReq.values.equals(expectedValues)).toBe(true);
    });

    it("marks a null OBJECT cell in the bitmap while keeping the payload empty", async () => {
      const tablet = newObjectTablet();
      tablet.addRow(1, ["r1", null]);

      await session.insertTablet(tablet);

      const values: Buffer = capturedReq.values;
      // STRING: 6 bytes ('r1') + OBJECT empty: 4 bytes + bitmap section:
      // col0 flag 0, col1 flag 1 + 1 bitmap byte (bit 0 set for row 0).
      expect(values.length).toBe(6 + 4 + 1 + 1 + 1);
      const expected = Buffer.concat([
        Buffer.from([0, 0, 0, 2, 0x72, 0x31]),
        Buffer.from([0, 0, 0, 0]),
        Buffer.from([0x00, 0x01, 0x01]),
      ]);
      expect(values.equals(expected)).toBe(true);
    });
  });
});
