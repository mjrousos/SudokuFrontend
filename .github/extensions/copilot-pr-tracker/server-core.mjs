// server-core.mjs — shared HTTP core for the copilot-pr-tracker.
// Manages: snapshot cache, single-flight refresh, SSE broadcast, request routing.
// Used by extension.mjs (canvas loopback server) and server.mjs (standalone server).

import { createServer } from "node:http";
import { resolveRepo, gatherState, COLUMNS } from "./gh.mjs";
import { renderHtml } from "./ui.mjs";

// Shared snapshot cache (repo-scoped, not panel-scoped).
let cache = null;
// Dedupe concurrent refreshes into a single in-flight gather.
let inflight = null;
// SSE connections across all instances.
const sseClients = new Set();
// Currently active "owner/name" and working directory.
let _activeRepo = null;
let _cwd = null;

/**
 * Configure the active repo and/or working directory used by refresh().
 * Call before the first refresh(), and again any time either changes.
 */
export function configure(opts = {}) {
    if (opts.repo != null) _activeRepo = opts.repo;
    if (opts.cwd != null) _cwd = opts.cwd;
}

/** Return the currently active repo string ("owner/name"), or null. */
export function getActiveRepo() {
    return _activeRepo;
}

/** Return the cached snapshot, or null if none has been fetched yet. */
export function getCache() {
    return cache;
}

/**
 * If the cache belongs to a different repo than the currently active one,
 * evict it so the next request re-fetches for the correct repo.
 */
export function evictIfRepoChanged() {
    if (cache && _activeRepo && cache.repo !== _activeRepo) cache = null;
}

const withColumns = (snap) => ({ ...snap, columns: COLUMNS });

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

/**
 * Gather a fresh snapshot, update the cache, and push it to open SSE clients.
 * An optional `repoOverride` ("owner/name") replaces the active repo for this
 * and all subsequent refreshes.
 */
export async function refresh(repoOverride) {
    if (inflight) return inflight;
    inflight = (async () => {
        try {
            if (repoOverride) _activeRepo = repoOverride;
            const repo = _activeRepo ?? (await resolveRepo(undefined, _cwd));
            if (!_activeRepo) _activeRepo = repo;
            cache = await gatherState(repo, _cwd);
        } catch (err) {
            cache = {
                repo: _activeRepo ?? "(unknown)",
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

/** HTTP request handler shared by both the extension loopback server and server.mjs. */
export async function handleRequest(req, res) {
    try {
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

/**
 * Create and bind an HTTP server on the given host/port.
 * Pass `port = 0` to let the OS assign a random free port (used by the canvas
 * extension, which needs one loopback server per open canvas instance).
 * Returns `{ server, url }`.
 */
export async function startServer(host = "127.0.0.1", port = 0) {
    const server = createServer(handleRequest);
    await new Promise((resolve) => server.listen(port, host, resolve));
    const address = server.address();
    const p = typeof address === "object" && address ? address.port : port;
    return { server, url: `http://${host}:${p}/` };
}
