// Extension: copilot-pr-tracker
// A canvas that tracks open, Copilot-authored PRs and the lifecycle state the
// repo's reconciler (.github/scripts/copilot-reconcile.mjs) moves them through:
// work-in-progress -> Copilot review -> addressing feedback -> ready for a human.
//
// Wiring only. State derivation lives in gh.mjs; the iframe renderer in ui.mjs;
// the shared HTTP core (cache, refresh, SSE, routing) in server-core.mjs.

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";
import { resolveRepo, COLUMNS } from "./gh.mjs";
import {
    configure,
    getActiveRepo,
    getCache,
    evictIfRepoChanged,
    refresh,
    startServer,
} from "./server-core.mjs";

// A project-scoped extension lives at <repoRoot>/.github/extensions/<name>/, so
// the repo it should track is three levels up. `gh` needs a valid git dir only
// to auto-detect the repo; once we know "owner/name", every other call is
// explicit (--repo / gh api) and cwd no longer matters. (session.workspacePath
// points at the session-state dir, which is NOT a git repo, so we don't use it.)
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

const primaryCwd = resolveRepoDir();

// Initialize the core with the extension's working directory.
configure({ cwd: primaryCwd });

// One loopback HTTP server per open canvas instance (each on its own port).
const servers = new Map(); // instanceId -> { server, url }

/** Resolve the repo once, trying the project dir then the process cwd. */
async function ensureRepo() {
    if (getActiveRepo()) return getActiveRepo();
    const candidates = [...new Set([primaryCwd, process.cwd()].filter(Boolean))];
    let lastErr;
    for (const dir of candidates) {
        try {
            const repo = await resolveRepo(undefined, dir);
            configure({ repo });
            return repo;
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr ?? new Error("Could not resolve the current repository.");
}

// Validate an optional "owner/name" repo override consistently everywhere it
// can enter (canvas open input and the refresh action input). Returns the
// trimmed value, null when absent, or throws CanvasError on a malformed value.
const REPO_RE = /^[^/\s]+\/[^/\s]+$/;
function normalizeRepo(repo) {
    if (repo == null || repo === "") return null;
    const value = String(repo).trim();
    if (!REPO_RE.test(value)) {
        throw new CanvasError("invalid_repo", 'repo must be in "owner/name" format.');
    }
    return value;
}

/** Compact, agent-facing summary of the current snapshot. */
function summarize(snap) {
    const counts = Object.fromEntries(COLUMNS.map((c) => [c.id, 0]));
    for (const pr of snap.prs ?? []) counts[pr.column] = (counts[pr.column] ?? 0) + 1;
    return {
        repo: snap.repo,
        generatedAt: snap.generatedAt,
        error: snap.error ?? null,
        total: (snap.prs ?? []).length,
        counts,
        prs: (snap.prs ?? []).map((p) => ({
            number: p.number,
            title: p.title,
            state: p.state,
            statusLabel: p.statusLabel,
            column: p.column,
            url: p.url,
        })),
    };
}

await joinSession({
    canvases: [
        createCanvas({
            id: "copilot-pr-tracker",
            displayName: "Copilot PR tracker",
            description:
                "Board of open Copilot-authored PRs and their reconciler state (WIP, in review, addressing feedback, ready for human review).",
            inputSchema: {
                type: "object",
                properties: {
                    repo: {
                        type: "string",
                        pattern: "^[^/\\s]+/[^/\\s]+$",
                        description: 'Optional "owner/name" override. Defaults to the current repository.',
                    },
                },
                additionalProperties: false,
            },
            actions: [
                {
                    name: "refresh",
                    description:
                        "Re-fetch open Copilot-authored PRs and their states, update the canvas, and return a summary.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            repo: {
                                type: "string",
                                pattern: "^[^/\\s]+/[^/\\s]+$",
                                description: 'Optional "owner/name" override.',
                            },
                        },
                        additionalProperties: false,
                    },
                    handler: async (ctx) => {
                        return summarize(await refresh(normalizeRepo(ctx.input?.repo) ?? undefined));
                    },
                },
            ],
            open: async (ctx) => {
                const repoInput = normalizeRepo(ctx.input?.repo);
                if (repoInput) configure({ repo: repoInput });
                // Warm the repo if it hasn't been resolved yet.
                if (!getActiveRepo()) await ensureRepo().catch(() => {});
                let entry = servers.get(ctx.instanceId);
                if (!entry) {
                    entry = await startServer("127.0.0.1", 0);
                    servers.set(ctx.instanceId, entry);
                }
                // Drop a snapshot that belongs to a different repo than the one
                // now active so /api/state can't serve the previous repo's PRs,
                // then (re)warm the cache in the background. This covers opening
                // the canvas with a new `repo` override while a stale snapshot is
                // still cached. The iframe also fetches /api/state on load.
                evictIfRepoChanged();
                if (!getCache()) void refresh().catch(() => {});
                return {
                    title: "Copilot PR tracker",
                    status: getActiveRepo() ?? undefined,
                    url: entry.url,
                };
            },
            onClose: async (ctx) => {
                const entry = servers.get(ctx.instanceId);
                if (entry) {
                    servers.delete(ctx.instanceId);
                    await new Promise((resolve) => entry.server.close(() => resolve()));
                }
            },
        }),
    ],
});
