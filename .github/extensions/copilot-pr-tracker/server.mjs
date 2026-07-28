// server.mjs — standalone local web server for the Copilot PR tracker.
//
// Serves the same live dashboard as the canvas, but as an ordinary website, so
// anyone with the `gh` CLI (authenticated) can use it without the Copilot App.
//
//   node .github/extensions/copilot-pr-tracker/server.mjs [options]
//
// Options / env:
//   --repo owner/name   (or PR_TRACKER_REPO)  repo to track; default: auto-detect
//   --port 8123         (or PORT)             port to bind; default 8123
//   --host 127.0.0.1    (or HOST)             interface to bind; default loopback
//
// Requires `gh auth login` (or a GH_TOKEN env var) with read access to the repo.
// Unlike the canvas entry point this is a plain Node program, so it is free to
// write to stdout/stderr.

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { resolveRepo } from "./gh.mjs";
import { createTracker } from "./server-core.mjs";

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--repo" || a === "--port" || a === "--host") args[a.slice(2)] = argv[++i];
        else if (a.startsWith("--repo=")) args.repo = a.slice(7);
        else if (a.startsWith("--port=")) args.port = a.slice(7);
        else if (a.startsWith("--host=")) args.host = a.slice(7);
        else if (a === "-h" || a === "--help") args.help = true;
    }
    return args;
}

// The script lives at <repoRoot>/.github/extensions/<name>/, so gh can auto-
// detect the repo from the repo root when no --repo is given.
function resolveRepoDir() {
    try {
        const here = dirname(fileURLToPath(import.meta.url));
        const m = here.match(/^(.*)[\\/]\.github[\\/]extensions[\\/][^\\/]+$/);
        if (m) return m[1];
    } catch {
        /* fall through to process.cwd() */
    }
    return process.cwd();
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
    process.stdout.write(
        "Copilot PR tracker — local server\n\n" +
        "  node server.mjs [--repo owner/name] [--port 8123] [--host 127.0.0.1]\n\n" +
        "Env: PR_TRACKER_REPO, PORT, HOST. Requires gh auth (or GH_TOKEN).\n",
    );
    process.exit(0);
}

const repoOverride = args.repo ?? process.env.PR_TRACKER_REPO ?? null;
const cwd = resolveRepoDir();

const portRaw = args.port ?? process.env.PORT ?? "8123";
const port = Number(portRaw);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    process.stderr.write(`Invalid --port/PORT value: ${portRaw}\n`);
    process.exit(1);
}

const host = args.host ?? process.env.HOST ?? "127.0.0.1";

const tracker = createTracker({
    cwd,
    repo: repoOverride ?? null,
    ensureRepo: () => resolveRepo(repoOverride ?? undefined, cwd),
});

const { url } = await tracker.startServer(port, host);
process.stdout.write(`\nCopilot PR tracker running at ${url}\n`);
process.stdout.write("Press Ctrl+C to stop.\n\n");

// Prime the cache so the first visitor sees data immediately, and report status.
try {
    const snap = await tracker.refresh(repoOverride ?? undefined);
    if (snap.error) process.stderr.write(`Initial load error: ${snap.error}\n`);
    else process.stderr.write(`Tracking ${snap.repo} — ${snap.prs.length} open Copilot PR(s).\n`);
} catch (err) {
    process.stderr.write(`Initial load failed: ${err?.message ?? err}\n`);
}
