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
 * Represents a single row of data from a query result
 */
export class RowRecord {
  private timestamp: number;
  private fields: any[];
  private columnNames: string[];
  private columnTypes: string[];
  private columnNameIndexMap: Map<string, number>;

  constructor(
    timestamp: number,
    fields: any[],
    columnNames: string[],
    columnTypes: string[],
    columnNameIndexMap: Map<string, number>
  ) {
    this.timestamp = timestamp;
    this.fields = fields;
    this.columnNames = columnNames;
    this.columnTypes = columnTypes;
    this.columnNameIndexMap = columnNameIndexMap;
  }

  /**
   * Get the timestamp of this row
   */
  getTimestamp(): number {
    return this.timestamp;
  }

  /**
   * Get all field values
   */
  getFields(): any[] {
    return this.fields;
  }

  /**
   * Get column names
   */
  getColumnNames(): string[] {
    return this.columnNames;
  }

  /**
   * Get value by column index
   */
  getValueByIndex(index: number): any {
    if (index < 0 || index >= this.fields.length) {
      throw new Error(`Column index out of range: ${index}`);
    }
    return this.fields[index];
  }

  /**
   * Get value by column name
   */
  getValue(columnName: string): any {
    const index = this.columnNameIndexMap.get(columnName);
    if (index === undefined) {
      throw new Error(`Column not found: ${columnName}`);
    }
    return this.fields[index];
  }

  /**
   * Check if value is null by index
   */
  isNullByIndex(index: number): boolean {
    return this.getValueByIndex(index) === null || this.getValueByIndex(index) === undefined;
  }

  /**
   * Check if value is null by column name
   */
  isNull(columnName: string): boolean {
    return this.getValue(columnName) === null || this.getValue(columnName) === undefined;
  }

  /**
   * Get string value by index
   */
  getStringByIndex(index: number): string {
    const value = this.getValueByIndex(index);
    return value !== null && value !== undefined ? String(value) : '';
  }

  /**
   * Get string value by column name
   */
  getString(columnName: string): string {
    const value = this.getValue(columnName);
    return value !== null && value !== undefined ? String(value) : '';
  }

  /**
   * Get integer value by index
   */
  getIntByIndex(index: number): number {
    return Number(this.getValueByIndex(index));
  }

  /**
   * Get integer value by column name
   */
  getInt(columnName: string): number {
    return Number(this.getValue(columnName));
  }

  /**
   * Get long value by index
   */
  getLongByIndex(index: number): number {
    return Number(this.getValueByIndex(index));
  }

  /**
   * Get long value by column name
   */
  getLong(columnName: string): number {
    return Number(this.getValue(columnName));
  }

  /**
   * Get float value by index
   */
  getFloatByIndex(index: number): number {
    return Number(this.getValueByIndex(index));
  }

  /**
   * Get float value by column name
   */
  getFloat(columnName: string): number {
    return Number(this.getValue(columnName));
  }

  /**
   * Get double value by index
   */
  getDoubleByIndex(index: number): number {
    return Number(this.getValueByIndex(index));
  }

  /**
   * Get double value by column name
   */
  getDouble(columnName: string): number {
    return Number(this.getValue(columnName));
  }

  /**
   * Get boolean value by index
   */
  getBooleanByIndex(index: number): boolean {
    return Boolean(this.getValueByIndex(index));
  }

  /**
   * Get boolean value by column name
   */
  getBoolean(columnName: string): boolean {
    return Boolean(this.getValue(columnName));
  }

  /**
   * Convert row to array (timestamp + fields)
   */
  toArray(): any[] {
    return [this.timestamp, ...this.fields];
  }

  /**
   * Convert row to string representation
   */
  toString(): string {
    return `RowRecord{timestamp=${this.timestamp}, fields=[${this.fields.join(', ')}]}`;
  }
}
