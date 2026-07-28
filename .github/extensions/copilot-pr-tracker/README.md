# copilot-pr-tracker

A board that tracks open, Copilot-authored pull requests and the lifecycle state
the repo's reconciler moves them through — so you can see at a glance which PRs
are still cooking and which are waiting on you.

Available on **three surfaces** that all share the same state-derivation logic:

| Surface | How to access |
| --- | --- |
| **Copilot CLI canvas** | Ask the Copilot CLI to open the **Copilot PR tracker** canvas |
| **Local web server** | `node .github/extensions/copilot-pr-tracker/server.mjs` |
| **GitHub Pages** | <https://mjrousos.github.io/SudokuFrontend/> *(updates hourly)* |

It is a read-only companion to
[`.github/scripts/copilot-reconcile.mjs`](../../scripts/copilot-reconcile.mjs)
(run by the [Copilot PR reconciler](../../workflows/copilot-reconciler.yml)
workflow). The reconciler *moves* PRs along; this canvas *observes* where each
one currently sits. The Copilot author/reviewer detection here is kept in sync
with that script.

## Opening it

### Copilot CLI canvas

In a Copilot CLI session in this repo, ask the agent to open the
**Copilot PR tracker** canvas, or drive it directly:

- `open_canvas` → `canvasId: "copilot-pr-tracker"`
- `invoke_canvas_action` → `actionName: "refresh"` re-fetches and returns a
  summary (also updates any open panel).

The board also auto-refreshes every ~45 s while visible and has a **Refresh**
button. It targets the current repository by default; pass
`{ "repo": "owner/name" }` as open/action input to point elsewhere.

### Local web server

```sh
node .github/extensions/copilot-pr-tracker/server.mjs
# → Copilot PR tracker → http://127.0.0.1:3000/
```

Flags (all optional):

| Flag | Env var | Default |
| --- | --- | --- |
| `--repo=owner/name` | `PR_TRACKER_REPO` | auto-detected via `gh repo view` |
| `--port=N` | `PORT` | `3000` |
| `--host=H` | `HOST` | `127.0.0.1` |

Requires an authenticated `gh` on `PATH`.

### GitHub Pages (static)

The [pr-tracker-pages workflow](../../workflows/pr-tracker-pages.yml) runs
hourly (and on every push to `main` that touches the tracker) to regenerate and
publish a static snapshot:

```
https://mjrousos.github.io/SudokuFrontend/
```

The static page polls `state.json` every 5 minutes; click **Refresh** to reload
the snapshot immediately. Because the data is pre-built, the page reflects state
as of the last workflow run rather than live API data.

**First-run activation**: GitHub only runs `schedule` triggers from the default
branch (`main`) and Pages is enabled by the workflow itself (`configure-pages`
with `enablement: true`). If an org policy blocks automatic enablement, go to
**Settings → Pages → Source** and select **GitHub Actions** once.

To regenerate the static site locally:

```sh
node .github/extensions/copilot-pr-tracker/build-site.mjs
# writes index.html + state.json + .nojekyll → pr-tracker-site/
```

## The board

PRs are grouped into four columns that track the reconciler's progression:

| Column | State(s) | Meaning |
| --- | --- | --- |
| **Work in progress** | `wip`, `marking-ready` | Draft. `wip` = title still has `[WIP]`; `marking-ready` = `[WIP]` removed, so the reconciler will publish it next run. |
| **In Copilot review** | `awaiting-review`, `awaiting-rereview`, `in-review` | Non-draft. Copilot Code Review has been (or is about to be) requested for the current head. |
| **Addressing feedback** | `addressing-feedback` | The latest Copilot review on the current head left unresolved threads; `@copilot` has been prodded to address them. |
| **Ready for human review** | `review-clean`, `ready-for-human`, `ready-exhausted` | Copilot is done. `needs-human-review` (clean review) or `copilot-loop-exhausted` (hit the reconciler's round cap) — a human should take the final look. |

## Requirements

- The GitHub CLI (`gh`) on `PATH`, authenticated (the CLI inherits the host's
  `gh`/`GH_TOKEN`). Reads only: `gh pr list`, `gh api .../pulls/...`, and a
  GraphQL query for review threads.

## Files

- `extension.mjs` — canvas SDK wiring: declaration, per-instance loopback HTTP
  server, and the `refresh` action.
- `server-core.mjs` — shared HTTP core: snapshot cache, single-flight refresh,
  SSE broadcast, and request routing. Used by `extension.mjs` and `server.mjs`.
- `server.mjs` — standalone local web server (`node server.mjs`).
- `build-site.mjs` — static site generator for GitHub Pages.
- `gh.mjs` — `gh` data access + PR state derivation (mirrors the reconciler).
- `ui.mjs` — self-contained, themed iframe renderer (live SSE mode for canvas /
  local server; static polling mode for GitHub Pages).

These `.mjs` files sit outside the app's ESLint globs, every `tsconfig`
`include`, and the Vite build, so they don't affect `npm run lint` /
`type-check` / `build`.
