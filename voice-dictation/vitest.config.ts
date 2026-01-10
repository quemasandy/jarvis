import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts', 'src/cli/**'],
      // Coverage thresholds - fail if below these percentages
      // Updated: ~35% after adding DictationController integration tests
      // Target: 50% global by adding more entity tests
      thresholds: {
        // Global minimum (based on current state + small buffer)
        lines: 30,
        functions: 35,
        branches: 25,
        statements: 30,
        // Per-folder thresholds for pure domain logic
        'src/application/types.ts': {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        'src/domain/usecases/**': {
          lines: 90,
          functions: 90,
          branches: 85,
          statements: 90,
        },
      },
    },
  },
});
