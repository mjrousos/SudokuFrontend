// server-core.mjs — the HTTP tracker core shared by both the canvas extension
// (extension.mjs) and the standalone local server (server.mjs).
//
// It owns the snapshot cache, the single-flight refresh, the SSE broadcast, and
// the HTTP routing so the two entry points can't drift apart — the same routes,
// the same error handling, one place to fix. Repo resolution and the page HTML
// are injected so each entry point stays in control of those.

import { createServer } from "node:http";
import { COLUMNS, gatherState } from "./gh.mjs";
import { renderHtml } from "./ui.mjs";

const withColumns = (snap) => ({ ...snap, columns: COLUMNS });

function firstLine(err) {
    return err?.message ? String(err.message).split("\n")[0] : String(err);
}

/**
 * Build a tracker instance.
 *
 * opts:
 *   - cwd?: string                working dir passed to the default gatherState
 *   - gather?: (repo) => snapshot override how a snapshot is produced
 *   - ensureRepo?: () => Promise<string>  resolve the default "owner/name"
 *   - repo?: string               seed the active repo (e.g. an explicit override)
 *   - pageOptions?: object        forwarded to renderHtml() for the "/" document
 *
 * Returns helpers used by the entry points; all share one cache + SSE fan-out.
 */
export function createTracker(opts = {}) {
    const cwd = opts.cwd;
    const gather = opts.gather ?? ((repo) => gatherState(repo, cwd));
    const ensureRepo =
        opts.ensureRepo ?? (() => Promise.reject(new Error("No repository configured.")));
    const html = renderHtml(opts.pageOptions);

    let cache = null;
    let inflight = null;
    let activeRepo = opts.repo ?? null;
    const sseClients = new Set();

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
                activeRepo = repo;
                cache = await gather(repo);
            } catch (err) {
                cache = {
                    repo: activeRepo ?? "(unknown)",
                    generatedAt: new Date().toISOString(),
                    error: firstLine(err),
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
            // req.url is typed `string | undefined`; default it and parse inside
            // the try so a malformed URL yields a 500 rather than crashing.
            const url = new URL(req.url ?? "/", "http://127.0.0.1");
            if (req.method === "GET" && url.pathname === "/") {
                res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
                res.end(html);
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

    async function startServer(port = 0, host = "127.0.0.1") {
        const server = createServer(handleRequest);
        await new Promise((resolve) => server.listen(port, host, resolve));
        const address = server.address();
        const boundPort = typeof address === "object" && address ? address.port : port;
        return { server, port: boundPort, url: `http://${host}:${boundPort}/` };
    }

    /** Compact, agent-facing summary of a snapshot. */
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

    return {
        refresh,
        handleRequest,
        startServer,
        summarize,
        hasCache: () => cache != null,
        getActiveRepo: () => activeRepo,
        setActiveRepo: (repo) => {
            activeRepo = repo;
        },
        // Drop a cached snapshot that belongs to a different repo than the one
        // now active, so /api/state can't keep serving the previous repo's PRs.
        dropStaleCache: () => {
            if (cache && activeRepo && cache.repo !== activeRepo) cache = null;
        },
    };
}
