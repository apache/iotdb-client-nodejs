/**
 * SSL Connection Example
 * 
 * This example demonstrates how to establish a secure SSL/TLS connection
 * to IoTDB.
 */

import { Session } from '../src';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  // Create a session with SSL enabled
  const session = new Session({
    host: 'localhost',
    port: 6667,
    username: 'root',
    password: 'root',
    enableSSL: true,
    sslOptions: {
      // Path to CA certificate
      ca: fs.readFileSync(path.join(__dirname, 'certs', 'ca.crt')),
      
      // Path to client certificate (if required)
      cert: fs.readFileSync(path.join(__dirname, 'certs', 'client.crt')),
      
      // Path to client private key (if required)
      key: fs.readFileSync(path.join(__dirname, 'certs', 'client.key')),
      
      // Whether to reject unauthorized certificates
      rejectUnauthorized: true,
    },
  });

  try {
    console.log('Opening secure SSL connection...');
    await session.open();
    console.log('Secure connection established');

    // Execute operations over SSL
    const result = await session.executeQueryStatement('SHOW DATABASES');
    console.log('Databases:', result.rows);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await session.close();
    console.log('Connection closed');
  }
}

// For self-signed certificates or testing, you can use:
async function selfSignedExample() {
  const session = new Session({
    host: 'localhost',
    port: 6667,
    username: 'root',
    password: 'root',
    enableSSL: true,
    sslOptions: {
      rejectUnauthorized: false, // Only for testing!
    },
  });

  await session.open();
  // ... operations ...
  await session.close();
}

main().catch(console.error);
