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

import * as thrift from "thrift";
import { InternalConfig } from "../utils/Config";
import { logger } from "../utils/Logger";

const IClientRPCService = require("../thrift/generated/IClientRPCService");
const ttypes = require("../thrift/generated/client_types");

export class Connection {
  private config: InternalConfig;
  private connection: thrift.Connection | null = null;
  private client: any = null;
  private sessionId: number | null = null;
  private statementId: number | null = null;
  private isConnected: boolean = false;

  constructor(config: InternalConfig) {
    this.config = config;
  }

  async open(): Promise<void> {
    try {
      if (!this.config.host || !this.config.port) {
        throw new Error("Host and port are required for connection");
      }

      const options: any = {
        transport: thrift.TFramedTransport,
        protocol: thrift.TBinaryProtocol,
        path: undefined,
        headers: undefined,
        https: this.config.enableSSL,
        debug: false,
        max_attempts: undefined,
        retry_max_delay: undefined,
        connect_timeout: undefined,
        timeout: undefined,
        ...this.config.sslOptions,
      };

      if (this.config.enableSSL && this.config.sslOptions) {
        this.connection = thrift.createConnection(
          this.config.host,
          this.config.port,
          {
            ...options,
            ...this.config.sslOptions,
          },
        );
      } else {
        this.connection = thrift.createConnection(
          this.config.host,
          this.config.port,
          options,
        );
      }

      this.connection.on("error", (err: Error) => {
        logger.error("Connection error:", err);
        this.isConnected = false;
      });

      this.connection.on("close", () => {
        logger.debug("Connection closed");
        this.isConnected = false;
      });

      // Do not unref the socket; keep the process alive for pending responses

      this.client = thrift.createClient(IClientRPCService, this.connection);

      await this.openSession();
      await this.requestStatementId();
      this.isConnected = true;
    } catch (error) {
      logger.error("Failed to connect:", error);
      throw error;
    }
  }

  private async openSession(): Promise<void> {
    const configuration: Record<string, string> = {};

    // Add sql_dialect to configuration if specified
    if (this.config.sqlDialect) {
      configuration["sql_dialect"] = this.config.sqlDialect;
    } else {
      logger.warn(
        "No sql_dialect specified, IoTDB will use default (tree model)",
      );
    }

    logger.debug(
      `Opening session with configuration: ${JSON.stringify(configuration)}`,
    );

    const openReq = new ttypes.TSOpenSessionReq({
      client_protocol: ttypes.TSProtocolVersion.IOTDB_SERVICE_PROTOCOL_V3,
      username: this.config.username || "root",
      password: this.config.password || "root",
      zoneId: this.config.timezone || "UTC+8",
      configuration: configuration,
    });

    return new Promise((resolve, reject) => {
      // Add timeout for openSession call
      const timeout = setTimeout(() => {
        reject(new Error("openSession timeout after 30 seconds"));
      }, 30000);

      this.client.openSession(openReq, (err: Error, response: any) => {
        clearTimeout(timeout);

        if (err) {
          logger.error(`openSession error: ${err.message}`);
          reject(err);
          return;
        }

        if (response.status.code !== 200) {
          const errorMsg = response.status.message || "Failed to open session";
          logger.error(
            `openSession failed with status ${response.status.code}: ${errorMsg}`,
          );
          reject(new Error(errorMsg));
          return;
        }

        this.sessionId = response.sessionId;
        resolve();
      });
    });
  }

  private async requestStatementId(): Promise<void> {
    if (!this.sessionId) {
      throw new Error("Session not open");
    }

    return new Promise((resolve, reject) => {
      // Add timeout for requestStatementId call
      const timeout = setTimeout(() => {
        reject(new Error("requestStatementId timeout after 30 seconds"));
      }, 30000);

      this.client.requestStatementId(
        this.sessionId,
        (err: Error, statementId: number) => {
          clearTimeout(timeout);

          if (err) {
            logger.error(`requestStatementId error: ${err.message}`);
            reject(err);
            return;
          }

          this.statementId = statementId;
          resolve();
        },
      );
    });
  }

  async close(): Promise<void> {
    if (!this.isConnected && !this.connection) {
      return;
    }

    try {
      // Close session if it's open
      if (this.sessionId) {
        const closeReq = new ttypes.TSCloseSessionReq({
          sessionId: this.sessionId,
        });

        // Use a timeout handle that we can clear
        let timeoutHandle: NodeJS.Timeout | null = null;

        await Promise.race([
          new Promise<void>((resolve, reject) => {
            this.client.closeSession(closeReq, (err: Error, _response: any) => {
              if (timeoutHandle) {
                clearTimeout(timeoutHandle);
                timeoutHandle = null;
              }
              if (err) {
                reject(err);
                return;
              }
              resolve();
            });
          }),
          new Promise<void>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              reject(new Error("Close session timeout"));
            }, 5000);
            // Use unref() so timeout doesn't prevent process exit
            if (
              timeoutHandle &&
              typeof timeoutHandle === "object" &&
              "unref" in timeoutHandle
            ) {
              timeoutHandle.unref();
            }
          }),
        ]).catch((error) => {
          // Clear timeout if it's still active
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
            timeoutHandle = null;
          }
          logger.warn("Error closing session:", error);
        });

        this.sessionId = null;
      }

      this.isConnected = false;

      // Force close the connection
      if (this.connection) {
        // Remove all event listeners to prevent memory leaks
        this.connection.removeAllListeners();

        // Destroy the connection immediately without waiting for graceful close
        if (typeof this.connection.destroy === "function") {
          this.connection.destroy();
        } else {
          this.connection.end();
        }

        this.connection = null;
      }

      this.client = null;

      logger.debug("Connection closed");
    } catch (error) {
      logger.warn("Error closing connection:", error);

      // Force cleanup even if there's an error
      this.sessionId = null;
      this.isConnected = false;
      if (this.connection) {
        this.connection.removeAllListeners();
        if (typeof this.connection.destroy === "function") {
          this.connection.destroy();
        }
        this.connection = null;
      }
      this.client = null;
    }
  }

  getClient(): any {
    if (!this.isConnected || !this.client) {
      throw new Error("Connection is not open");
    }
    return this.client;
  }

  getSessionId(): number {
    if (!this.sessionId) {
      throw new Error("Session is not open");
    }
    return this.sessionId;
  }

  getStatementId(): number {
    if (!this.statementId) {
      throw new Error("Statement ID not available");
    }
    return this.statementId;
  }

  isOpen(): boolean {
    return this.isConnected && this.sessionId !== null;
  }
}
