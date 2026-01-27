/**
 * Basic Session Example
 * 
 * This example demonstrates how to use a single Session to connect to IoTDB,
 * execute queries, and insert data.
 */

import { Session } from '../src';

async function main() {
  // Create a session
  const session = new Session({
    host: 'localhost',
    port: 6667,
    username: 'root',
    password: 'root',
  });

  try {
    // Open the session
    console.log('Opening session...');
    await session.open();
    console.log('Session opened successfully');

    // Create a database
    console.log('\nCreating database...');
    await session.executeNonQueryStatement('CREATE DATABASE root.example');
    console.log('Database created');

    // Create timeseries
    console.log('\nCreating timeseries...');
    await session.executeNonQueryStatement(
      'CREATE TIMESERIES root.example.device1.temperature WITH DATATYPE=FLOAT, ENCODING=RLE'
    );
    await session.executeNonQueryStatement(
      'CREATE TIMESERIES root.example.device1.humidity WITH DATATYPE=FLOAT, ENCODING=RLE'
    );
    console.log('Timeseries created');

    // Insert tablet data
    console.log('\nInserting tablet data...');
    await session.insertTablet({
      deviceId: 'root.example.device1',
      measurements: ['temperature', 'humidity'],
      dataTypes: [3, 3], // FLOAT
      timestamps: [
        Date.now(),
        Date.now() + 1000,
        Date.now() + 2000,
      ],
      values: [
        [25.5, 60.0],
        [26.0, 61.5],
        [26.5, 62.0],
      ],
    });
    console.log('Tablet data inserted');

    // Query data
    console.log('\nQuerying data...');
    const result = await session.executeQueryStatement(
      'SELECT * FROM root.example.device1'
    );
    console.log('Columns:', result.columns);
    console.log('Data types:', result.dataTypes);
    console.log('Number of rows:', result.rows.length);

    // Show databases
    console.log('\nShowing databases...');
    const dbResult = await session.executeQueryStatement('SHOW DATABASES');
    console.log('Databases:', dbResult.rows);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Close the session
    console.log('\nClosing session...');
    await session.close();
    console.log('Session closed');
  }
}

main().catch(console.error);
