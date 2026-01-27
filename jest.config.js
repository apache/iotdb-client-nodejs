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
  // Performance optimizations
  maxWorkers: '50%', // Use half of available CPUs
  testTimeout: 60000, // Global timeout of 60s
  globals: {
    'ts-jest': {
      isolatedModules: true, // Faster compilation by skipping type checking
    }
  },
  // Cache configuration for faster subsequent runs
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
};
