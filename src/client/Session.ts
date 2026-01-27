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
    if (!config.host || !config.port) {
      throw new Error('Host and port are required');
    }
    this.config = { ...DEFAULT_CONFIG, ...config } as Config;
    this.connection = new Connection(this.config);
  }

  async open(): Promise<void> {
    await this.connection.open();
  }

  async close(): Promise<void> {
    await this.connection.close();
  }

  async executeQueryStatement(sql: string): Promise<QueryResult> {
    logger.debug(`Executing query: ${sql}`);

    const client = this.connection.getClient();
    const sessionId = this.connection.getSessionId();
    const statementId = this.connection.getStatementId();

    const req = new ttypes.TSExecuteStatementReq({
      sessionId: sessionId,
      statement: sql,
      statementId: statementId,
      fetchSize: this.config.fetchSize,
      timeout: 0,
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
    // TSDataType: BOOLEAN(0), INT32(1), INT64(2), FLOAT(3), DOUBLE(4), TEXT(5)
    switch (dataType) {
      case 0: // BOOLEAN
        return Buffer.from(values.map((v) => (v ? 1 : 0)));
      case 1: // INT32
        return Buffer.from(new Int32Array(values).buffer);
      case 2: // INT64
        return Buffer.from(new BigInt64Array(values.map(BigInt)).buffer);
      case 3: // FLOAT
        return Buffer.from(new Float32Array(values).buffer);
      case 4: // DOUBLE
        return Buffer.from(new Float64Array(values).buffer);
      case 5: // TEXT
        const strBuffers = values.map((v) => {
          const str = String(v);
          const len = Buffer.alloc(4);
          len.writeInt32LE(str.length);
          return Buffer.concat([len, Buffer.from(str, 'utf8')]);
        });
        return Buffer.concat(strBuffers);
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
    columnCount: number,
    dataTypes: string[]
  ): Promise<any[][]> {
    const rows: any[][] = [];

    if (!dataset || !dataset.time || !Buffer.isBuffer(dataset.time)) {
      return rows;
    }

    // Validate buffer has sufficient length
    const timeBufferLength = dataset.time.length;
    if (timeBufferLength === 0 || timeBufferLength % 8 !== 0) {
      logger.warn('Invalid time buffer length:', timeBufferLength);
      return rows;
    }

    const rowCount = Math.floor(timeBufferLength / 8);

    for (let i = 0; i < rowCount; i++) {
      const row: any[] = [];
      // Add timestamp with bounds checking
      if (i * 8 + 8 <= timeBufferLength) {
        row.push(dataset.time.readBigInt64LE(i * 8));
      }

      // Add values (simplified - actual implementation would parse based on type)
      for (let j = 0; j < dataset.valueList.length; j++) {
        row.push(null); // Placeholder
      }

      rows.push(row);
    }

    return rows;
  }

  isOpen(): boolean {
    return this.connection.isOpen();
  }
}
