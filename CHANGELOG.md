# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-01-27

### Added
- Initial release of Apache IoTDB Node.js client
- Session class with query, non-query, and insertTablet operations
- SessionPool with connection pooling and automatic cleanup
- TableSessionPool for table model operations
- Multi-node support with round-robin load balancing
- SSL/TLS connection support with customizable options
- TypeScript definitions and full type safety
- Comprehensive unit tests for utilities
- E2E tests for Session, SessionPool, and TableSessionPool
- Five example files demonstrating different usage patterns
- Comprehensive README with API reference
- Implementation documentation

### Features
- Connection pooling with configurable pool sizes
- Automatic cleanup of idle connections
- Wait queue for connection requests
- Environment variable configuration for logging
- Buffer validation and bounds checking
- Timestamp validation for insertTablet operations
- Support for all IoTDB data types (BOOLEAN, INT32, INT64, FLOAT, DOUBLE, TEXT)
- Query result pagination
- Error handling and logging

### Security
- Passed CodeQL security scanning with 0 alerts
- Safe error handling
- Input validation

### Development
- TypeScript configuration with strict mode
- ESLint configuration for code quality
- Prettier configuration for code formatting
- Jest testing framework setup
- Build and test scripts in package.json

### Documentation
- Complete README with usage examples
- API reference documentation
- Implementation summary
- Example code for common use cases
- Apache License 2.0

[0.1.0]: https://github.com/CritasWang/iotdb-client-nodejs/releases/tag/v0.1.0
