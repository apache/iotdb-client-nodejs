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

import { Connection } from "../connection/Connection";
import {
  Config,
  DEFAULT_CONFIG,
  parseNodeUrls,
  EndPoint,
} from "../utils/Config";
import { logger } from "../utils/Logger";
import { registerClosable, unregisterClosable } from "../utils/ProcessCleanup";
import { SessionDataSet } from "./SessionDataSet";
import { RowRecord } from "./RowRecord";
import { BaseColumnDecoder, ColumnEncoding, Column } from "./ColumnDecoder";
import { RedirectException } from "../utils/Errors";

const ttypes = require("../thrift/generated/client_types");

/**
 * @deprecated QueryResult is deprecated. Use SessionDataSet instead.
 */
export interface QueryResult {
  columns: string[];
  dataTypes: string[];
  rows: any[][];
  queryId?: number;
}

export { SessionDataSet, RowRecord };

/**
 * Column category for table model
 * Matches C# and Java IoTDB client definitions
 *
 * Note: TIME is reserved for internal use. When specifying columnCategories in TableTablet,
 * only use TAG, FIELD, and ATTRIBUTE. Timestamps are handled separately via the timestamps array.
 */
export enum ColumnCategory {
  TAG = 0, // Tag column - indexed for WHERE clause filtering (e.g., device_id, region_id)
  FIELD = 1, // Field column - measurement values (e.g., temperature, humidity)
  ATTRIBUTE = 2, // Attribute column - metadata not indexed (e.g., model, firmware_version)
  TIME = 3, // Time column (reserved for internal use, do not use in columnCategories)
}

/**
 * Tree model tablet interface - for timeseries model
 * Uses deviceId as the full path (e.g., "root.sg.device")
 */
export interface ITreeTablet {
  deviceId: string;
  measurements: string[];
  dataTypes: number[];
  timestamps: number[];
  values: any[][];
}

/**
 * Table model tablet interface - for relational/table model
 * Uses tableName and includes column categories
 */
export interface ITableTablet {
  tableName: string;
  columnNames: string[];
  columnTypes: number[];
  columnCategories: ColumnCategory[];
  timestamps: number[];
  values: any[][];
}

/**
 * Tree model tablet class with helper methods
 * Convenient for building tablets row-by-row
 */
export class TreeTablet implements ITreeTablet {
  deviceId: string;
  measurements: string[];
  dataTypes: number[];
  timestamps: number[];
  values: any[][];

  constructor(deviceId: string, measurements: string[], dataTypes: number[]) {
    this.deviceId = deviceId;
    this.measurements = measurements;
    this.dataTypes = dataTypes;
    this.timestamps = [];
    this.values = [];
  }

  /**
   * Add a row to the tablet
   * @param timestamp - The timestamp for this row
   * @param values - Array of values, must match the length of measurements
   */
  addRow(timestamp: number, values: any[]): void {
    if (values.length !== this.measurements.length) {
      throw new Error(
        `Values array length (${values.length}) does not match measurements length (${this.measurements.length})`,
      );
    }
    this.timestamps.push(timestamp);
    this.values.push(values);
  }
}

/**
 * Table model tablet class with helper methods
 * Convenient for building tablets row-by-row
 */
export class TableTablet implements ITableTablet {
  tableName: string;
  columnNames: string[];
  columnTypes: number[];
  columnCategories: ColumnCategory[];
  timestamps: number[];
  values: any[][];

  constructor(
    tableName: string,
    columnNames: string[],
    columnTypes: number[],
    columnCategories: ColumnCategory[],
  ) {
    if (
      columnNames.length !== columnTypes.length ||
      columnNames.length !== columnCategories.length
    ) {
      throw new Error(
        "columnNames, columnTypes, and columnCategories must have the same length",
      );
    }
    this.tableName = tableName;
    this.columnNames = columnNames;
    this.columnTypes = columnTypes;
    this.columnCategories = columnCategories;
    this.timestamps = [];
    this.values = [];
  }

  /**
   * Add a row to the tablet
   * @param timestamp - The timestamp for this row
   * @param values - Array of values, must match the length of columnNames
   */
  addRow(timestamp: number, values: any[]): void {
    if (values.length !== this.columnNames.length) {
      throw new Error(
        `Values array length (${values.length}) does not match columnNames length (${this.columnNames.length})`,
      );
    }
    this.timestamps.push(timestamp);
    this.values.push(values);
  }
}

/**
 * @deprecated Use TreeTablet for tree model or TableTablet for table model instead
 */
export interface Tablet {
  deviceId: string;
  measurements: string[];
  dataTypes: number[];
  timestamps: number[];
  values: any[][];
}

export class Session {
  protected config: Config;
  protected connection: Connection;
  private lastRedirectEndpoint: EndPoint | null = null;

  constructor(config: Config) {
    // Validate config - either host/port or nodeUrls must be provided
    if (!config.host && !config.nodeUrls) {
      throw new Error("Either host/port or nodeUrls must be provided");
    }

    if (config.host && !config.port) {
      throw new Error("Port is required when host is provided");
    }

    if (config.nodeUrls && config.nodeUrls.length === 0) {
      throw new Error("nodeUrls array cannot be empty");
    }

    // If nodeUrls is provided, parse and use the first node for single session
    if (config.nodeUrls && config.nodeUrls.length > 0) {
      // Parse nodeUrls if in string format
      const endpoints: EndPoint[] =
        typeof config.nodeUrls[0] === "string"
          ? parseNodeUrls(config.nodeUrls as string[])
          : (config.nodeUrls as EndPoint[]);

      const firstNode = endpoints[0];
      this.config = {
        ...DEFAULT_CONFIG,
        ...config,
        host: firstNode.host,
        port: firstNode.port,
      } as Config;
    } else {
      this.config = { ...DEFAULT_CONFIG, ...config } as Config;
    }

    this.connection = new Connection(this.config);
    registerClosable(this);
  }

  async open(): Promise<void> {
    await this.connection.open();
  }

  async close(): Promise<void> {
    await this.connection.close();
    unregisterClosable(this);
  }

  /**
   * Get and clear the last redirect endpoint recommendation.
   * Returns null if no redirect was recommended in the last operation.
   */
  getAndClearLastRedirect(): EndPoint | null {
    const redirect = this.lastRedirectEndpoint;
    this.lastRedirectEndpoint = null;
    return redirect;
  }

  /**
   * Execute a query and return a SessionDataSet for iterating through results.
   * This method supports lazy loading and proper resource management.
   *
   * @param sql SQL query statement
   * @param timeoutMs Query timeout in milliseconds (default: 60000)
   * @returns SessionDataSet for iterating through query results
   *
   * @example
   * ```typescript
   * const dataSet = await session.executeQueryStatement('SELECT * FROM root.test');
   * while (await dataSet.hasNext()) {
   *   const row = dataSet.next();
   *   console.log(row.getTimestamp(), row.getFields());
   * }
   * await dataSet.close();
   * ```
   */
  async executeQueryStatement(
    sql: string,
    timeoutMs: number = 60000,
  ): Promise<SessionDataSet> {
    logger.debug(`Executing query: ${sql}`);

    const client = this.connection.getClient();
    const sessionId = this.connection.getSessionId();
    const statementId = this.connection.getStatementId();

    const req = new ttypes.TSExecuteStatementReq({
      sessionId: sessionId,
      statement: sql,
      statementId: statementId,
      fetchSize: this.config.fetchSize || 1024,
      timeout: timeoutMs,
      enableRedirectQuery: true,
      jdbcQuery: false, // Changed to false to use queryDataSet format
    });

    return new Promise((resolve, reject) => {
      client.executeQueryStatementV2(req, async (err: Error, response: any) => {
        if (err) {
          reject(err);
          return;
        }

        if (response.status.code !== 200) {
          reject(new Error(response.status.message || "Query failed"));
          return;
        }

        try {
          let initialRows: any[][];
          const ignoreTimeStamp = response.ignoreTimeStamp || false;

          logger.debug(
            `executeQueryStatement response: ignoreTimeStamp=${ignoreTimeStamp}`,
          );
          logger.debug(
            `executeQueryStatement response: queryResult exists=${!!response.queryResult}, length=${response.queryResult?.length || 0}`,
          );
          logger.debug(
            `executeQueryStatement response: queryDataSet exists=${!!response.queryDataSet}`,
          );

          // Handle both queryDataSet and queryResult formats
          if (response.queryResult && response.queryResult.length > 0) {
            // New TsBlock format (queryResult is Buffer[])
            initialRows = await this.parseQueryResult(
              response.queryResult,
              response.columns?.length || 0,
              response.dataTypeList || [],
              ignoreTimeStamp,
            );
          } else if (response.queryDataSet) {
            // Old columnar format (TSQueryDataSet)
            initialRows = await this.parseDataSet(
              response.queryDataSet,
              response.columns?.length || 0,
              response.dataTypeList || [],
            );
          } else {
            // No data in response
            initialRows = [];
          }

          // Create SessionDataSet
          const dataSet = new SessionDataSet(
            this,
            response.queryId,
            statementId,
            sql,
            response.columns || [],
            response.dataTypeList || [],
            initialRows,
            response.moreData || false,
            this.config.fetchSize || 1024,
            sessionId,
            ignoreTimeStamp,
            response.columnIndex2TsBlockColumnIndexList,
          );

          resolve(dataSet);
        } catch (parseError) {
          reject(parseError);
        }
      });
    });
  }

  async executeNonQueryStatement(sql: string): Promise<void> {
    logger.debug(`Executing non-query: ${sql}`);

    const client = this.connection.getClient();
    const sessionId = this.connection.getSessionId();
    const statementId = this.connection.getStatementId();

    const req = new ttypes.TSExecuteStatementReq({
      sessionId: sessionId,
      statement: sql,
      statementId: statementId,
    });

    return new Promise((resolve, reject) => {
      client.executeUpdateStatementV2(req, (err: Error, response: any) => {
        if (err) {
          reject(err);
          return;
        }

        if (response.status.code !== 200) {
          reject(
            new Error(response.status.message || "Statement execution failed"),
          );
          return;
        }

        resolve();
      });
    });
  }

  /**
   * Insert tablet (supports both tree and table models)
   * @param tablet TreeTablet for tree model or TableTablet for table model
   */
  async insertTablet(
    tablet: TreeTablet | ITreeTablet | TableTablet | ITableTablet,
  ): Promise<void> {
    // Check if it's a TableTablet
    if ("tableName" in tablet) {
      return this.insertTableTabletInternal(
        tablet as TableTablet | ITableTablet,
      );
    } else {
      return this.insertTreeTabletInternal(tablet as TreeTablet | ITreeTablet);
    }
  }

  /**
   * Internal method to insert tree model tablet
   */
  private async insertTreeTabletInternal(
    tablet: TreeTablet | ITreeTablet,
  ): Promise<void> {
    logger.debug(`Inserting tree tablet for device: ${tablet.deviceId}`);

    const client = this.connection.getClient();
    const sessionId = this.connection.getSessionId();

    // Validate timestamps and convert to BigInt
    const bigIntTimestamps = tablet.timestamps.map((t) => {
      if (typeof t !== "number" || !Number.isFinite(t)) {
        throw new Error(`Invalid timestamp: ${t}`);
      }
      return BigInt(Math.floor(t));
    });

    // Serialize timestamps in big-endian format (Java/network standard)
    const timestampBuffer = Buffer.alloc(bigIntTimestamps.length * 8);
    bigIntTimestamps.forEach((ts, i) => {
      timestampBuffer.writeBigInt64BE(ts, i * 8);
    });

    const req = new ttypes.TSInsertTabletReq({
      sessionId: sessionId,
      prefixPath: tablet.deviceId,
      measurements: tablet.measurements,
      values: this.serializeTabletValues(
        tablet.values,
        tablet.dataTypes,
        tablet.timestamps.length,
      ),
      timestamps: timestampBuffer,
      types: tablet.dataTypes,
      size: tablet.timestamps.length,
      isAligned: false,
    });

    return new Promise((resolve, reject) => {
      client.insertTablet(req, (err: Error, response: any) => {
        if (err) {
          reject(err);
          return;
        }

        // Handle redirection recommendation (code 400)
        // Note: Code 400 means write SUCCEEDED but server recommends a different endpoint for future operations
        if (response.code === 400) {
          // Store redirect recommendation if provided
          if (response.redirectNode) {
            this.lastRedirectEndpoint = {
              host: response.redirectNode.internalIp || response.redirectNode.ip,
              port: response.redirectNode.port,
            };
            logger.debug(
              `Server recommends endpoint ${this.lastRedirectEndpoint.host}:${this.lastRedirectEndpoint.port} for future writes to ${tablet.deviceId}`
            );
          } else {
            logger.debug(`Server returned code 400 without redirect node for ${tablet.deviceId}`);
          }
          // Resolve successfully - the write already succeeded
          resolve();
          return;
        }

        if (response.code !== 200) {
          reject(new Error(response.message || "Insert tablet failed"));
          return;
        }

        resolve();
      });
    });
  }

  /**
   * Internal method to insert table model tablet
   */
  private async insertTableTabletInternal(
    tablet: TableTablet | ITableTablet,
  ): Promise<void> {
    logger.debug(`Inserting table tablet for table: ${tablet.tableName}`);

    const client = this.connection.getClient();
    const sessionId = this.connection.getSessionId();

    // Validate timestamps and convert to BigInt
    const bigIntTimestamps = tablet.timestamps.map((t) => {
      if (typeof t !== "number" || !Number.isFinite(t)) {
        throw new Error(`Invalid timestamp: ${t}`);
      }
      return BigInt(Math.floor(t));
    });

    // Serialize timestamps in big-endian format
    const timestampBuffer = Buffer.alloc(bigIntTimestamps.length * 8);
    bigIntTimestamps.forEach((ts, i) => {
      timestampBuffer.writeBigInt64BE(ts, i * 8);
    });

    // For table model, use database.tableName format for prefixPath
    // If tableName already contains database (e.g., "test.table1"), use as-is
    // Otherwise, we need to get current database context
    const prefixPath = tablet.tableName;

    logger.debug(
      `Table insert: prefixPath=${prefixPath}, columns=${tablet.columnNames.length}, rows=${tablet.timestamps.length}`,
    );

    // Convert columnCategories to signed bytes for Thrift
    const columnCategoriesBytes = tablet.columnCategories.map((category) => {
      // Convert unsigned to signed byte (-128 to 127)
      return category < 128 ? category : category - 256;
    });

    const req = new ttypes.TSInsertTabletReq({
      sessionId: sessionId,
      prefixPath: prefixPath,
      measurements: tablet.columnNames,
      values: this.serializeTabletValues(
        tablet.values,
        tablet.columnTypes,
        tablet.timestamps.length,
      ),
      timestamps: timestampBuffer,
      types: tablet.columnTypes,
      size: tablet.timestamps.length,
      isAligned: false,
      writeToTable: true, // CRITICAL: Tell IoTDB this is table model data
      columnCategories: columnCategoriesBytes, // Pass column categories for table model
    });

    return new Promise((resolve, reject) => {
      client.insertTablet(req, (err: Error, response: any) => {
        if (err) {
          reject(err);
          return;
        }

        // Handle redirection recommendation (code 400)
        // Note: Code 400 means write SUCCEEDED but server recommends a different endpoint for future operations
        if (response.code === 400) {
          // Store redirect recommendation if provided
          if (response.redirectNode) {
            this.lastRedirectEndpoint = {
              host: response.redirectNode.internalIp || response.redirectNode.ip,
              port: response.redirectNode.port,
            };
            logger.debug(
              `Server recommends endpoint ${this.lastRedirectEndpoint.host}:${this.lastRedirectEndpoint.port} for future writes to table ${tablet.tableName}`
            );
          } else {
            logger.debug(`Server returned code 400 without redirect node for table ${tablet.tableName}`);
          }
          // Resolve successfully - the write already succeeded
          resolve();
          return;
        }

        if (response.code !== 200) {
          const errorMsg = response.message || "Insert table tablet failed";
          logger.error(`Insert table tablet failed: code=${response.code}, message=${response.message}`);
          logger.error(`Request details: prefixPath=${prefixPath}, columns=${tablet.columnNames.length}, rows=${tablet.timestamps.length}`);
          reject(new Error(`${errorMsg} (code: ${response.code})`));
          return;
        }

        resolve();
      });
    });
  }

  protected serializeTabletValues(
    values: any[][],
    dataTypes: number[],
    rowCount: number,
  ): Buffer {
    // Serialize tablet values based on data types
    // Format: all columns data, then bitmap for null values
    const buffers: Buffer[] = [];
    const bitMaps: (boolean[] | null)[] = [];

    // Serialize each column
    for (let colIndex = 0; colIndex < dataTypes.length; colIndex++) {
      const dataType = dataTypes[colIndex];
      const columnValues = values.map((row) => row[colIndex]);

      // Track null values for this column
      const nullBitmap: boolean[] = [];
      let hasNull = false;

      for (let rowIndex = 0; rowIndex < columnValues.length; rowIndex++) {
        const isNull =
          columnValues[rowIndex] === null ||
          columnValues[rowIndex] === undefined;
        nullBitmap.push(isNull);
        if (isNull) {
          hasNull = true;
        }
      }

      const buffer = this.serializeColumn(columnValues, dataType);
      buffers.push(buffer);
      bitMaps.push(hasNull ? nullBitmap : null);
    }

    // Append bitmap information
    const bitmapBuffer = this.serializeBitMaps(bitMaps, rowCount);
    buffers.push(bitmapBuffer);

    return Buffer.concat(buffers);
  }

  protected serializeColumn(values: any[], dataType: number): Buffer {
    // TSDataType from Apache TSFile:
    // BOOLEAN(0), INT32(1), INT64(2), FLOAT(3), DOUBLE(4), TEXT(5),
    // VECTOR(6), UNKNOWN(7), TIMESTAMP(8), DATE(9), BLOB(10), STRING(11), OBJECT(12)
    switch (dataType) {
      case 0: // BOOLEAN
        return Buffer.from(
          values.map((v) => (v === null || v === undefined ? 0 : v ? 1 : 0)),
        );
      case 1: {
        // INT32 - Use big-endian
        const buffer = Buffer.alloc(values.length * 4);
        values.forEach((v, i) => {
          buffer.writeInt32BE(v === null || v === undefined ? 0 : v, i * 4);
        });
        return buffer;
      }
      case 2: {
        // INT64 - Use big-endian
        const buffer = Buffer.alloc(values.length * 8);
        values.forEach((v, i) => {
          buffer.writeBigInt64BE(
            v === null || v === undefined ? BigInt(0) : BigInt(v),
            i * 8,
          );
        });
        return buffer;
      }
      case 3: {
        // FLOAT - Use big-endian
        const buffer = Buffer.alloc(values.length * 4);
        values.forEach((v, i) => {
          buffer.writeFloatBE(v === null || v === undefined ? 0.0 : v, i * 4);
        });
        return buffer;
      }
      case 4: {
        // DOUBLE - Use big-endian
        const buffer = Buffer.alloc(values.length * 8);
        values.forEach((v, i) => {
          buffer.writeDoubleBE(v === null || v === undefined ? 0.0 : v, i * 8);
        });
        return buffer;
      }
      case 5: // TEXT
      case 11: {
        // STRING (similar to TEXT)
        // Optimized: Pre-calculate total size to avoid multiple Buffer.concat calls

        // Phase 1: Convert all values to buffers and calculate total size
        const strData: Buffer[] = [];
        let totalSize = 0;

        for (const v of values) {
          const str = v === null || v === undefined ? "" : String(v);
          const strBytes = Buffer.from(str, "utf8");
          strData.push(strBytes);
          totalSize += 4 + strBytes.length; // 4 bytes for length + string bytes
        }

        // Phase 2: Allocate single buffer and copy data
        const result = Buffer.allocUnsafe(totalSize);
        let offset = 0;

        for (const strBytes of strData) {
          // Write length (4 bytes, big-endian)
          result.writeInt32BE(strBytes.length, offset);
          offset += 4;

          // Copy string bytes
          strBytes.copy(result, offset);
          offset += strBytes.length;
        }

        return result;
      }
      case 8: {
        // TIMESTAMP (stored as INT64 - milliseconds) - Use big-endian for consistency
        const buffer = Buffer.alloc(values.length * 8);
        values.forEach((v, i) => {
          let timestamp = BigInt(0);
          if (v !== null && v !== undefined) {
            if (v instanceof Date) {
              timestamp = BigInt(v.getTime());
            } else {
              timestamp = BigInt(v);
            }
          }
          buffer.writeBigInt64BE(timestamp, i * 8);
        });
        return buffer;
      }
      case 9: {
        // DATE (stored as INT32 - days since epoch) - Use big-endian
        const buffer = Buffer.alloc(values.length * 4);
        values.forEach((v, i) => {
          let days = 0;
          if (v !== null && v !== undefined) {
            if (v instanceof Date) {
              days = Math.floor(v.getTime() / (24 * 60 * 60 * 1000));
            } else {
              days = v;
            }
          }
          buffer.writeInt32BE(days, i * 4);
        });
        return buffer;
      }
      case 10: {
        // BLOB
        // Optimized: Pre-calculate total size to avoid multiple Buffer.concat calls

        // Phase 1: Convert all values to buffers and calculate total size
        const blobData: Buffer[] = [];
        let totalSize = 0;

        for (const v of values) {
          const blob =
            v === null || v === undefined
              ? Buffer.alloc(0)
              : Buffer.isBuffer(v)
                ? v
                : Buffer.from(v);
          blobData.push(blob);
          totalSize += 4 + blob.length; // 4 bytes for length + blob bytes
        }

        // Phase 2: Allocate single buffer and copy data
        const result = Buffer.allocUnsafe(totalSize);
        let offset = 0;

        for (const blob of blobData) {
          // Write length (4 bytes, big-endian)
          result.writeInt32BE(blob.length, offset);
          offset += 4;

          // Copy blob bytes
          blob.copy(result, offset);
          offset += blob.length;
        }

        return result;
      }
      default:
        throw new Error(`Unsupported data type: ${dataType}`);
    }
  }

  /**
   * Serialize BitMap for null value indicators.
   *
   * BitMap Serialization Format (compatible with Apache IoTDB Java client):
   *
   * For each column:
   *   1. columnHasNull flag (1 byte): 0=no nulls, 1=has nulls
   *   2. If has nulls: bitmap array
   *      - 8 values packed per byte (LSB-first bit ordering)
   *      - Bit=1 means NULL, Bit=0 means NOT NULL
   *      - Size = Math.ceil(rowCount / 8) bytes
   *      - Padding: Remaining bits in last byte are set to 0
   *
   * Example 1: rowCount=10, nulls at indices [1, 4, 6, 9]
   *   Row indices:     0  1  2  3  4  5  6  7  | 8  9  (6 padding bits)
   *   Null values:     0  1  0  0  1  0  1  0  | 0  1  0  0  0  0  0  0
   *   Bit positions:   0  1  2  3  4  5  6  7  | 0  1  2  3  4  5  6  7
   *   Binary (LSB):    01001010                 |    01000000
   *   Hex:             0x52                     |    0x02
   *
   * Example 2: rowCount=13, nulls at indices [0, 3, 8, 10]
   *   Byte 1: indices 0-7  → binary 00001001 → 0x09
   *   Byte 2: indices 8-12 → binary 00000101 → 0x05
   *
   * Bit Ordering Details (LSB-first):
   *   - Row index 0 maps to bit 0 (LSB) = 1 << 0 = 0x01
   *   - Row index 1 maps to bit 1       = 1 << 1 = 0x02
   *   - Row index 2 maps to bit 2       = 1 << 2 = 0x04
   *   - Row index 3 maps to bit 3       = 1 << 3 = 0x08
   *   - ...
   *   - Row index 7 maps to bit 7 (MSB) = 1 << 7 = 0x80
   *
   * This format is compatible with:
   * - Java: org.apache.iotdb.session.tablet.Tablet.writeBitMaps()
   * - C++: Session::getValue() with BitMap serialization
   * - Python: Tablet.get_binary_values() with struct.pack
   *
   * @param bitMaps - Array of boolean arrays (or null) for each column, true=null, false=not null
   * @param rowCount - Number of rows in the tablet
   * @returns Serialized bitmap buffer
   */
  protected serializeBitMaps(
    bitMaps: (boolean[] | null)[],
    rowCount: number,
  ): Buffer {
    const buffers: Buffer[] = [];

    for (const bitMap of bitMaps) {
      const columnHasNull = bitMap !== null;

      // Write columnHasNull flag (1 byte): 1 if column has nulls, 0 if not
      buffers.push(Buffer.from([columnHasNull ? 1 : 0]));

      if (columnHasNull && bitMap) {
        // Calculate number of bytes needed for bitmap (1 bit per row, 8 rows per byte)
        // Example: 10 rows → Math.ceil(10/8) = 2 bytes
        const bitmapByteCount = Math.ceil(rowCount / 8);
        const bitmapBytes = Buffer.alloc(bitmapByteCount);

        // Pack null indicators into bits (LSB-first ordering)
        // Bit=1 means NULL, Bit=0 means NOT NULL
        for (let i = 0; i < bitMap.length; i++) {
          if (bitMap[i]) {
            const byteIndex = Math.floor(i / 8); // Which byte in the bitmap
            const bitIndex = i % 8; // Which bit in the byte (0-7)

            // Set bit using LSB-first ordering: 1 << bitIndex
            // Row 0 → bit 0 (LSB) = 1 << 0 = 0x01
            // Row 1 → bit 1       = 1 << 1 = 0x02
            // Row 7 → bit 7 (MSB) = 1 << 7 = 0x80
            bitmapBytes[byteIndex] |= 1 << bitIndex;
          }
        }

        buffers.push(bitmapBytes);
      }
    }

    return Buffer.concat(buffers);
  }

  /**
   * Parse queryResult (TsBlock format) - new format used by IoTDB
   * Each buffer in queryResult is a complete TsBlock containing:
   * - Value column count (INT32)
   * - Value column data types (list of BYTE)
   * - Position count (INT32)
   * - Column encodings (list of BYTE)
   * - Time column data
   * - Value columns data
   *
   * @param ignoreTimeStamp - If true, no time column is present
   */
  async parseQueryResult(
    queryResult: Buffer[],
    _columnCount: number,
    dataTypes: string[],
    ignoreTimeStamp: boolean = false,
  ): Promise<any[][]> {
    const rows: any[][] = [];

    if (!queryResult || queryResult.length === 0) {
      logger.debug("parseQueryResult: queryResult is null or empty");
      return rows;
    }

    logger.debug(
      `parseQueryResult: queryResult has ${queryResult.length} TsBlocks, ignoreTimeStamp=${ignoreTimeStamp}`,
    );
    logger.debug(`parseQueryResult: dataTypes: ${JSON.stringify(dataTypes)}`);

    // Process each TsBlock in queryResult
    for (let blockIndex = 0; blockIndex < queryResult.length; blockIndex++) {
      const tsBlockBuffer = Buffer.isBuffer(queryResult[blockIndex])
        ? queryResult[blockIndex]
        : Buffer.from(queryResult[blockIndex]);

      logger.debug(
        `parseQueryResult: Processing TsBlock ${blockIndex}, size=${tsBlockBuffer.length} bytes`,
      );

      try {
        const blockRows = this.parseTsBlock(
          tsBlockBuffer,
          dataTypes,
          ignoreTimeStamp,
        );
        rows.push(...blockRows);
      } catch (error) {
        logger.error(`Error parsing TsBlock ${blockIndex}:`, error);
        throw error;
      }
    }

    logger.debug(`parseQueryResult: returning ${rows.length} total rows`);
    return rows;
  }

  /**
   * Parse a single TsBlock buffer
   * TsBlock format (from Apache IoTDB C# client):
   * +-------------+---------------+---------+------------+-----------+----------+
   * | val col cnt | val col types | pos cnt | encodings  | time col  | val col  |
   * +-------------+---------------+---------+------------+-----------+----------+
   * | int32       | list[byte]    | int32   | list[byte] |  bytes    | bytes    |
   * +-------------+---------------+---------+------------+-----------+----------+
   *
   * IMPORTANT: TsBlock ALWAYS contains time column encoding and time column data,
   * regardless of the ignoreTimeStamp setting. The ignoreTimeStamp flag only
   * affects whether the timestamp is included in the returned row data, not the
   * TsBlock binary format. This matches the behavior of iotdb-client-csharp.
   */
  private parseTsBlock(
    buffer: Buffer,
    dataTypes: string[],
    ignoreTimeStamp: boolean,
  ): any[][] {
    let offset = 0;

    // Read value column count (INT32, 4 bytes, BIG ENDIAN)
    const valueColumnCount = buffer.readInt32BE(offset);
    offset += 4;
    logger.debug(`TsBlock: valueColumnCount=${valueColumnCount}`);

    // Read value column data types (valueColumnCount bytes)
    const valueColumnTypes: number[] = [];
    for (let i = 0; i < valueColumnCount; i++) {
      valueColumnTypes.push(buffer.readUInt8(offset));
      offset += 1;
    }
    logger.debug(
      `TsBlock: valueColumnTypes=${JSON.stringify(valueColumnTypes)}`,
    );

    // Read position count (INT32, 4 bytes, BIG ENDIAN)
    const positionCount = buffer.readInt32BE(offset);
    offset += 4;
    logger.debug(`TsBlock: positionCount=${positionCount}`);

    // Read encodings - time column + value columns
    // Time column encoding (1 byte)
    const timeEncoding: ColumnEncoding = buffer.readUInt8(offset);
    offset += 1;
    logger.debug(`TsBlock: timeEncoding=${timeEncoding}`);

    // Value column encodings (valueColumnCount bytes)
    const valueEncodings: ColumnEncoding[] = [];
    for (let i = 0; i < valueColumnCount; i++) {
      valueEncodings.push(buffer.readUInt8(offset));
      offset += 1;
    }
    logger.debug(`TsBlock: valueEncodings=${JSON.stringify(valueEncodings)}`);

    // Read time column using decoder
    // IMPORTANT: TsBlock ALWAYS contains time column data, even when ignoreTimeStamp=true
    // This matches the behavior of iotdb-client-csharp
    const timeDecoder = BaseColumnDecoder.getDecoder(timeEncoding);
    const { column: timeColumn, bytesRead: timeColumnBytesRead } =
      timeDecoder.readColumn(buffer, offset, 8 /* TIMESTAMP */, positionCount);
    offset += timeColumnBytesRead;
    logger.debug(
      `TsBlock: read time column, ${timeColumn.values.length} timestamps, ignoreTimeStamp=${ignoreTimeStamp}`,
    );

    // Read value columns using decoders
    const valueColumns: Column[] = [];
    for (let i = 0; i < valueColumnCount; i++) {
      const dataType = valueColumnTypes[i];
      const encoding = valueEncodings[i];

      const decoder = BaseColumnDecoder.getDecoder(encoding);
      const { column, bytesRead } = decoder.readColumn(
        buffer,
        offset,
        dataType,
        positionCount,
      );
      valueColumns.push(column);
      offset += bytesRead;

      logger.debug(
        `TsBlock: read column ${i}, type=${dataType}, encoding=${encoding}, ${column.values.length} values`,
      );
    }

    // Build rows from columns
    const rows: any[][] = [];
    for (let rowIndex = 0; rowIndex < positionCount; rowIndex++) {
      const row: any[] = [];

      // Add timestamp only if not ignoring timestamp
      // Note: timeColumn is always present in TsBlock, but we only include it in results when needed
      if (
        !ignoreTimeStamp &&
        timeColumn &&
        rowIndex < timeColumn.values.length
      ) {
        row.push(timeColumn.values[rowIndex]);
      }

      // Add column values
      for (let colIndex = 0; colIndex < valueColumns.length; colIndex++) {
        row.push(valueColumns[colIndex].values[rowIndex]);
      }

      rows.push(row);
    }

    return rows;
  }

  /**
   * Helper method to convert data type string to numeric code
   */
  private getDataTypeCode(typeStr: string | undefined): number {
    if (!typeStr) return 5; // Default to TEXT

    const type = String(typeStr).toUpperCase();
    if (type.includes("BOOLEAN")) return 0;
    else if (type.includes("INT32")) return 1;
    else if (type.includes("INT64")) return 2;
    else if (type.includes("FLOAT")) return 3;
    else if (type.includes("DOUBLE")) return 4;
    else if (type.includes("TEXT")) return 5;
    else if (type.includes("TIMESTAMP")) return 8;
    else if (type.includes("DATE")) return 9;
    else if (type.includes("BLOB")) return 10;
    else if (type.includes("STRING")) return 11;
    return 5; // Default to TEXT
  }

  /**
   * Helper method to determine row count from a buffer based on data type
   */
  private getRowCountFromBuffer(buffer: Buffer, dataType: number): number {
    const length = buffer.length;

    // Calculate based on fixed-size types
    switch (dataType) {
      case 0: // BOOLEAN - 1 byte per value
        return length;
      case 1: // INT32 - 4 bytes per value
      case 9: // DATE - 4 bytes per value
        return Math.floor(length / 4);
      case 2: // INT64 - 8 bytes per value
      case 8: // TIMESTAMP - 8 bytes per value
        return Math.floor(length / 8);
      case 3: // FLOAT - 4 bytes per value
        return Math.floor(length / 4);
      case 4: // DOUBLE - 8 bytes per value
        return Math.floor(length / 8);
      case 5: // TEXT - variable length, need to parse
      case 10: // BLOB - variable length
      case 11: // STRING - variable length
        // For variable-length types, count entries by parsing length prefixes
        let count = 0;
        let offset = 0;
        while (offset + 4 <= length) {
          const strLength = buffer.readInt32BE(offset);
          offset += 4 + strLength;
          count++;
        }
        return count;
      default:
        logger.warn(
          `Unknown data type ${dataType}, cannot determine row count`,
        );
        return 0;
    }
  }

  // parseDataSet is used by SessionDataSet for parsing query results
  // Keep it as public for SessionDataSet to access
  async parseDataSet(
    dataset: any,
    _columnCount: number,
    dataTypes: string[],
  ): Promise<any[][]> {
    const rows: any[][] = [];

    if (!dataset) {
      logger.debug("parseDataSet: dataset is null or undefined");
      return rows;
    }

    // Handle case where dataset.time is not a Buffer (might be an array or null)
    if (!dataset.time) {
      logger.debug("parseDataSet: dataset.time is null or undefined");
      return rows;
    }

    logger.debug(
      `parseDataSet: dataset.time type: ${typeof dataset.time}, isBuffer: ${Buffer.isBuffer(dataset.time)}, length: ${dataset.time.length || "N/A"}`,
    );
    logger.debug(
      `parseDataSet: dataset.valueList type: ${typeof dataset.valueList}, isArray: ${Array.isArray(dataset.valueList)}, length: ${dataset.valueList?.length || "N/A"}`,
    );
    logger.debug(`parseDataSet: dataTypes: ${JSON.stringify(dataTypes)}`);

    // Convert time to Buffer if it's not already
    const timeBuffer = Buffer.isBuffer(dataset.time)
      ? dataset.time
      : Buffer.from(dataset.time);

    // Validate buffer has sufficient length
    const timeBufferLength = timeBuffer.length;
    if (timeBufferLength === 0 || timeBufferLength % 8 !== 0) {
      logger.warn("Invalid time buffer length:", timeBufferLength);
      return rows;
    }

    const rowCount = Math.floor(timeBufferLength / 8);
    logger.debug(`parseDataSet: rowCount = ${rowCount}`);

    // Parse value buffers
    const parsedColumns: any[][] = [];
    if (dataset.valueList && Array.isArray(dataset.valueList)) {
      for (let colIndex = 0; colIndex < dataset.valueList.length; colIndex++) {
        const valueBuffer = Buffer.isBuffer(dataset.valueList[colIndex])
          ? dataset.valueList[colIndex]
          : Buffer.from(dataset.valueList[colIndex]);
        const bitmap =
          dataset.bitmapList && dataset.bitmapList[colIndex]
            ? Buffer.isBuffer(dataset.bitmapList[colIndex])
              ? dataset.bitmapList[colIndex]
              : Buffer.from(dataset.bitmapList[colIndex])
            : null;

        // Get data type - dataTypes might be an array of strings or numbers
        let dataType = 5; // Default to TEXT
        if (dataTypes && dataTypes[colIndex] !== undefined) {
          const typeStr = String(dataTypes[colIndex]).toUpperCase();
          if (typeStr.includes("BOOLEAN")) dataType = 0;
          else if (typeStr.includes("INT32")) dataType = 1;
          else if (typeStr.includes("INT64")) dataType = 2;
          else if (typeStr.includes("FLOAT")) dataType = 3;
          else if (typeStr.includes("DOUBLE")) dataType = 4;
          else if (typeStr.includes("TEXT")) dataType = 5;
          else if (typeStr.includes("TIMESTAMP")) dataType = 8;
          else if (typeStr.includes("DATE")) dataType = 9;
          else if (typeStr.includes("BLOB")) dataType = 10;
          else if (typeStr.includes("STRING")) dataType = 11;
        }

        logger.debug(
          `parseDataSet: column ${colIndex}, dataType = ${dataType}, valueBuffer.length = ${valueBuffer.length}`,
        );
        const columnValues = this.deserializeColumn(
          valueBuffer,
          dataType,
          rowCount,
          bitmap,
        );
        parsedColumns.push(columnValues);
      }
    }

    // Build rows
    for (let i = 0; i < rowCount; i++) {
      const row: any[] = [];

      // Add timestamp
      if (i * 8 + 8 <= timeBufferLength) {
        row.push(timeBuffer.readBigInt64LE(i * 8));
      }

      // Add column values
      for (let colIndex = 0; colIndex < parsedColumns.length; colIndex++) {
        row.push(parsedColumns[colIndex][i]);
      }

      rows.push(row);
    }

    logger.debug(`parseDataSet: returning ${rows.length} rows`);
    return rows;
  }

  private deserializeColumn(
    buffer: Buffer,
    dataType: number,
    rowCount: number,
    bitmap: Buffer | null,
  ): any[] {
    const values: any[] = [];

    try {
      switch (dataType) {
        case 0: {
          // BOOLEAN
          for (let i = 0; i < rowCount; i++) {
            if (this.isNull(bitmap, i)) {
              values.push(null);
            } else {
              values.push(buffer[i] !== 0);
            }
          }
          break;
        }
        case 1: {
          // INT32 - TSQueryDataSet uses BIG ENDIAN
          for (let i = 0; i < rowCount; i++) {
            if (this.isNull(bitmap, i)) {
              values.push(null);
            } else {
              values.push(buffer.readInt32BE(i * 4));
            }
          }
          break;
        }
        case 2: {
          // INT64 - TSQueryDataSet uses BIG ENDIAN
          for (let i = 0; i < rowCount; i++) {
            if (this.isNull(bitmap, i)) {
              values.push(null);
            } else {
              values.push(buffer.readBigInt64BE(i * 8));
            }
          }
          break;
        }
        case 3: {
          // FLOAT - TSQueryDataSet uses BIG ENDIAN
          for (let i = 0; i < rowCount; i++) {
            if (this.isNull(bitmap, i)) {
              values.push(null);
            } else {
              values.push(buffer.readFloatBE(i * 4));
            }
          }
          break;
        }
        case 4: {
          // DOUBLE - TSQueryDataSet uses BIG ENDIAN
          for (let i = 0; i < rowCount; i++) {
            if (this.isNull(bitmap, i)) {
              values.push(null);
            } else {
              values.push(buffer.readDoubleBE(i * 8));
            }
          }
          break;
        }
        case 5: // TEXT
        case 11: {
          // STRING (similar to TEXT) - TSQueryDataSet uses BIG ENDIAN for length
          let offset = 0;
          for (let i = 0; i < rowCount && offset < buffer.length; i++) {
            if (this.isNull(bitmap, i)) {
              values.push(null);
            } else {
              if (offset + 4 > buffer.length) break;
              const strLength = buffer.readInt32BE(offset);
              offset += 4;
              if (offset + strLength > buffer.length) break;
              const str = buffer.toString("utf8", offset, offset + strLength);
              values.push(str);
              offset += strLength;
            }
          }
          break;
        }
        case 8: {
          // TIMESTAMP (stored as INT64 - milliseconds) - TSQueryDataSet uses BIG ENDIAN
          for (let i = 0; i < rowCount; i++) {
            if (this.isNull(bitmap, i)) {
              values.push(null);
            } else {
              // Convert milliseconds to Date object
              const timestamp = Number(buffer.readBigInt64BE(i * 8));
              const date = new Date(timestamp);
              values.push(date);
            }
          }
          break;
        }
        case 9: {
          // DATE (stored as INT32 - days since epoch) - TSQueryDataSet uses BIG ENDIAN
          for (let i = 0; i < rowCount; i++) {
            if (this.isNull(bitmap, i)) {
              values.push(null);
            } else {
              // Convert days since epoch to Date object
              const days = buffer.readInt32BE(i * 4);
              const date = new Date(days * 24 * 60 * 60 * 1000);
              values.push(date);
            }
          }
          break;
        }
        case 10: {
          // BLOB - TSQueryDataSet uses BIG ENDIAN for length
          let offset = 0;
          for (let i = 0; i < rowCount && offset < buffer.length; i++) {
            if (this.isNull(bitmap, i)) {
              values.push(null);
            } else {
              if (offset + 4 > buffer.length) break;
              const blobLength = buffer.readInt32BE(offset);
              offset += 4;
              if (offset + blobLength > buffer.length) break;
              const blob = buffer.slice(offset, offset + blobLength);
              values.push(blob);
              offset += blobLength;
            }
          }
          break;
        }
        default:
          // Unknown type, return nulls
          for (let i = 0; i < rowCount; i++) {
            values.push(null);
          }
      }
    } catch (error) {
      logger.error("Error deserializing column:", error);
      // Fill with nulls on error
      for (let i = values.length; i < rowCount; i++) {
        values.push(null);
      }
    }

    return values;
  }

  private isNull(bitmap: Buffer | null, index: number): boolean {
    if (!bitmap) return false;
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    if (byteIndex >= bitmap.length) return false;
    return (bitmap[byteIndex] & (1 << bitIndex)) === 0;
  }

  isOpen(): boolean {
    return this.connection.isOpen();
  }
}
