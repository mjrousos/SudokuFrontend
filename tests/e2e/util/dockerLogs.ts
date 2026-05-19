import { spawn } from 'node:child_process';

/**
 * Tail recent stdout from the `sudoku-api` docker container looking for a
 * reset-password URL. The dev `ConsoleEmailSender` logs each email as
 * `Email -> {recipient}: {subject}\n{body}` via ILogger. The body for a
 * password-reset contains a link with `token=<...>`.
 */
export async function readLatestPasswordResetToken(
  recipient: string,
  sinceSeconds = 120,
): Promise<string | null> {
  const log = await dockerLogsSince('sudoku-api', sinceSeconds);
  const lines = log.split(/\r?\n/);
  // Walk backwards so we get the most recent one.
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    if (!line.includes(recipient)) continue;
    if (!/password\s*reset|password-reset/i.test(line) && !/Reset your password/i.test(line)) {
      continue;
    }
    // Token is logged inline somewhere within ~30 lines of the recipient.
    const window = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 30)).join('\n');
    const tokenMatch = window.match(/token=([A-Za-z0-9_-]+)/);
    if (tokenMatch) return tokenMatch[1] ?? null;
  }
  return null;
}

function dockerLogsSince(container: string, sinceSeconds: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', ['logs', '--since', `${sinceSeconds}s`, container]);
    let out = '';
    let err = '';
    proc.stdout.on('data', (d: Buffer) => (out += d.toString('utf8')));
    proc.stderr.on('data', (d: Buffer) => (err += d.toString('utf8')));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(out + err);
      else reject(new Error(`docker logs exited with ${code}: ${err}`));
    });
  });
}
