// server.mjs — standalone local web server for the copilot-pr-tracker.
//
// Usage:
//   node .github/extensions/copilot-pr-tracker/server.mjs [--repo=owner/name] [--port=PORT] [--host=HOST]
//
// Environment variables (all optional; flags take precedence):
//   PR_TRACKER_REPO   "owner/name" to track (default: auto-detected from git)
//   PORT              TCP port to bind (default: 3000)
//   HOST              Host/IP to bind (default: 127.0.0.1)
//
// Requirements: an authenticated `gh` CLI on PATH (reads PR data only).

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRepo } from "./gh.mjs";
import { configure, refresh, startServer } from "./server-core.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// Parse CLI flags: --name=value
const args = process.argv.slice(2);
const flag = (name) => {
    const a = args.find((a) => a.startsWith(`--${name}=`));
    return a != null ? a.slice(name.length + 3) : null;
};

const repoArg = flag("repo") ?? process.env.PR_TRACKER_REPO ?? null;
const portArg = parseInt(flag("port") ?? process.env.PORT ?? "3000", 10);
const hostArg = flag("host") ?? process.env.HOST ?? "127.0.0.1";

// Resolve the repo (from flag/env, or auto-detect via `gh repo view` in `here`).
const repo = await resolveRepo(repoArg, here);

// Configure the shared core with the resolved repo and working directory.
configure({ repo, cwd: here });

// Start listening.
const { url } = await startServer(hostArg, portArg);
console.log(`Copilot PR tracker → ${url}`);
console.log(`Tracking: ${repo}`);
console.log(`Press Ctrl-C to stop.`);

// Warm the cache in the background so the first browser request is fast.
void refresh().catch((err) => console.error(`Initial refresh failed: ${err?.message ?? err}`));
