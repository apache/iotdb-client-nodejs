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

jest.mock("thrift", () => {
  const actualThrift = jest.requireActual("thrift");

  const mockConnection = {
    on: jest.fn(),
    removeAllListeners: jest.fn(),
    destroy: jest.fn(),
    end: jest.fn(),
  };

  return {
    ...actualThrift,
    __mockConnection: mockConnection,
    createConnection: jest.fn(() => mockConnection),
    createSSLConnection: jest.fn(() => mockConnection),
    createClient: jest.fn(() => ({
      openSession: jest.fn((_req, callback) =>
        callback(null, { status: { code: 200 }, sessionId: 123 }),
      ),
      requestStatementId: jest.fn((_sessionId, callback) =>
        callback(null, 456),
      ),
      closeSession: jest.fn((_req, callback) =>
        callback(null, { status: { code: 200 } }),
      ),
    })),
  };
});

import * as thrift from "thrift";
import { Connection } from "../../src/connection/Connection";
import { InternalConfig } from "../../src/utils/Config";

const thriftMock = thrift as typeof thrift & {
  __mockConnection: {
    on: jest.Mock;
    removeAllListeners: jest.Mock;
    destroy: jest.Mock;
    end: jest.Mock;
  };
  createConnection: jest.Mock;
  createSSLConnection: jest.Mock;
  createClient: jest.Mock;
};

describe("Connection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("Should use SSL connection when SSL is enabled", async () => {
    const ca = Buffer.from("ca");
    const config: InternalConfig = {
      host: "localhost",
      port: 6667,
      username: "root",
      password: "root",
      enableSSL: true,
      sqlDialect: "tree",
      sslOptions: {
        ca,
        rejectUnauthorized: true,
      },
    };

    const connection = new Connection(config);

    await connection.open();

    expect(thriftMock.createSSLConnection).toHaveBeenCalledWith(
      "localhost",
      6667,
      expect.objectContaining({
        ca,
        rejectUnauthorized: true,
        https: true,
        protocol: thrift.TBinaryProtocol,
        transport: thrift.TFramedTransport,
      }),
    );
    expect(thriftMock.createConnection).not.toHaveBeenCalled();

    await connection.close();
  });

  test("Should use plain connection when SSL is disabled", async () => {
    const config: InternalConfig = {
      host: "localhost",
      port: 6667,
      username: "root",
      password: "root",
      enableSSL: false,
      sqlDialect: "tree",
    };

    const connection = new Connection(config);

    await connection.open();

    expect(thriftMock.createConnection).toHaveBeenCalledWith(
      "localhost",
      6667,
      expect.objectContaining({
        https: false,
        protocol: thrift.TBinaryProtocol,
        transport: thrift.TFramedTransport,
      }),
    );
    expect(thriftMock.createSSLConnection).not.toHaveBeenCalled();

    await connection.close();
  });

  test("Should not create another connection when open is called repeatedly", async () => {
    const config: InternalConfig = {
      host: "localhost",
      port: 6667,
      username: "root",
      password: "root",
      enableSSL: false,
      sqlDialect: "tree",
    };
    const connection = new Connection(config);

    await connection.open();
    await connection.open();

    expect(thriftMock.createConnection).toHaveBeenCalledTimes(1);
    expect(thriftMock.createClient).toHaveBeenCalledTimes(1);

    await connection.close();
  });

  test("Should share the connection attempt between concurrent open calls", async () => {
    let completeOpenSession!: (error: Error | null, response: unknown) => void;
    const openSession = jest.fn(
      (
        _req: unknown,
        callback: (error: Error | null, response: unknown) => void,
      ) => {
        completeOpenSession = callback;
      },
    );
    const requestStatementId = jest.fn(
      (
        _sessionId: unknown,
        callback: (error: Error | null, statementId: number) => void,
      ) => callback(null, 456),
    );
    const closeSession = jest.fn(
      (
        _req: unknown,
        callback: (error: Error | null, response: unknown) => void,
      ) => callback(null, { status: { code: 200 } }),
    );
    thriftMock.createClient.mockReturnValueOnce({
      openSession,
      requestStatementId,
      closeSession,
    });

    const connection = new Connection({
      host: "localhost",
      port: 6667,
      username: "root",
      password: "root",
      enableSSL: false,
      sqlDialect: "tree",
    });

    const firstOpen = connection.open();
    const secondOpen = connection.open();

    expect(thriftMock.createConnection).toHaveBeenCalledTimes(1);
    expect(openSession).toHaveBeenCalledTimes(1);

    completeOpenSession(null, { status: { code: 200 }, sessionId: 123 });
    await Promise.all([firstOpen, secondOpen]);

    expect(requestStatementId).toHaveBeenCalledTimes(1);
    expect(connection.isOpen()).toBe(true);

    await connection.close();
  });

  test("Should tear down the socket when session setup fails", async () => {
    // openSession rejects after the TCP connection was established.
    thriftMock.createClient.mockReturnValueOnce({
      openSession: jest.fn((_req: unknown, callback: (e: Error | null, r: unknown) => void) =>
        callback(new Error("auth failed"), null),
      ),
      requestStatementId: jest.fn((_sid: unknown, callback: (e: Error | null, r: unknown) => void) =>
        callback(null, 456),
      ),
      closeSession: jest.fn((_req: unknown, callback: (e: Error | null, r: unknown) => void) =>
        callback(null, { status: { code: 200 } }),
      ),
    });

    const config: InternalConfig = {
      host: "localhost",
      port: 6667,
      username: "root",
      password: "bad",
      enableSSL: false,
      sqlDialect: "tree",
    };
    const connection = new Connection(config);

    // The original setup error must surface, not be masked by the teardown.
    await expect(connection.open()).rejects.toThrow("auth failed");

    // The half-open connection must be torn down (mirrors close()); the buggy
    // catch only logged + rethrew, leaking the socket and its listeners.
    expect(thriftMock.__mockConnection.removeAllListeners).toHaveBeenCalled();
    expect(thriftMock.__mockConnection.destroy).toHaveBeenCalled();
  });

  test("Should clear sessionId when statement setup fails after openSession", async () => {
    // openSession succeeds (sets sessionId), then requestStatementId rejects.
    thriftMock.createClient.mockReturnValueOnce({
      openSession: jest.fn((_req: unknown, callback: (e: Error | null, r: unknown) => void) =>
        callback(null, { status: { code: 200 }, sessionId: 123 }),
      ),
      requestStatementId: jest.fn((_sid: unknown, callback: (e: Error | null, r: unknown) => void) =>
        callback(new Error("statement setup failed"), null),
      ),
      closeSession: jest.fn((_req: unknown, callback: (e: Error | null, r: unknown) => void) =>
        callback(null, { status: { code: 200 } }),
      ),
    });

    const config: InternalConfig = {
      host: "localhost",
      port: 6667,
      username: "root",
      password: "root",
      enableSSL: false,
      sqlDialect: "tree",
    };
    const connection = new Connection(config);

    await expect(connection.open()).rejects.toThrow("statement setup failed");

    // The failed setup must not leave a stale sessionId reachable (mirrors
    // close()); getSessionId() throws once the id is cleared.
    expect(() => connection.getSessionId()).toThrow("Session is not open");
  });

  test("Should allow open to be retried after a failed attempt", async () => {
    thriftMock.createClient.mockReturnValueOnce({
      openSession: jest.fn(
        (
          _req: unknown,
          callback: (error: Error | null, response: unknown) => void,
        ) => callback(new Error("temporary failure"), null),
      ),
      requestStatementId: jest.fn(),
      closeSession: jest.fn(),
    });

    const connection = new Connection({
      host: "localhost",
      port: 6667,
      username: "root",
      password: "root",
      enableSSL: false,
      sqlDialect: "tree",
    });

    await expect(connection.open()).rejects.toThrow("temporary failure");
    await connection.open();

    expect(thriftMock.createConnection).toHaveBeenCalledTimes(2);
    expect(connection.isOpen()).toBe(true);

    await connection.close();
  });
});
