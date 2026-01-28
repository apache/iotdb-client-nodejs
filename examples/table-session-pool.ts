/**
 * TableSessionPool Example
 * 
 * This example demonstrates how to use TableSessionPool for table model
 * operations in IoTDB, including explicit session management and nodeUrls.
 */

import { TableSessionPool, PoolConfigBuilder } from '../src';

async function main() {
  console.log('=== TableSessionPool Example ===\n');

  // Method 1: Traditional constructor (backward compatible)
  console.log('Method 1: Traditional constructor');
  const pool1 = new TableSessionPool('localhost', 6667, {
    username: 'root',
    password: 'root',
    database: 'my_database', // Set default database
    maxPoolSize: 10,
    minPoolSize: 2,
  });

  // Method 2: Using Builder pattern (recommended)
  console.log('Method 2: Using Builder pattern');
  const pool2 = new TableSessionPool(
    new PoolConfigBuilder()
      .host('localhost')
      .port(6667)
      .username('root')
      .password('root')
      .database('my_database')
      .maxPoolSize(10)
      .minPoolSize(2)
      .build()
  );

  // Method 3: Using nodeUrls with string format (for multi-node)
  console.log('Method 3: Using nodeUrls in string format');
  const pool3 = new TableSessionPool({
    nodeUrls: [
      'node1:6667',
      'node2:6668',
      'node3:6669',
    ],
    username: 'root',
    password: 'root',
    database: 'my_database',
    maxPoolSize: 10,
    minPoolSize: 2,
  });

  // Method 4: Using Builder with nodeUrls
  console.log('Method 4: Using Builder with nodeUrls');
  const pool4 = new TableSessionPool(
    new PoolConfigBuilder()
      .nodeUrls(['node1:6667', 'node2:6668', 'node3:6669'])
      .username('root')
      .password('root')
      .database('my_database')
      .maxPoolSize(10)
      .minPoolSize(2)
      .build()
  );

  // For demo purposes, we'll use pool1
  const pool = pool1;

  try {
    // Initialize the pool
    console.log('\nInitializing table session pool...');
    await pool.init();
    console.log('Table pool initialized with', pool.getPoolSize(), 'connections');

    // Create database if not exists
    console.log('\nSetting up database...');
    await pool.executeNonQueryStatement('CREATE DATABASE IF NOT EXISTS root.table_example');

    // Approach 1: Using pool methods directly (automatic session management)
    console.log('\n--- Approach 1: Automatic session management ---');
    console.log('Executing table queries...');
    const result = await pool.executeQueryStatement('SHOW DATABASES');
    console.log('Databases found:', result.rows.length);

    // Insert data
    console.log('Inserting data...');
    await pool.insertTablet({
      deviceId: 'root.table_example.table1',
      measurements: ['column1', 'column2'],
      dataTypes: [1, 3], // INT32, FLOAT
      timestamps: [Date.now()],
      values: [[100, 25.5]],
    });
    console.log('Data inserted');

    // Approach 2: Explicit session management
    console.log('\n--- Approach 2: Explicit session management ---');
    console.log('Getting a session from the pool...');
    const session = await pool.getSession();
    
    try {
      console.log('Executing operations with explicit session...');
      
      // Query with explicit session
      const queryResult = await session.executeQueryStatement('SHOW DATABASES');
      console.log('Query result:', queryResult.rows.length, 'rows');
      
      // Insert with explicit session
      await session.insertTablet({
        deviceId: 'root.table_example.table1',
        measurements: ['column1', 'column2'],
        dataTypes: [1, 3], // INT32, FLOAT
        timestamps: [Date.now() + 1000],
        values: [[200, 30.5]],
      });
      console.log('Data inserted via explicit session');
      
    } finally {
      // Always release the session back to the pool
      pool.releaseSession(session);
      console.log('Session released back to the pool');
    }

    // Pool statistics
    console.log('\nTable pool statistics:');
    console.log('Total connections:', pool.getPoolSize());
    console.log('Available connections:', pool.getAvailableSize());
    console.log('In-use connections:', pool.getInUseSize());

  } catch (error) {
    console.error('Error:', error);
  } finally {
    console.log('\nClosing table session pool...');
    await pool.close();
    console.log('Table pool closed');
  }
}

main().catch(console.error);
