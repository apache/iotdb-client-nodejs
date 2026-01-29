/**
 * Basic Session Example
 *
 * This example demonstrates how to use a single Session to connect to IoTDB,
 * execute queries, and insert data. Shows both traditional and Builder pattern approaches.
 */

import { Session, ConfigBuilder, TSDataType } from "../src";

async function main() {
  console.log("=== Basic Session Example ===\n");

  // Method 1: Traditional constructor (backward compatible)
  console.log("Method 1: Traditional constructor");
  const session1 = new Session({
    host: "localhost",
    port: 6667,
    username: "root",
    password: "root",
  });

  // Method 2: Using Builder pattern (recommended)
  console.log("Method 2: Using Builder pattern");
  const session2 = new Session(
    new ConfigBuilder()
      .host("localhost")
      .port(6667)
      .username("root")
      .password("root")
      .fetchSize(1024)
      .build(),
  );

  // For demo purposes, we'll use session1
  const session = session1;

  try {
    // Open the session
    console.log("\nOpening session...");
    await session.open();
    console.log("Session opened successfully");

    // Create a database
    console.log("\nCreating database...");
    await session.executeNonQueryStatement("CREATE DATABASE root.example");
    console.log("Database created");

    // Create timeseries
    console.log("\nCreating timeseries...");
    await session.executeNonQueryStatement(
      "CREATE TIMESERIES root.example.device1.temperature WITH DATATYPE=FLOAT, ENCODING=RLE",
    );
    await session.executeNonQueryStatement(
      "CREATE TIMESERIES root.example.device1.humidity WITH DATATYPE=FLOAT, ENCODING=RLE",
    );
    console.log("Timeseries created");

    // Insert tablet data
    console.log("\nInserting tablet data...");
    await session.insertTablet({
      deviceId: "root.example.device1",
      measurements: ["temperature", "humidity"],
      dataTypes: [TSDataType.FLOAT, TSDataType.FLOAT],
      timestamps: [Date.now(), Date.now() + 1000, Date.now() + 2000],
      values: [
        [25.5, 60.0],
        [26.0, 61.5],
        [26.5, 62.0],
      ],
    });
    console.log("Tablet data inserted");

    // Query data using SessionDataSet iterator pattern
    console.log("\nQuerying data...");
    const dataSet = await session.executeQueryStatement(
      "SELECT * FROM root.example.device1",
    );
    console.log("Columns:", dataSet.getColumnNames());
    
    let rowCount = 0;
    while (await dataSet.hasNext()) {
      const row = dataSet.next();
      rowCount++;
      console.log(`Row ${rowCount}:`, row.getTimestamp(), row.getFields());
    }
    await dataSet.close();
    console.log("Total rows:", rowCount);

    // Show databases
    console.log("\nShowing databases...");
    const dbDataSet = await session.executeQueryStatement("SHOW DATABASES");
    const databases = [];
    while (await dbDataSet.hasNext()) {
      databases.push(dbDataSet.next().getFields());
    }
    await dbDataSet.close();
    console.log("Databases:", databases);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    // Close the session
    console.log("\nClosing session...");
    await session.close();
    console.log("Session closed");
  }
}

main().catch(console.error);
