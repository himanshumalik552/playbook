/**
 * Unit tests cover the pure request/response and domain helpers. Guards, controllers and services are
 * exercised end to end against PostgreSQL and Redis by the integration suite (jest.integration.config.js).
 * @type {import('jest').Config}
 */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  collectCoverageFrom: [
    'src/common/csv.ts',
    'src/common/sorting.ts',
    'src/common/idempotency.ts',
    'src/common/mappers.ts',
    'src/common/envelope.interceptor.ts',
    'src/common/exception.filter.ts',
    'src/modules/auth/auth-cookies.ts',
    'src/modules/auth/oauth-state.ts',
    'src/modules/actions/action-workflow.ts',
    'src/modules/reports/report-period.ts',
  ],
  coverageThreshold: { global: { lines: 80, functions: 80, branches: 70, statements: 80 } },
};
