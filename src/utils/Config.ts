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

export interface Config {
  host: string;
  port: number;
  username?: string;
  password?: string;
  database?: string;
  timezone?: string;
  fetchSize?: number;
  enableSSL?: boolean;
  sslOptions?: SSLOptions;
}

export interface SSLOptions {
  ca?: Buffer;
  cert?: Buffer;
  key?: Buffer;
  rejectUnauthorized?: boolean;
}

export interface PoolConfig extends Config {
  maxPoolSize?: number;
  minPoolSize?: number;
  maxIdleTime?: number;
  waitTimeout?: number;
}

export interface EndPoint {
  host: string;
  port: number;
}

export const DEFAULT_CONFIG = {
  port: 6667,
  username: 'root',
  password: 'root',
  fetchSize: 1024,
  enableSSL: false,
  maxPoolSize: 10,
  minPoolSize: 1,
  maxIdleTime: 60000, // 60 seconds
  waitTimeout: 60000, // 60 seconds
};
