# GitHub Actions Workflows

This directory contains GitHub Actions workflows for continuous integration and automated maintenance.

## Workflows

### 1. E2E Tests (1C1D) - `e2e-1c1d.yml`

Runs end-to-end tests with a single ConfigNode and single DataNode setup.

**Trigger:**
- Push to `main` or `dev/*` branches
- Pull requests to `main`

**What it does:**
1. Sets up Node.js environment
2. Installs dependencies and builds the project
3. Starts IoTDB in Docker (1 ConfigNode + 1 DataNode)
4. Runs E2E tests against the IoTDB instance
5. Cleans up containers and uploads test results

### 2. E2E Tests (3C3D) - `e2e-3c3d.yml`

Runs end-to-end tests with 3 ConfigNodes and 3 DataNodes setup for high availability testing.

**Trigger:**
- Push to `main` or `dev/*` branches
- Pull requests to `main`

**What it does:**
1. Sets up Node.js environment
2. Installs dependencies and builds the project
3. Starts IoTDB cluster in Docker (3 ConfigNodes + 3 DataNodes)
4. Runs E2E tests against the IoTDB cluster
5. Cleans up containers and uploads test results

### 3. Check Thrift Definitions - `check-thrift.yml`

Automatically checks for updates to Thrift definitions in Apache IoTDB master branch.

**Trigger:**
- Scheduled: Every Monday at 00:00 UTC
- Manual: Can be triggered via workflow_dispatch

**What it does:**
1. Clones Apache IoTDB master branch
2. Compares Thrift definition files with current version
3. If changes detected:
   - Updates Thrift IDL files
   - Regenerates Node.js client code
   - Runs build and unit tests
   - Creates a pull request with the changes
4. If update fails, creates an issue for manual intervention

## Running Locally

### E2E Tests with Docker

You can run the same E2E tests locally using Docker Compose:

```bash
# Single node (1C1D)
docker compose -f docker-compose-1c1d.yml up --build --abort-on-container-exit

# Multi-node cluster (3C3D)
docker compose -f docker-compose-3c3d.yml up --build --abort-on-container-exit
```

Clean up after tests:
```bash
docker compose -f docker-compose-1c1d.yml down -v
docker compose -f docker-compose-3c3d.yml down -v
```

### Manual Thrift Update

To manually check and update Thrift definitions:

```bash
# Clone IoTDB
git clone --depth 1 https://github.com/apache/iotdb.git /tmp/iotdb

# Copy Thrift files
cp /tmp/iotdb/iotdb-protocol/thrift-datanode/src/main/thrift/client.thrift thrift/
cp /tmp/iotdb/iotdb-protocol/thrift-commons/src/main/thrift/common.thrift thrift/

# Regenerate client
thrift --gen js:node -out src/thrift/generated thrift/client.thrift

# Build and test
npm run build
npm test
```

## Test Coverage

### E2E Test Suites

The E2E tests include:

1. **Session Tests** - Basic session operations (query, non-query, insertTablet)
2. **SessionPool Tests** - Connection pooling, concurrent operations
3. **TableSessionPool Tests** - Table model operations
4. **Large Query Tests** - Large datasets requiring multiple fetchResult calls
5. **Multi-Node Tests** - Load distribution, high availability

### Large Query Tests

The large query tests specifically cover:
- Inserting 1000+ records
- Querying with small fetchSize to force multiple fetchResult calls
- Query filtering on large datasets
- Aggregation queries
- Time range queries
- Concurrent large queries

These tests ensure the client correctly handles pagination and multiple result fetches.

## Configuration

### Environment Variables

For E2E tests, you can configure:
- `IOTDB_HOST` - IoTDB host (default: localhost)
- `IOTDB_PORT` - IoTDB port (default: 6667)
- `IOTDB_USER` - Username (default: root)
- `IOTDB_PASSWORD` - Password (default: root)
- `IOTDB_HOSTS` - Comma-separated list of hosts for multi-node tests

### GitHub Secrets

The workflows use standard `GITHUB_TOKEN` for authentication. No additional secrets are required.

For the Thrift update workflow to create pull requests, ensure the repository has:
- Actions enabled
- Pull request creation permissions for workflows

## Troubleshooting

### E2E Tests Fail

1. Check if IoTDB containers started successfully
2. Review container logs: `docker compose logs`
3. Ensure ports are not in use (6667, 6668, 6669)
4. Verify Docker has sufficient resources

### Thrift Update Fails

1. Check the workflow run logs
2. Verify Thrift compiler is available
3. Ensure Node.js build succeeds after regeneration
4. Review the auto-created issue for details

## References

- Based on [apache/iotdb-client-csharp](https://github.com/apache/iotdb-client-csharp) workflows
- Uses official [Apache IoTDB Docker images](https://hub.docker.com/r/apache/iotdb)
