# Thrift Code Generation

This directory contains Thrift definition files (`.thrift`) and the generated Node.js client code.

## Overview

The IoTDB client uses Apache Thrift for RPC communication. The Thrift definitions are sourced from [Apache IoTDB](https://github.com/apache/iotdb) and are automatically synchronized weekly via GitHub Actions.

## Structure

```
thrift/
├── client.thrift    # IoTDB client RPC interface definitions
├── common.thrift    # Common types shared across services
└── README.md        # This file

src/thrift/generated/
├── IClientRPCService.js      # Generated RPC client (JavaScript)
├── IClientRPCService.d.ts    # TypeScript definitions for RPC client
├── client_types.js           # Generated client types (JavaScript)
├── client_types.d.ts         # TypeScript definitions for client types
├── common_types.js           # Generated common types (JavaScript)
└── common_types.d.ts         # TypeScript definitions for common types
```

## TypeScript Support

As of this update, the Thrift code generator produces both:
- **JavaScript files (`.js`)**: Used at runtime
- **TypeScript declaration files (`.d.ts`)**: Provide type safety and IDE autocomplete

This dual-generation approach ensures:
- Full TypeScript support with proper types and interfaces
- Compatibility with the existing JavaScript runtime
- Better developer experience with IntelliSense and type checking
- No runtime overhead

## Regenerating Thrift Code

### Prerequisites

You need the Apache Thrift compiler installed:

```bash
# Ubuntu/Debian
sudo apt-get install thrift-compiler

# macOS
brew install thrift

# Verify installation
thrift --version
```

### Manual Generation

To regenerate the Thrift client code:

```bash
npm run generate:thrift
```

This command:
1. Removes existing generated `.js` and `.d.ts` files
2. Generates new JavaScript files from `thrift/client.thrift`
3. Generates TypeScript definition files (`.d.ts`) alongside the JavaScript

The generated files include proper TypeScript types for:
- All Thrift structs and enums
- RPC service methods
- Request and response types
- Common types from `common.thrift`

### Automatic Updates

The GitHub Actions workflow `.github/workflows/check-thrift.yml` automatically:
1. Checks for updates to Thrift definitions in Apache IoTDB master branch (weekly)
2. Regenerates the client code with TypeScript definitions if changes are detected
3. Creates a pull request with the updates

## Usage in TypeScript

With the TypeScript definitions, you get full type safety:

```typescript
import { Session } from './client/Session';
import * as ttypes from './thrift/generated/client_types';

const session = new Session({ host: 'localhost', port: 6667 });

// TypeScript knows the exact types of request fields
const req = new ttypes.TSOpenSessionReq({
  client_protocol: ttypes.TSProtocolVersion.IOTDB_SERVICE_PROTOCOL_V3,
  username: 'root',
  password: 'root',
  zoneId: 'UTC+8',
});

// Full IntelliSense support
session.executeQueryStatement('SELECT * FROM root.test');
```

## Technical Details

### Generation Command

The generator uses the official Apache Thrift compiler with the `js:node,ts` target:

```bash
thrift --gen js:node,ts -out src/thrift/generated thrift/client.thrift
```

Options:
- `js:node` - Generate Node.js compatible JavaScript
- `ts` - Generate TypeScript definition files
- `-out` - Output directory for generated files

### Dependencies

The generated code depends on:
- `thrift` - Apache Thrift Node.js library
- `node-int64` - For 64-bit integer support
- `@types/thrift` - TypeScript definitions for Thrift library (dev dependency)

## Troubleshooting

### Missing TypeScript Definitions

If you see TypeScript errors about missing types, ensure:
1. You've run `npm install` to install dependencies
2. The `.d.ts` files exist in `src/thrift/generated/`
3. Your `tsconfig.json` includes the `src` directory

### Thrift Compiler Version

The code generation requires Thrift compiler 0.14.0 or later for TypeScript support. Check your version:

```bash
thrift --version
```

### Stale Generated Code

If you encounter issues after updating Thrift definitions:

```bash
# Clean and regenerate
rm -rf src/thrift/generated/*.js src/thrift/generated/*.d.ts
npm run generate:thrift

# Rebuild the project
npm run build
```

## Contributing

When updating Thrift definitions:

1. Update the `.thrift` files in the `thrift/` directory
2. Run `npm run generate:thrift` to regenerate code
3. Run `npm run build` to ensure compilation succeeds
4. Run `npm test` to verify tests pass
5. Commit both the `.thrift` files and generated code

## References

- [Apache Thrift](https://thrift.apache.org/)
- [Apache IoTDB](https://iotdb.apache.org/)
- [Thrift Node.js Tutorial](https://thrift.apache.org/tutorial/nodejs.html)
- [IoTDB Thrift Definitions](https://github.com/apache/iotdb/tree/master/iotdb-protocol)
