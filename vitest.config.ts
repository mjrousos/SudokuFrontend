import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig, configDefaults } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'happy-dom',
      globals: true,
      exclude: [...configDefaults.exclude, 'tests/e2e/**'],
      include: ['src/**/*.{test,spec}.ts', 'tests/unit/**/*.{test,spec}.ts'],
      setupFiles: ['./tests/unit/setup.ts'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'lcov'],
        // Coverage thresholds are scoped to the code that is reasonably
        // exercisable by unit/component tests. Views, layouts, the router
        // wiring, and the UI shell are intentionally validated by Playwright
        // E2E tests (see tests/e2e/*.spec.ts) and excluded here.
        include: [
          'src/shared/api/**/*.ts',
          'src/shared/auth/**/*.ts',
          'src/shared/sudoku/**/*.ts',
          'src/shared/composables/**/*.ts',
          'src/features/*/store/**/*.ts',
          'src/features/*/api/**/*.ts',
          'src/features/*/logic/**/*.ts',
        ],
        exclude: [
          'src/**/*.d.ts',
          'src/**/types.ts',
          'src/**/*.spec.ts',
          'src/**/*.test.ts',
        ],
        thresholds: {
          lines: 90,
          statements: 90,
          branches: 80,
          functions: 90,
        },
      },
    },
  }),
);
