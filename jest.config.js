module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/thrift/generated/**'
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  // detectOpenHandles: true, // Enable this flag to debug hanging tests
  // Force exit after all tests complete to avoid hanging on unclosed resources
  forceExit: true,
  // Run tests sequentially to avoid database conflicts
  // Multiple tests share the same database names (root.test for tree model, test for table model)
  maxWorkers: 1, // Run tests one at a time
  testTimeout: 60000, // Global timeout of 60s
  // Cache configuration for faster subsequent runs
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
};
