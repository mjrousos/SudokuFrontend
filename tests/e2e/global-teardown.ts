import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

/**
 * Playwright globalTeardown: bring the backend stack down so the next run
 * starts from a clean DB. Skipped when E2E_KEEP_BACKEND=1 (handy for
 * post-mortem inspection) or E2E_SKIP_BACKEND=1.
 */
async function globalTeardown(): Promise<void> {
  if (process.env.E2E_SKIP_BACKEND === '1' || process.env.E2E_KEEP_BACKEND === '1') return;
  const backendPath = process.env.SUDOKU_BACKEND_PATH
    ?? path.resolve(__dirname, '..', '..', '..', 'SudokuBackend');
  // Tear down the same compose project we brought up in globalSetup by
  // passing the same `-f` files. We intentionally leave the dedicated
  // `docker-compose.e2e.yml` file in place — it's only active when passed
  // via `-f`, so it can't interfere with a developer's local
  // `docker-compose.override.yml`.
  spawnSync(
    'docker',
    ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.e2e.yml', 'down', '-v'],
    {
      cwd: backendPath,
      stdio: 'inherit',
    },
  );
}

export default globalTeardown;
