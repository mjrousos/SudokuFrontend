// build-site.mjs — static site generator for the copilot-pr-tracker.
//
// Reads live PR data via the `gh` CLI and writes:
//   <out>/index.html   — self-contained board UI (static/polling mode)
//   <out>/state.json   — snapshot of all open Copilot-authored PRs
//   <out>/.nojekyll    — disables Jekyll processing on GitHub Pages
//
// Usage:
//   node .github/extensions/copilot-pr-tracker/build-site.mjs [--repo=owner/name] [--out=dir]
//
// Environment variables (all optional; flags take precedence):
//   PR_TRACKER_REPO   "owner/name" to track (default: auto-detected from git)
//   PR_TRACKER_OUT    output directory (default: pr-tracker-site)
//   GH_TOKEN          GitHub token for `gh` (default: whatever `gh` uses)

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveRepo, gatherState, COLUMNS } from "./gh.mjs";
import { renderHtml } from "./ui.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// Parse CLI flags: --name=value
const args = process.argv.slice(2);
const flag = (name) => {
    const a = args.find((a) => a.startsWith(`--${name}=`));
    return a != null ? a.slice(name.length + 3) : null;
};

const repoArg = flag("repo") ?? process.env.PR_TRACKER_REPO ?? null;
const outArg = flag("out") ?? process.env.PR_TRACKER_OUT ?? "pr-tracker-site";
const outDir = resolve(process.cwd(), outArg);

// Resolve the repo and gather current PR state.
process.stdout.write(`Resolving repo…\n`);
const repo = await resolveRepo(repoArg, here);
process.stdout.write(`Gathering state for ${repo}…\n`);
const snap = await gatherState(repo, here);

// Attach column metadata so the static page doesn't need the server.
const state = { ...snap, columns: COLUMNS };

// Write output files.
mkdirSync(outDir, { recursive: true });

writeFileSync(resolve(outDir, "state.json"), JSON.stringify(state, null, 2), "utf8");
writeFileSync(resolve(outDir, "index.html"), renderHtml({ mode: "static" }), "utf8");
writeFileSync(resolve(outDir, ".nojekyll"), "", "utf8");

const prCount = snap.prs.length;
process.stdout.write(
    `✓ Generated ${outDir}/\n` +
    `  index.html\n` +
    `  state.json  (${prCount} open PR${prCount === 1 ? "" : "s"}, repo: ${snap.repo})\n` +
    `  .nojekyll\n`,
);
