# Contributing to Apache IoTDB Node.js Client

Thank you for your interest in contributing to the Apache IoTDB Node.js client!

## Getting Started

### Prerequisites

- Node.js >= 14.0.0
- npm or yarn
- Apache Thrift compiler (for regenerating Thrift files)
- Git

### Development Setup

1. Clone the repository:
```bash
git clone https://github.com/CritasWang/iotdb-client-nodejs.git
cd iotdb-client-nodejs
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Run tests:
```bash
npm test
```

## Development Workflow

### Building

```bash
npm run build
```

This compiles TypeScript files to JavaScript in the `dist/` directory.

### Testing

Run all tests:
```bash
npm test
```

Run only unit tests:
```bash
npm run test:unit
```

Run only E2E tests (requires running IoTDB instance):
```bash
export IOTDB_HOST=localhost
export IOTDB_PORT=6667
npm run test:e2e
```

### Linting

```bash
npm run lint
```

### Formatting

```bash
npm run format
```

## Code Style

- Use TypeScript strict mode
- Follow existing code formatting (use Prettier)
- Add JSDoc comments for public APIs
- Keep functions focused and concise
- Use async/await instead of callbacks
- Handle errors appropriately

## Testing Guidelines

### Unit Tests

- Place in `tests/unit/`
- Test individual functions and classes
- Mock external dependencies
- Aim for high coverage

### E2E Tests

- Place in `tests/e2e/`
- Test against real IoTDB instance
- Use environment variables for configuration
- Gracefully handle missing IoTDB instance
- Clean up test data

Example E2E test pattern:
```typescript
describe('Feature E2E Tests', () => {
  let client;

  beforeAll(async () => {
    try {
      client = new Session({
        host: process.env.IOTDB_HOST || 'localhost',
        port: parseInt(process.env.IOTDB_PORT || '6667'),
      });
      await client.open();
    } catch (error) {
      console.warn('IoTDB not available, tests will be skipped');
    }
  });

  afterAll(async () => {
    if (client?.isOpen()) {
      await client.close();
    }
  });

  test('Should do something', async () => {
    if (!client?.isOpen()) {
      console.log('Skipping - no IoTDB connection');
      return;
    }
    // Test implementation
  });
});
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Add/update tests as needed
4. Ensure all tests pass
5. Update documentation if needed
6. Submit a pull request

### Pull Request Checklist

- [ ] Code builds without errors
- [ ] All tests pass
- [ ] New code has tests
- [ ] Documentation updated (if applicable)
- [ ] CHANGELOG.md updated
- [ ] Code follows project style
- [ ] Commit messages are clear

## Regenerating Thrift Files

If you need to update to a newer version of IoTDB's Thrift definitions:

1. Download the latest Thrift files from Apache IoTDB:
```bash
git clone --depth 1 https://github.com/apache/iotdb.git /tmp/iotdb
```

2. Copy the Thrift files:
```bash
cp /tmp/iotdb/iotdb-protocol/thrift-datanode/src/main/thrift/client.thrift thrift/
cp /tmp/iotdb/iotdb-protocol/thrift-commons/src/main/thrift/common.thrift thrift/
```

3. Regenerate the Node.js client:
```bash
thrift --gen js:node -out src/thrift/generated thrift/client.thrift
```

4. Test thoroughly to ensure compatibility

## Adding New Features

When adding new features:

1. Check if the feature is supported in Apache IoTDB
2. Add the implementation in the appropriate file
3. Add TypeScript type definitions
4. Write unit tests
5. Write E2E tests
6. Add example usage
7. Update README.md
8. Update IMPLEMENTATION.md
9. Update CHANGELOG.md

## Common Development Tasks

### Adding a New Method to Session

1. Add method to `src/client/Session.ts`
2. Add the same method to `src/client/SessionPool.ts` (delegating to pool)
3. Add tests in `tests/e2e/Session.test.ts` and `tests/e2e/SessionPool.test.ts`
4. Update TypeScript exports in `src/index.ts` if needed
5. Add example usage in README.md

### Updating Configuration

1. Update interfaces in `src/utils/Config.ts`
2. Update DEFAULT_CONFIG or DEFAULT_POOL_CONFIG
3. Update tests in `tests/unit/Config.test.ts`
4. Document in README.md

## Reporting Issues

When reporting issues, please include:

- Node.js version
- IoTDB version
- Operating system
- Steps to reproduce
- Expected behavior
- Actual behavior
- Error messages/stack traces

## Questions?

For questions or discussions:
- Open an issue on GitHub
- Check existing issues and documentation

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
