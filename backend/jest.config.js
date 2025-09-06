module.exports = {
  testEnvironment: 'node',
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  collectCoverageFrom: [
    '**/*.js',
    '!node_modules/**',
    '!coverage/**',
    '!jest.config.js',
    '!tests/**',
    '!database/**'
  ],
  testMatch: [
    '<rootDir>/tests/**/*.test.js'
  ],
  verbose: true,
  forceExit: true,
  clearMocks: true
};