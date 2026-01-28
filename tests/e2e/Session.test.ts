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

import { Session } from "../../src/client/Session";
import { TSDataType } from "../../src/utils/DataTypes";

describe("Session E2E Tests", () => {
  const IOTDB_HOST = process.env.IOTDB_HOST || "localhost";
  const IOTDB_PORT = parseInt(process.env.IOTDB_PORT || "6667");
  const IOTDB_USER = process.env.IOTDB_USER || "root";
  const IOTDB_PASSWORD = process.env.IOTDB_PASSWORD || "root";

  let session: Session;

  beforeAll(async () => {
    session = new Session({
      host: IOTDB_HOST,
      port: IOTDB_PORT,
      username: IOTDB_USER,
      password: IOTDB_PASSWORD,
    });

    try {
      await session.open();
    } catch (error) {
      console.warn("Could not connect to IoTDB. E2E tests will be skipped.");
      console.warn(
        "Set IOTDB_HOST, IOTDB_PORT to run E2E tests against a real instance.",
      );
    }
  }, 60000); // 30 second timeout for connection

  afterAll(async () => {
    if (session && session.isOpen()) {
      // Cleanup test data
      try {
        await session.executeNonQueryStatement("DROP DATABASE root.test");
      } catch (e) {
        // Ignore cleanup errors
      }
      await session.close();
    }
  }, 60000);

  test("Should open and close session", async () => {
    if (!session.isOpen()) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    expect(session.isOpen()).toBe(true);
  }, 60000);

  test("Should create database and timeseries (tree model)", async () => {
    if (!session.isOpen()) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    // Create database (storage group) - ignore if already exists
    try {
      await session.executeNonQueryStatement("CREATE DATABASE root.test");
    } catch (e: any) {
      if (!e.message?.includes("already")) {
        throw e;
      }
    }

    // Create timeseries - handle if they already exist
    try {
      await session.executeNonQueryStatement(
        "CREATE TIMESERIES root.test.device1.status WITH DATATYPE=BOOLEAN, ENCODING=PLAIN",
      );
    } catch (e: any) {
      // IoTDB returns "already exist" (without 's')
      if (!e.message?.includes("already exist")) {
        throw e;
      }
    }

    try {
      await session.executeNonQueryStatement(
        "CREATE TIMESERIES root.test.device1.temperature WITH DATATYPE=FLOAT, ENCODING=RLE",
      );
    } catch (e: any) {
      // IoTDB returns "already exist" (without 's')
      if (!e.message?.includes("already exist")) {
        throw e;
      }
    }

    // Verify timeseries created
    const result = await session.executeQueryStatement(
      "SHOW TIMESERIES root.test.**",
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(2);
  }, 60000);

  test("Should execute query statement (SHOW DATABASES)", async () => {
    if (!session.isOpen()) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    const result = await session.executeQueryStatement("SHOW DATABASES");

    expect(result).toBeDefined();
    expect(result.columns).toBeDefined();
    expect(Array.isArray(result.columns)).toBe(true);
    expect(result.rows).toBeDefined();
    expect(Array.isArray(result.rows)).toBe(true);
  }, 60000);

  test("Should insert and query data (tree model)", async () => {
    if (!session.isOpen()) {
      console.log("Skipping test - no IoTDB connection");
      return;
    }

    const now = Date.now();

    // Insert tablet data
    const tablet = {
      deviceId: "root.test.device1",
      measurements: ["status", "temperature"],
      dataTypes: [TSDataType.BOOLEAN, TSDataType.FLOAT],
      timestamps: [now, now + 1, now + 2],
      values: [
        [true, 20.5],
        [false, 21.0],
        [true, 21.5],
      ],
    };

    await session.insertTablet(tablet);

    // Query the data
    const result = await session.executeQueryStatement(
      "SELECT status, temperature FROM root.test.device1 LIMIT 5",
    );

    expect(result).toBeDefined();
    expect(result.columns).toBeDefined();
    expect(result.rows.length).toBeGreaterThan(0);
  }, 60000);
});
