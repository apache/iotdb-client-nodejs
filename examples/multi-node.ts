/**
 * Multi-Node Example
 * 
 * This example demonstrates how to configure SessionPool to work with
 * multiple IoTDB nodes for load balancing.
 */

import { SessionPool } from '../src';

async function main() {
  // Create a session pool with multiple nodes
  const pool = new SessionPool(
    [
      'node1.example.com',
      'node2.example.com',
      'node3.example.com',
    ],
    6667,
    {
      username: 'root',
      password: 'root',
      maxPoolSize: 15, // 5 connections per node
      minPoolSize: 3,  // 1 connection per node initially
    }
  );

  try {
    console.log('Initializing multi-node session pool...');
    await pool.init();
    console.log('Pool initialized with', pool.getPoolSize(), 'connections across 3 nodes');

    // Execute operations
    // Connections will be distributed across all nodes using round-robin
    console.log('\nExecuting operations across nodes...');
    
    for (let i = 0; i < 10; i++) {
      const result = await pool.executeQueryStatement('SHOW DATABASES');
      console.log(`Query ${i + 1} executed (result count: ${result.rows.length})`);
    }

    console.log('\nAll operations completed');
    console.log('Final pool size:', pool.getPoolSize());
    console.log('Available connections:', pool.getAvailableSize());

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.close();
    console.log('Pool closed');
  }
}

main().catch(console.error);
