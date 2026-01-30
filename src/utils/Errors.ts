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

import { EndPoint } from "./Config";

/**
 * Represents a redirect recommendation from the server.
 * Thrown when the server suggests a better endpoint for a device.
 */
export class RedirectException extends Error {
  public readonly endpoint: EndPoint;
  public readonly deviceId: string;

  constructor(deviceId: string, endpoint: EndPoint, message?: string) {
    super(
      message ||
        `Redirect recommended for device ${deviceId} to ${endpoint.host}:${endpoint.port}`,
    );
    this.name = "RedirectException";
    this.deviceId = deviceId;
    this.endpoint = endpoint;
  }

  /**
   * Create RedirectException from Thrift status response
   * @param status - Thrift status object
   * @param deviceId - Device ID being inserted
   * @returns RedirectException or null if not a redirect status
   */
  static fromThriftStatus(
    status: any,
    deviceId: string,
  ): RedirectException | null {
    // Check for REDIRECTION_RECOMMEND status code (400 in Java client)
    // AND check if redirectNode is set in the response
    if (status.code === 400 && status.redirectNode) {
      return new RedirectException(
        deviceId,
        {
          host: status.redirectNode.internalIp || status.redirectNode.ip,
          port: status.redirectNode.port,
        },
        status.message,
      );
    }
    return null;
  }
}

/**
 * TSStatus codes from Apache IoTDB
 * Reference: org.apache.iotdb.rpc.TSStatusCode
 * https://github.com/apache/iotdb/blob/master/iotdb-client/service-rpc/src/main/java/org/apache/iotdb/rpc/TSStatusCode.java
 */
export enum TSStatusCode {
  SUCCESS_STATUS = 200,
  STILL_EXECUTING_STATUS = 201,
  INVALID_HANDLE_STATUS = 202,
  INCOMPATIBLE_VERSION = 203,

  // Client status codes
  REDIRECTION_RECOMMEND = 400,

  // Error codes
  INTERNAL_SERVER_ERROR = 500,
  UNSUPPORTED_OPERATION = 501,
  ILLEGAL_PARAMETER = 600,
  // ... other codes can be added as needed
}
