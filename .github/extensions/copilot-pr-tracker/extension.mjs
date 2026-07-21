// Extension: copilot-pr-tracker
// A canvas that tracks open, Copilot-authored PRs and the lifecycle state the
// repo's reconciler (.github/scripts/copilot-reconcile.mjs) moves them through:
// work-in-progress -> Copilot review -> addressing feedback -> ready for a human.
//
// Wiring only. State derivation lives in gh.mjs; the iframe renderer in ui.mjs.

import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";
import { COLUMNS, resolveRepo, gatherState } from "./gh.mjs";
import { renderHtml } from "./ui.mjs";

// One loopback HTTP server per open canvas instance (each on its own port).
const servers = new Map(); // instanceId -> { server, url }
// SSE connections across all instances; snapshots are pushed to every client.
const sseClients = new Set(); // http.ServerResponse
// Most recent snapshot (shared: the tracker is repo-scoped, not panel-scoped).
let cache = null;
// Dedupe concurrent refreshes into a single in-flight gather.
let inflight = null;

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
let activeRepo = null; // resolved "owner/name"

/** Resolve the repo once, trying the project dir then the process cwd. */
async function ensureRepo() {
    if (activeRepo) return activeRepo;
    const candidates = [...new Set([primaryCwd, process.cwd()].filter(Boolean))];
    let lastErr;
    for (const dir of candidates) {
        try {
            activeRepo = await resolveRepo(undefined, dir);
            return activeRepo;
        } catch (err) {
            lastErr = err;
        }
    }
    throw lastErr ?? new Error("Could not resolve the current repository.");
}

const withColumns = (snap) => ({ ...snap, columns: COLUMNS });

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

function broadcast(snap) {
    const payload = `data: ${JSON.stringify(withColumns(snap))}\n\n`;
    for (const res of [...sseClients]) {
        try {
            res.write(payload);
        } catch {
            sseClients.delete(res);
        }
    }
}

/** Gather a fresh snapshot, update the cache, and push it to open panels. */
async function refresh(repoOverride) {
    if (inflight) return inflight;
    inflight = (async () => {
        try {
            if (repoOverride) activeRepo = repoOverride;
            const repo = activeRepo ?? (await ensureRepo());
            cache = await gatherState(repo, primaryCwd);
        } catch (err) {
            cache = {
                repo: activeRepo ?? "(unknown)",
                generatedAt: new Date().toISOString(),
                error: err?.message ? String(err.message).split("\n")[0] : String(err),
                prs: [],
            };
        }
        broadcast(cache);
        return cache;
    })();
    try {
        return await inflight;
    } finally {
        inflight = null;
    }
}

function sendJson(res, obj) {
    const body = JSON.stringify(withColumns(obj));
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(body);
}

async function handleRequest(req, res) {
    try {
        // req.url is typed `string | undefined`; default it and parse inside the
        // try so a malformed URL yields a 500 rather than crashing the request.
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (req.method === "GET" && url.pathname === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(renderHtml());
            return;
        }
        if (req.method === "GET" && url.pathname === "/api/state") {
            sendJson(res, cache ?? (await refresh()));
            return;
        }
        if (req.method === "POST" && url.pathname === "/api/refresh") {
            sendJson(res, await refresh());
            return;
        }
        if (req.method === "GET" && url.pathname === "/events") {
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            });
            res.write(": connected\n\n");
            sseClients.add(res);
            if (cache) res.write(`data: ${JSON.stringify(withColumns(cache))}\n\n`);
            req.on("close", () => sseClients.delete(res));
            return;
        }
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
    } catch (err) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(String(err?.message ?? err));
    }
}

async function startServer() {
    const server = createServer(handleRequest);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return { server, url: `http://127.0.0.1:${port}/` };
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
                if (repoInput) activeRepo = repoInput;
                let entry = servers.get(ctx.instanceId);
                if (!entry) {
                    entry = await startServer();
                    servers.set(ctx.instanceId, entry);
                }
                // Warm the cache in the background so the first paint is quick;
                // the iframe also fetches /api/state on load.
                if (!cache) void refresh().catch(() => {});
                return {
                    title: "Copilot PR tracker",
                    status: activeRepo ?? undefined,
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
