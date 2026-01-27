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

import * as thrift from 'thrift';
import * as tls from 'tls';
import { Config } from '../utils/Config';
import { logger } from '../utils/Logger';

const IClientRPCService = require('../thrift/generated/IClientRPCService');
const ttypes = require('../thrift/generated/client_types');

export class Connection {
  private config: Config;
  private connection: thrift.Connection | null = null;
  private client: any = null;
  private sessionId: number | null = null;
  private isConnected: boolean = false;

  constructor(config: Config) {
    this.config = config;
  }

  async open(): Promise<void> {
    try {
      logger.debug(`Connecting to ${this.config.host}:${this.config.port}`);

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
          }
        );
      } else {
        this.connection = thrift.createConnection(
          this.config.host,
          this.config.port,
          options
        );
      }

      this.connection.on('error', (err: Error) => {
        logger.error('Connection error:', err);
        this.isConnected = false;
      });

      this.connection.on('close', () => {
        logger.debug('Connection closed');
        this.isConnected = false;
      });

      this.client = thrift.createClient(IClientRPCService, this.connection);

      await this.openSession();
      this.isConnected = true;
      logger.info('Connected successfully');
    } catch (error) {
      logger.error('Failed to connect:', error);
      throw error;
    }
  }

  private async openSession(): Promise<void> {
    const openReq = new ttypes.TSOpenSessionReq({
      client_protocol: ttypes.TSProtocolVersion.IOTDB_SERVICE_PROTOCOL_V3,
      username: this.config.username || 'root',
      password: this.config.password || 'root',
      zoneId: this.config.timezone || 'UTC+8',
      configuration: {},
    });

    return new Promise((resolve, reject) => {
      this.client.openSession(openReq, (err: Error, response: any) => {
        if (err) {
          reject(err);
          return;
        }

        if (response.status.code !== 200) {
          reject(new Error(response.status.message || 'Failed to open session'));
          return;
        }

        this.sessionId = response.sessionId;
        logger.debug(`Session opened: ${this.sessionId}`);
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    if (!this.isConnected || !this.sessionId) {
      return;
    }

    try {
      const closeReq = new ttypes.TSCloseSessionReq({
        sessionId: this.sessionId,
      });

      await new Promise<void>((resolve, reject) => {
        this.client.closeSession(closeReq, (err: Error, response: any) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });

      this.sessionId = null;
      this.isConnected = false;

      if (this.connection) {
        this.connection.end();
        this.connection = null;
      }

      logger.debug('Connection closed');
    } catch (error) {
      logger.warn('Error closing connection:', error);
      // Don't rethrow - closing is best effort
    }
  }

  getClient(): any {
    if (!this.isConnected || !this.client) {
      throw new Error('Connection is not open');
    }
    return this.client;
  }

  getSessionId(): number {
    if (!this.sessionId) {
      throw new Error('Session is not open');
    }
    return this.sessionId;
  }

  isOpen(): boolean {
    return this.isConnected && this.sessionId !== null;
  }
}
