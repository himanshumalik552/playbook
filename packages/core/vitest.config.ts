import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/**/*.int.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/alerts/rules.ts',
        'src/recommendations/rules.ts',
        'src/crypto/**',
        'src/search-terms/**',
        'src/retry.ts',
        'src/sync/mapping.ts',
      ],
      thresholds: { lines: 85, functions: 85, branches: 75, statements: 85 },
    },
  },
});
