/**
 * TableSessionPool Example
 * 
 * This example demonstrates how to use TableSessionPool for table model
 * operations in IoTDB.
 */

import { TableSessionPool } from '../src';

async function main() {
  // Create a table session pool
  const pool = new TableSessionPool('localhost', 6667, {
    username: 'root',
    password: 'root',
    database: 'my_database', // Set default database
    maxPoolSize: 10,
    minPoolSize: 2,
  });

  try {
    // Initialize the pool
    console.log('Initializing table session pool...');
    await pool.init();
    console.log('Table pool initialized with', pool.getPoolSize(), 'connections');

    // Create database if not exists
    console.log('\nSetting up database...');
    await pool.executeNonQueryStatement('CREATE DATABASE IF NOT EXISTS root.table_example');

    // Execute queries in table mode
    console.log('\nExecuting table queries...');
    const result = await pool.executeQueryStatement('SHOW DATABASES');
    console.log('Databases found:', result.rows.length);

    // Insert data
    console.log('\nInserting data...');
    await pool.insertTablet({
      deviceId: 'root.table_example.table1',
      measurements: ['column1', 'column2'],
      dataTypes: [1, 3], // INT32, FLOAT
      timestamps: [Date.now()],
      values: [[100, 25.5]],
    });
    console.log('Data inserted');

    // Pool statistics
    console.log('\nTable pool statistics:');
    console.log('Total connections:', pool.getPoolSize());
    console.log('Available connections:', pool.getAvailableSize());

  } catch (error) {
    console.error('Error:', error);
  } finally {
    console.log('\nClosing table session pool...');
    await pool.close();
    console.log('Table pool closed');
  }
}

main().catch(console.error);
