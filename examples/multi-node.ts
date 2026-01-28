/**
 * Multi-Node Example
 * 
 * This example demonstrates how to configure SessionPool to work with
 * multiple IoTDB nodes for load balancing using the new nodeUrls API.
 */

import { SessionPool, PoolConfigBuilder } from '../src';

async function main() {
  console.log('=== Multi-Node Example ===\n');

  // Method 1: Using nodeUrls with string array format (RECOMMENDED)
  console.log('Method 1: Using nodeUrls in string array format (host:port)');
  const pool1 = new SessionPool({
    nodeUrls: [
      'node1.example.com:6667',
      'node2.example.com:6668',
      'node3.example.com:6669',
    ],
    username: 'root',
    password: 'root',
    maxPoolSize: 15, // 5 connections per node
    minPoolSize: 3,  // 1 connection per node initially
  });

  // Method 2: Using Builder pattern with string array format (RECOMMENDED)
  console.log('Method 2: Using Builder pattern with string array');
  const pool2 = new SessionPool(
    new PoolConfigBuilder()
      .nodeUrls([
        'node1.example.com:6667',
        'node2.example.com:6668',
        'node3.example.com:6669',
      ])
      .username('root')
      .password('root')
      .maxPoolSize(15)
      .minPoolSize(3)
      .build()
  );

  // Method 3: Using nodeUrls with object format (also supported)
  console.log('Method 3: Using nodeUrls in object format');
  const pool3 = new SessionPool({
    nodeUrls: [
      { host: 'node1.example.com', port: 6667 },
      { host: 'node2.example.com', port: 6668 },
      { host: 'node3.example.com', port: 6669 },
    ],
    username: 'root',
    password: 'root',
    maxPoolSize: 15,
    minPoolSize: 3,
  });

  // Method 4: Backward compatible - same port for all hosts
  console.log('Method 4: Backward compatible (same port for all hosts)');
  const pool4 = new SessionPool(
    [
      'node1.example.com',
      'node2.example.com',
      'node3.example.com',
    ],
    6667,
    {
      username: 'root',
      password: 'root',
      maxPoolSize: 15,
      minPoolSize: 3,
    }
  );

  // For demo purposes, we'll use pool1
  const pool = pool1;

  try {
    console.log('\nInitializing multi-node session pool...');
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
