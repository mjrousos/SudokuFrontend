import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { waitForHealth } from './util/api';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Playwright globalSetup: brings up the SudokuBackend docker compose stack
 * (configured with the correct CORS origins for our preview server) and waits
 * for /health/ready before tests run.
 *
 * If env var `E2E_SKIP_BACKEND=1` is set we skip the docker step — useful when
 * the backend is already running locally. In all cases we still wait for
 * /health/ready before returning so failed pre-conditions surface clearly.
 */
async function globalSetup(): Promise<void> {
  if (process.env.E2E_SKIP_BACKEND !== '1') {
    const backendPath = process.env.SUDOKU_BACKEND_PATH
      ?? path.resolve(__dirname, '..', '..', '..', 'SudokuBackend');

    // Pass CORS origins so the preview (5173) and Vite dev (5173) work, plus
    // the Playwright preview test URL. The compose env is overlaid by these.
    const env = {
      ...process.env,
      Cors__AllowedOrigins__0: 'http://localhost:5173',
      Cors__AllowedOrigins__1: 'http://localhost:4173',
    };

    const result = spawnSync('docker', ['compose', 'up', '-d', '--build'], {
      cwd: backendPath,
      env,
      stdio: 'inherit',
    });
    if (result.status !== 0) {
      throw new Error(`docker compose up failed with exit code ${result.status}`);
    }
  }

  await waitForHealth();
}

export default globalSetup;
