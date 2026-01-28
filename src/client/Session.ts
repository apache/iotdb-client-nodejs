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

import { Connection } from '../connection/Connection';
import { Config, DEFAULT_CONFIG } from '../utils/Config';
import { logger } from '../utils/Logger';

const ttypes = require('../thrift/generated/client_types');

export interface QueryResult {
  columns: string[];
  dataTypes: string[];
  rows: any[][];
  queryId?: number;
}

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

  constructor(config: Config) {
    // Validate config - either host/port or nodeUrls must be provided
    if (!config.host && !config.nodeUrls) {
      throw new Error('Either host/port or nodeUrls must be provided');
    }
    
    if (config.host && !config.port) {
      throw new Error('Port is required when host is provided');
    }

    // If nodeUrls is provided, use the first node for single session
    if (config.nodeUrls && config.nodeUrls.length > 0) {
      const firstNode = config.nodeUrls[0];
      this.config = { ...DEFAULT_CONFIG, ...config, host: firstNode.host, port: firstNode.port } as Config;
    } else {
      this.config = { ...DEFAULT_CONFIG, ...config } as Config;
    }
    
    this.connection = new Connection(this.config);
  }

  async open(): Promise<void> {
    await this.connection.open();
  }

  async close(): Promise<void> {
    await this.connection.close();
  }

  async executeQueryStatement(sql: string, timeoutMs: number = 60000): Promise<QueryResult> {
    logger.debug(`Executing query: ${sql}`);

    const client = this.connection.getClient();
    const sessionId = this.connection.getSessionId();
    const statementId = this.connection.getStatementId();

    const req = new ttypes.TSExecuteStatementReq({
      sessionId: sessionId,
      statement: sql,
      statementId: statementId,
      fetchSize: this.config.fetchSize,
      timeout: timeoutMs,
      enableRedirectQuery: true,
      jdbcQuery: true,
    });

    return new Promise((resolve, reject) => {
      client.executeQueryStatementV2(req, async (err: Error, response: any) => {
        if (err) {
          reject(err);
          return;
        }

        if (response.status.code !== 200) {
          reject(new Error(response.status.message || 'Query failed'));
          return;
        }

        try {
          const result = await this.parseQueryResult(response);
          resolve(result);
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
          reject(new Error(response.status.message || 'Statement execution failed'));
          return;
        }

        resolve();
      });
    });
  }

  async insertTablet(tablet: Tablet): Promise<void> {
    logger.debug(`Inserting tablet for device: ${tablet.deviceId}`);

    const client = this.connection.getClient();
    const sessionId = this.connection.getSessionId();

    // Validate timestamps and convert to BigInt
    const bigIntTimestamps = tablet.timestamps.map(t => {
      if (typeof t !== 'number' || !Number.isFinite(t)) {
        throw new Error(`Invalid timestamp: ${t}`);
      }
      return BigInt(Math.floor(t));
    });

    const req = new ttypes.TSInsertTabletReq({
      sessionId: sessionId,
      prefixPath: tablet.deviceId,
      measurements: tablet.measurements,
      values: this.serializeTabletValues(tablet),
      timestamps: Buffer.from(new BigInt64Array(bigIntTimestamps).buffer),
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

        if (response.code !== 200) {
          reject(new Error(response.message || 'Insert tablet failed'));
          return;
        }

        resolve();
      });
    });
  }

  private serializeTabletValues(tablet: Tablet): Buffer {
    // Serialize tablet values based on data types
    const buffers: Buffer[] = [];

    for (let colIndex = 0; colIndex < tablet.measurements.length; colIndex++) {
      const dataType = tablet.dataTypes[colIndex];
      const columnValues = tablet.values.map((row) => row[colIndex]);

      const buffer = this.serializeColumn(columnValues, dataType);
      buffers.push(buffer);
    }

    return Buffer.concat(buffers);
  }

  private serializeColumn(values: any[], dataType: number): Buffer {
    // TSDataType from Apache TSFile:
    // BOOLEAN(0), INT32(1), INT64(2), FLOAT(3), DOUBLE(4), TEXT(5),
    // VECTOR(6), UNKNOWN(7), TIMESTAMP(8), DATE(9), BLOB(10), STRING(11), OBJECT(12)
    switch (dataType) {
      case 0: // BOOLEAN
        return Buffer.from(values.map((v) => (v ? 1 : 0)));
      case 1: // INT32
        return Buffer.from(new Int32Array(values).buffer);
      case 2: // INT64
        return Buffer.from(new BigInt64Array(values.map(BigInt)).buffer);
      case 3: { // FLOAT
        return Buffer.from(new Float32Array(values).buffer);
      }
      case 4: { // DOUBLE
        return Buffer.from(new Float64Array(values).buffer);
      }
      case 5: // TEXT
      case 11: { // STRING (similar to TEXT)
        const strBuffers = values.map((v) => {
          const str = String(v);
          const len = Buffer.alloc(4);
          len.writeInt32LE(str.length);
          return Buffer.concat([len, Buffer.from(str, 'utf8')]);
        });
        return Buffer.concat(strBuffers);
      }
      case 8: { // TIMESTAMP (stored as INT64 - milliseconds)
        return Buffer.from(new BigInt64Array(values.map(v => {
          if (v instanceof Date) {
            return BigInt(v.getTime());
          }
          return BigInt(v);
        })).buffer);
      }
      case 9: { // DATE (stored as INT32 - days since epoch)
        return Buffer.from(new Int32Array(values.map(v => {
          if (v instanceof Date) {
            return Math.floor(v.getTime() / (24 * 60 * 60 * 1000));
          }
          return v;
        })).buffer);
      }
      case 10: { // BLOB
        const blobBuffers = values.map((v) => {
          const blob = Buffer.isBuffer(v) ? v : Buffer.from(v);
          const len = Buffer.alloc(4);
          len.writeInt32LE(blob.length);
          return Buffer.concat([len, blob]);
        });
        return Buffer.concat(blobBuffers);
      }
      default:
        throw new Error(`Unsupported data type: ${dataType}`);
    }
  }

  private async parseQueryResult(response: any): Promise<QueryResult> {
    const result: QueryResult = {
      columns: response.columns || [],
      dataTypes: response.dataTypeList || [],
      rows: [],
      queryId: response.queryId,
    };

    if (response.queryDataSet) {
      const dataset = response.queryDataSet;
      result.rows = await this.parseDataSet(
        dataset,
        response.columns.length,
        response.dataTypeList
      );
    }

    // Fetch more data if available
    if (response.moreData) {
      const moreRows = await this.fetchResults(response.queryId);
      result.rows.push(...moreRows);
    }

    return result;
  }

  private async fetchResults(queryId: number): Promise<any[][]> {
    const client = this.connection.getClient();
    const sessionId = this.connection.getSessionId();

    const req = new ttypes.TSFetchResultsReq({
      sessionId: sessionId,
      statement: '',
      fetchSize: this.config.fetchSize,
      queryId: queryId,
      isAlign: true,
    });

    return new Promise((resolve, reject) => {
      client.fetchResultsV2(req, async (err: Error, response: any) => {
        if (err) {
          reject(err);
          return;
        }

        if (response.status.code !== 200) {
          reject(new Error(response.status.message || 'Fetch results failed'));
          return;
        }

        const rows = await this.parseDataSet(
          response.queryDataSet,
          response.queryDataSet?.valueList?.length || 0,
          []
        );

        if (response.moreData) {
          const moreRows = await this.fetchResults(queryId);
          resolve([...rows, ...moreRows]);
        } else {
          resolve(rows);
        }
      });
    });
  }

  private async parseDataSet(
    dataset: any,
    _columnCount: number,
    dataTypes: string[]
  ): Promise<any[][]> {
    const rows: any[][] = [];

    if (!dataset) {
      logger.debug('parseDataSet: dataset is null or undefined');
      return rows;
    }

    // Handle case where dataset.time is not a Buffer (might be an array or null)
    if (!dataset.time) {
      logger.debug('parseDataSet: dataset.time is null or undefined');
      return rows;
    }

    logger.debug(`parseDataSet: dataset.time type: ${typeof dataset.time}, isBuffer: ${Buffer.isBuffer(dataset.time)}, length: ${dataset.time.length || 'N/A'}`);
    logger.debug(`parseDataSet: dataset.valueList type: ${typeof dataset.valueList}, isArray: ${Array.isArray(dataset.valueList)}, length: ${dataset.valueList?.length || 'N/A'}`);
    logger.debug(`parseDataSet: dataTypes: ${JSON.stringify(dataTypes)}`);

    // Convert time to Buffer if it's not already
    const timeBuffer = Buffer.isBuffer(dataset.time) ? dataset.time : Buffer.from(dataset.time);
    
    // Validate buffer has sufficient length
    const timeBufferLength = timeBuffer.length;
    if (timeBufferLength === 0 || timeBufferLength % 8 !== 0) {
      logger.warn('Invalid time buffer length:', timeBufferLength);
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
        const bitmap = dataset.bitmapList && dataset.bitmapList[colIndex]
          ? (Buffer.isBuffer(dataset.bitmapList[colIndex]) 
              ? dataset.bitmapList[colIndex] 
              : Buffer.from(dataset.bitmapList[colIndex]))
          : null;
        
        // Get data type - dataTypes might be an array of strings or numbers
        let dataType = 5; // Default to TEXT
        if (dataTypes && dataTypes[colIndex] !== undefined) {
          const typeStr = String(dataTypes[colIndex]).toUpperCase();
          if (typeStr.includes('BOOLEAN')) dataType = 0;
          else if (typeStr.includes('INT32')) dataType = 1;
          else if (typeStr.includes('INT64')) dataType = 2;
          else if (typeStr.includes('FLOAT')) dataType = 3;
          else if (typeStr.includes('DOUBLE')) dataType = 4;
          else if (typeStr.includes('TEXT')) dataType = 5;
          else if (typeStr.includes('TIMESTAMP')) dataType = 8;
          else if (typeStr.includes('DATE')) dataType = 9;
          else if (typeStr.includes('BLOB')) dataType = 10;
          else if (typeStr.includes('STRING')) dataType = 11;
        }
        
        logger.debug(`parseDataSet: column ${colIndex}, dataType = ${dataType}, valueBuffer.length = ${valueBuffer.length}`);
        const columnValues = this.deserializeColumn(valueBuffer, dataType, rowCount, bitmap);
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

  private deserializeColumn(buffer: Buffer, dataType: number, rowCount: number, bitmap: Buffer | null): any[] {
    const values: any[] = [];
    
    try {
      switch (dataType) {
        case 0: { // BOOLEAN
          for (let i = 0; i < rowCount; i++) {
            if (this.isNull(bitmap, i)) {
              values.push(null);
            } else {
              values.push(buffer[i] !== 0);
            }
          }
          break;
        }
        case 1: { // INT32
          const int32Array = new Int32Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.length / 4));
          for (let i = 0; i < rowCount && i < int32Array.length; i++) {
            if (this.isNull(bitmap, i)) {
              values.push(null);
            } else {
              values.push(int32Array[i]);
            }
          }
          break;
        }
        case 2: { // INT64
          const bigInt64Array = new BigInt64Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.length / 8));
          for (let i = 0; i < rowCount && i < bigInt64Array.length; i++) {
            if (this.isNull(bitmap, i)) {
              values.push(null);
            } else {
              values.push(bigInt64Array[i]);
            }
          }
          break;
        }
        case 3: { // FLOAT
          const float32Array = new Float32Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.length / 4));
          for (let i = 0; i < rowCount && i < float32Array.length; i++) {
            if (this.isNull(bitmap, i)) {
              values.push(null);
            } else {
              values.push(float32Array[i]);
            }
          }
          break;
        }
        case 4: { // DOUBLE
          const float64Array = new Float64Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.length / 8));
          for (let i = 0; i < rowCount && i < float64Array.length; i++) {
            if (this.isNull(bitmap, i)) {
              values.push(null);
            } else {
              values.push(float64Array[i]);
            }
          }
          break;
        }
        case 5: // TEXT
        case 11: { // STRING (similar to TEXT)
          let offset = 0;
          for (let i = 0; i < rowCount && offset < buffer.length; i++) {
            if (this.isNull(bitmap, i)) {
              values.push(null);
            } else {
              if (offset + 4 > buffer.length) break;
              const strLength = buffer.readInt32LE(offset);
              offset += 4;
              if (offset + strLength > buffer.length) break;
              const str = buffer.toString('utf8', offset, offset + strLength);
              values.push(str);
              offset += strLength;
            }
          }
          break;
        }
        case 8: { // TIMESTAMP (stored as INT64 - milliseconds)
          const bigInt64Array = new BigInt64Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.length / 8));
          for (let i = 0; i < rowCount && i < bigInt64Array.length; i++) {
            if (this.isNull(bitmap, i)) {
              values.push(null);
            } else {
              // Convert milliseconds to Date object
              const timestamp = Number(bigInt64Array[i]);
              const date = new Date(timestamp);
              values.push(date);
            }
          }
          break;
        }
        case 9: { // DATE (stored as INT32 - days since epoch)
          const int32Array = new Int32Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.length / 4));
          for (let i = 0; i < rowCount && i < int32Array.length; i++) {
            if (this.isNull(bitmap, i)) {
              values.push(null);
            } else {
              // Convert days since epoch to Date object
              const days = int32Array[i];
              const date = new Date(days * 24 * 60 * 60 * 1000);
              values.push(date);
            }
          }
          break;
        }
        case 10: { // BLOB
          let offset = 0;
          for (let i = 0; i < rowCount && offset < buffer.length; i++) {
            if (this.isNull(bitmap, i)) {
              values.push(null);
            } else {
              if (offset + 4 > buffer.length) break;
              const blobLength = buffer.readInt32LE(offset);
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
      logger.error('Error deserializing column:', error);
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
