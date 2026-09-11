# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.11] - 2026-09-11

First public release of the Apache IoTDB Node.js client.

### Added
- `Session` for the tree model: query, non-query and `insertTablet` operations
- `TableSession` and `TableSessionPool` for the table model
- `SessionPool` connection pooling with idle cleanup and a wait queue for connection requests
- Multi-node support with round-robin load balancing and IPv6 `nodeUrls`
- SSL/TLS connections, plus server redirection handling with a redirect cache
- Full TypeScript declarations (`Tablet`, `QueryResult`, `Config`, `TSDataType`, ...)
- Examples, unit tests and e2e tests (1C1D / 1C3D / 3C3D topologies)
- Complete README and user guides for the tree and table models

### Fixed
- DATE values were encoded as days-since-epoch instead of INT32 `yyyyMMdd` (#15)
- SSL connection creation failed (#13)
- Session pool lifecycle bugs in `getSession` / `releaseSession` / `cleanupIdleSessions` (#19)
- `executeConcurrent` reported a wrong success count when stopping on error (#18)
- The connection was leaked when session setup failed in `Connection.open()` (#20)
- Repeated `Session.open()` calls opened duplicate connections (#23)
- IPv6 node URLs and wildcard redirect endpoints were not handled (#21)

### Changed
- Tablet serialization is now single-pass and single-buffer, with BigInt-free int64 writes (#16)
- `thrift` dependency upgraded to 0.23.0 (#7)
- CI runs the e2e matrix against IoTDB 2.0.6 and 2.0.10 (#17)

[2.0.11]: https://github.com/apache/iotdb-client-nodejs/releases/tag/v2.0.11
