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

import { RowRecord } from "./RowRecord";
import { Session } from "./Session";
import { logger } from "../utils/Logger";

const ttypes = require("../thrift/generated/client_types");

/**
 * SessionDataSet represents a query result set with iterator pattern.
 * It provides lazy loading of query results to handle large datasets efficiently.
 *
 * Usage:
 * ```typescript
 * const dataSet = await session.executeQuery('SELECT * FROM root.test');
 * while (await dataSet.hasNext()) {
 *   const row = dataSet.next();
 *   console.log(row.getTimestamp(), row.getFields());
 * }
 * await dataSet.close();
 * ```
 */
export class SessionDataSet {
  private session: Session;
  private queryId: number;
  private statementId: number;
  private sql: string;
  private columnNames: string[];
  private columnTypes: string[];
  private columnNameIndexMap: Map<string, number>;
  private columnIndex2TsBlockColumnIndexList: number[];
  private fetchSize: number;
  private sessionId: number;
  private ignoreTimeStamp: boolean;

  // Current batch state
  private currentRows: any[][] = [];
  private currentRowIndex: number = 0;
  private hasMoreData: boolean = false;
  private isClosed: boolean = false;
  private hasCachedRow: boolean = false;

  // Cleanup callback for session pool
  private cleanupCallback?: () => void;

  constructor(
    session: Session,
    queryId: number,
    statementId: number,
    sql: string,
    columnNames: string[],
    columnTypes: string[],
    initialRows: any[][],
    hasMoreData: boolean,
    fetchSize: number,
    sessionId: number,
    ignoreTimeStamp: boolean = false,
    columnIndex2TsBlockColumnIndexList?: number[],
  ) {
    this.session = session;
    this.queryId = queryId;
    this.statementId = statementId;
    this.sql = sql;
    this.columnNames = columnNames;
    this.columnTypes = columnTypes;
    this.fetchSize = fetchSize;
    this.sessionId = sessionId;
    this.ignoreTimeStamp = ignoreTimeStamp;
    this.hasMoreData = hasMoreData;
    this.currentRows = initialRows;

    // Build column name to TsBlock column index map
    // columnIndex2TsBlockColumnIndexList maps metadata column index to TsBlock column index
    if (
      columnIndex2TsBlockColumnIndexList &&
      columnIndex2TsBlockColumnIndexList.length > 0
    ) {
      // Use server-provided mapping
      logger.debug(
        `Using columnIndex2TsBlockColumnIndexList: ${JSON.stringify(columnIndex2TsBlockColumnIndexList)}`,
      );
      this.columnIndex2TsBlockColumnIndexList =
        columnIndex2TsBlockColumnIndexList;
      this.columnNameIndexMap = new Map();
      for (let i = 0; i < columnNames.length; i++) {
        const tsBlockColumnIndex = columnIndex2TsBlockColumnIndexList[i];
        const fullName = columnNames[i];
        this.columnNameIndexMap.set(fullName, tsBlockColumnIndex);
        logger.debug(
          `Column mapping: ${fullName} -> TsBlock index ${tsBlockColumnIndex}`,
        );
      }
    } else {
      // Fallback: assume 1:1 mapping (old behavior for compatibility)
      logger.debug(
        "No columnIndex2TsBlockColumnIndexList provided, using 1:1 mapping",
      );
      this.columnIndex2TsBlockColumnIndexList = Array.from(
        { length: columnNames.length },
        (_, i) => i,
      );
      this.columnNameIndexMap = new Map();
      for (let i = 0; i < columnNames.length; i++) {
        this.columnNameIndexMap.set(columnNames[i], i);
      }
    }
  }

  /**
   * Set cleanup callback to be called when dataset is closed.
   * Used by SessionPool to release the session back to the pool.
   */
  setCleanupCallback(callback: () => void): void {
    this.cleanupCallback = callback;
  }

  /**
   * Get column names
   */
  getColumnNames(): string[] {
    return [...this.columnNames];
  }

  /**
   * Get column types
   */
  getColumnTypes(): string[] {
    return [...this.columnTypes];
  }

  /**
   * Find column index by name
   */
  findColumn(columnName: string): number {
    const index = this.columnNameIndexMap.get(columnName);
    if (index === undefined) {
      throw new Error(`Column not found: ${columnName}`);
    }
    return index;
  }

  /**
   * Check if there are more rows available.
   * This may trigger fetching more data from the server.
   */
  async hasNext(): Promise<boolean> {
    if (this.isClosed) {
      return false;
    }

    // Check if we have rows in current batch
    if (this.currentRowIndex < this.currentRows.length) {
      return true;
    }

    // If no more data to fetch, we're done
    if (!this.hasMoreData) {
      await this.close();
      return false;
    }

    // Fetch next batch
    try {
      const result = await this.fetchNextBatch();
      return result;
    } catch (error) {
      logger.error(`Error fetching next batch: ${error}`);
      await this.close();
      throw error;
    }
  }

  /**
   * Get the next row record.
   * Must call hasNext() first to check availability.
   */
  next(): RowRecord {
    if (this.isClosed) {
      throw new Error("SessionDataSet is closed");
    }

    if (this.currentRowIndex >= this.currentRows.length) {
      throw new Error("No more rows available. Call hasNext() first.");
    }

    const row = this.currentRows[this.currentRowIndex];
    this.currentRowIndex++;

    // Debug: log row structure
    logger.debug(
      `SessionDataSet.next(): row.length=${row.length}, ignoreTimeStamp=${this.ignoreTimeStamp}`,
    );
    logger.debug(`SessionDataSet.next(): row content:`, row);

    // Parse row based on whether timestamp is present
    let timestamp: number;
    let fields: any[];

    if (this.ignoreTimeStamp) {
      // For aggregation queries: row = [field1, field2, ...]
      // Use 0 as placeholder timestamp
      timestamp = 0;
      fields = row;
    } else {
      // For normal queries: row = [timestamp, field1, field2, ...]
      timestamp = Number(row[0]);
      fields = row.slice(1);
    }

    logger.debug(
      `SessionDataSet.next(): timestamp=${timestamp}, fields.length=${fields.length}`,
    );

    return new RowRecord(
      timestamp,
      fields,
      this.columnNames,
      this.columnTypes,
      this.columnNameIndexMap,
    );
  }

  /**
   * Fetch the next batch of rows from the server
   */
  private async fetchNextBatch(): Promise<boolean> {
    const client = (this.session as any).connection.getClient();

    const req = new ttypes.TSFetchResultsReq({
      sessionId: this.sessionId,
      statement: this.sql,
      fetchSize: this.fetchSize,
      queryId: this.queryId,
      isAlign: true,
    });

    return new Promise((resolve, reject) => {
      client.fetchResultsV2(req, async (err: Error, response: any) => {
        if (err) {
          reject(err);
          return;
        }

        if (response.status.code !== 200) {
          reject(new Error(response.status.message || "Fetch results failed"));
          return;
        }

        try {
          let rows: any[][];

          // Handle both queryDataSet and queryResult formats
          if (response.queryResult && response.queryResult.length > 0) {
            // New TsBlock format (queryResult is Buffer[])
            rows = await (this.session as any).parseQueryResult(
              response.queryResult,
              this.columnNames.length,
              this.columnTypes,
              this.ignoreTimeStamp,
            );
          } else if (response.queryDataSet) {
            // Old columnar format (TSQueryDataSet)
            rows = await (this.session as any).parseDataSet(
              response.queryDataSet,
              this.columnNames.length,
              this.columnTypes,
            );
          } else {
            // No data in response
            rows = [];
          }

          this.currentRows = rows;
          this.currentRowIndex = 0;
          this.hasMoreData = response.moreData || false;

          resolve(rows.length > 0);
        } catch (parseError) {
          reject(parseError);
        }
      });
    });
  }

  /**
   * Close the dataset and release resources on the server
   */
  async close(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;

    try {
      const client = (this.session as any).connection.getClient();
      const req = new ttypes.TSCloseOperationReq({
        sessionId: this.sessionId,
        queryId: this.queryId,
        statementId: this.statementId,
      });

      await new Promise<void>((resolve, reject) => {
        client.closeOperation(req, (err: Error, response: any) => {
          if (err) {
            logger.warn(`Error closing query operation: ${err.message}`);
            // Don't reject, just log the warning
            resolve();
            return;
          }

          if (response && response.status && response.status.code !== 200) {
            logger.warn(
              `Close operation returned non-200 status: ${response.status.message}`,
            );
          }

          resolve();
        });
      });
    } catch (error) {
      logger.warn(`Error in close operation: ${error}`);
    } finally {
      // Call cleanup callback if set (e.g., to release session back to pool)
      if (this.cleanupCallback) {
        try {
          this.cleanupCallback();
        } catch (callbackError) {
          logger.warn(`Error in cleanup callback: ${callbackError}`);
        }
      }
    }
  }

  /**
   * Convert all remaining rows to an array.
   * WARNING: This loads all data into memory. Use with caution for large result sets.
   * @deprecated Use iterator pattern (hasNext/next) instead for better memory efficiency
   */
  async toArray(): Promise<any[][]> {
    const allRows: any[][] = [];

    while (await this.hasNext()) {
      const row = this.next();
      allRows.push(row.toArray());
    }

    return allRows;
  }

  /**
   * Check if the dataset is closed
   */
  isClosed_(): boolean {
    return this.isClosed;
  }
}
