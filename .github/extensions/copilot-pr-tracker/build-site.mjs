// build-site.mjs — generate a static Copilot PR tracker site (index.html +
// state.json) that can be hosted anywhere, e.g. GitHub Pages. Reuses the same
// state derivation (gh.mjs) and renderer (ui.mjs) as the canvas, so the static
// board stays identical to the live one.
//
//   node .github/extensions/copilot-pr-tracker/build-site.mjs [options]
//
// Options / env:
//   --repo owner/name   (or REPO)   repo to snapshot; default: auto-detect
//   --out ./dir         (or OUT)    output directory; default ./pr-tracker-site
//
// Requires `gh` with read access (GH_TOKEN in CI). Read-only: it only fetches
// public PR metadata, reviews, and review threads. If gathering fails it exits
// non-zero WITHOUT writing, so a previously published site is left intact.

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { COLUMNS, resolveRepo, gatherState } from "./gh.mjs";
import { renderHtml } from "./ui.mjs";

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--repo" || a === "--out") args[a.slice(2)] = argv[++i];
        else if (a.startsWith("--repo=")) args.repo = a.slice(7);
        else if (a.startsWith("--out=")) args.out = a.slice(6);
    }
    return args;
}

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
const repoOverride = args.repo ?? process.env.REPO ?? null;
const outDir = resolve(args.out ?? process.env.OUT ?? "./pr-tracker-site");
const cwd = resolveRepoDir();

const repo = await resolveRepo(repoOverride ?? undefined, cwd);
process.stderr.write(`Gathering Copilot PR state for ${repo}…\n`);

// Let a gather failure reject and exit non-zero: better to keep the last good
// published site than to overwrite it with an error page.
const snapshot = await gatherState(repo, cwd);
const state = { ...snapshot, columns: COLUMNS };

const html = renderHtml({
    stateUrl: "./state.json",
    refreshUrl: null, // no server to POST to; refresh re-reads state.json
    eventsUrl: null,  // no SSE on a static host
    pollMs: 300000,   // re-read the published snapshot every 5 min
    cacheBust: true,  // bypass the CDN cache so republished data shows up
    subtitle: "Auto-published by GitHub Actions",
});

await mkdir(outDir, { recursive: true });
await Promise.all([
    writeFile(join(outDir, "state.json"), JSON.stringify(state, null, 2)),
    writeFile(join(outDir, "index.html"), html),
    writeFile(join(outDir, ".nojekyll"), ""), // serve files as-is, keep dotfiles
]);

process.stderr.write(
    `Wrote index.html + state.json to ${outDir} — ${state.prs.length} open Copilot PR(s)` +
    (state.error ? ` (error: ${state.error})` : "") + ".\n",
);
