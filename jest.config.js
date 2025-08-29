export default {
  testEnvironment: 'node',
  collectCoverageFrom: ['src/**/*.js', 'bin/*.js', '!src/**/*.test.js'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testMatch: ['<rootDir>/__tests__/**/*.test.js'],
  verbose: true,
};
