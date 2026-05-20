import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
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

    // The SudokuBackend docker-compose.yml has no `env_file:` and only an
    // explicit `environment:` block, so plain shell env vars never reach the
    // container. Drop a compose override (auto-merged by `docker compose up`)
    // that injects what the api container needs:
    //
    // * Cors__AllowedOrigins lets the browser at http://localhost:5173
    //   (vite preview) call the api at http://localhost:8080.
    //
    // * ASPNETCORE_ENVIRONMENT=Testing flips the explicit escape hatches in
    //   the backend's Program.cs that skip the per-remote-IP rate limiter
    //   (which under docker's bridge network buckets every test to the same
    //   gateway IP) and the HTTPS redirect.
    const overridePath = path.join(backendPath, 'docker-compose.override.yml');
    const overrideYaml = [
      'services:',
      '  api:',
      '    environment:',
      '      ASPNETCORE_ENVIRONMENT: Testing',
      '      Cors__AllowedOrigins__0: http://localhost:5173',
      '      Cors__AllowedOrigins__1: http://localhost:4173',
      '',
    ].join('\n');
    fs.writeFileSync(overridePath, overrideYaml, 'utf8');

    const result = spawnSync('docker', ['compose', 'up', '-d', '--build'], {
      cwd: backendPath,
      stdio: 'inherit',
    });
    if (result.status !== 0) {
      throw new Error(`docker compose up failed with exit code ${result.status}`);
    }
  }

  await waitForHealth();
}

export default globalSetup;
