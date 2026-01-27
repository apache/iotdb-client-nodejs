/**
 * SessionPool Example
 * 
 * This example demonstrates how to use SessionPool for efficient connection
 * management in high-concurrency scenarios.
 */

import { SessionPool } from '../src';

async function main() {
  // Create a session pool
  const pool = new SessionPool('localhost', 6667, {
    username: 'root',
    password: 'root',
    maxPoolSize: 10,
    minPoolSize: 2,
    maxIdleTime: 60000,
    waitTimeout: 60000,
  });

  try {
    // Initialize the pool
    console.log('Initializing session pool...');
    await pool.init();
    console.log('Pool initialized with', pool.getPoolSize(), 'connections');

    // Create database
    console.log('\nCreating database...');
    await pool.executeNonQueryStatement('CREATE DATABASE root.pool_example');

    // Create timeseries
    console.log('Creating timeseries...');
    await pool.executeNonQueryStatement(
      'CREATE TIMESERIES root.pool_example.sensor1.value WITH DATATYPE=FLOAT'
    );

    // Simulate concurrent operations
    console.log('\nExecuting concurrent queries...');
    const promises = [];
    
    for (let i = 0; i < 20; i++) {
      promises.push(
        pool.executeQueryStatement('SHOW DATABASES').then(() => {
          console.log(`Query ${i + 1} completed`);
        })
      );
    }

    await Promise.all(promises);
    console.log('All concurrent queries completed');

    // Insert data using pool
    console.log('\nInserting data...');
    await pool.insertTablet({
      deviceId: 'root.pool_example.sensor1',
      measurements: ['value'],
      dataTypes: [3], // FLOAT
      timestamps: [Date.now()],
      values: [[42.5]],
    });
    console.log('Data inserted');

    // Check pool statistics
    console.log('\nPool statistics:');
    console.log('Total connections:', pool.getPoolSize());
    console.log('Available connections:', pool.getAvailableSize());

  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Close the pool
    console.log('\nClosing session pool...');
    await pool.close();
    console.log('Pool closed');
  }
}

main().catch(console.error);
