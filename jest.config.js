module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // thrift@0.23 pulls in uuid@13, which ships ESM-only (type: "module").
  // ts-jest must compile it to CommonJS, so allow .js transforms and stop
  // ignoring the uuid package under node_modules.
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: { allowJs: true } }],
  },
  transformIgnorePatterns: ['/node_modules/(?!uuid/)'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/thrift/generated/**'
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  // detectOpenHandles: true, // Enable this flag to debug hanging tests
  // Force exit after all tests complete to avoid hanging on unclosed resources
  // forceExit: true,
  // Run tests sequentially to avoid database conflicts
  // Multiple tests share the same database names (root.test for tree model, test for table model)
  maxWorkers: 1, // Run tests one at a time
  testTimeout: 60000, // Global timeout of 60s
  // Cache configuration for faster subsequent runs
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
};
