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

import { Session } from "./Session";
import { logger } from "../utils/Logger";

/**
 * TableSession extends Session for table model operations
 * Inherits all functionality from Session including insertTablet
 * which handles both TreeTablet and TableTablet formats
 *
 * Overrides executeNonQueryStatement to track database context changes
 * similar to Java Session implementation
 */
export class TableSession extends Session {
  private currentDatabase?: string;

  /**
   * Execute non-query statement with database context tracking
   * Similar to Java Session implementation:
   * - Tracks database changes from USE statements
   * - Logs warnings for context switches (simplified version)
   *
   * @param sql - SQL statement to execute
   */
  async executeNonQueryStatement(sql: string): Promise<void> {
    const previousDatabase = this.currentDatabase;

    // Execute the statement using parent implementation
    await super.executeNonQueryStatement(sql);

    // Track database context changes from USE statements
    // IoTDB database names can include letters, digits, underscores, dots, and hyphens
    const usePattern = /^\s*USE\s+([a-zA-Z0-9_.-]+)\s*;?\s*$/i;
    const match = sql.match(usePattern);
    if (match) {
      this.currentDatabase = match[1];
      logger.debug(
        `Database context changed from ${previousDatabase || "none"} to ${this.currentDatabase}`,
      );
    }
  }
}

export type { TableTablet, ColumnCategory } from "./Session";
