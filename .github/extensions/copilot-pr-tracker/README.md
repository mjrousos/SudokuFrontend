# copilot-pr-tracker

A Copilot CLI **canvas extension** that shows a live board of open,
Copilot-authored pull requests and the lifecycle state the repo's reconciler
moves them through — so you can see at a glance which PRs are still cooking and
which are waiting on you.

It is a read-only companion to
[`.github/scripts/copilot-reconcile.mjs`](../../scripts/copilot-reconcile.mjs)
(run by the [Copilot PR reconciler](../../workflows/copilot-reconciler.yml)
workflow). The reconciler *moves* PRs along; this canvas *observes* where each
one currently sits. The Copilot author/reviewer detection here is kept in sync
with that script.

## Opening it

In a Copilot CLI session in this repo, ask the agent to open the
**Copilot PR tracker** canvas, or drive it directly:

- `open_canvas` → `canvasId: "copilot-pr-tracker"`
- `invoke_canvas_action` → `actionName: "refresh"` re-fetches and returns a
  summary (also updates any open panel).

The board also auto-refreshes every ~45s while visible and has a **Refresh**
button. It targets the current repository by default; pass
`{ "repo": "owner/name" }` as open/action input to point elsewhere.

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

- `extension.mjs` — wiring: canvas declaration, per-instance loopback HTTP
  server, SSE, and the `refresh` action.
- `gh.mjs` — `gh` data access + PR state derivation (mirrors the reconciler).
- `ui.mjs` — the self-contained, themed iframe renderer.

These `.mjs` files sit outside the app's ESLint globs, every `tsconfig`
`include`, and the Vite build, so they don't affect `npm run lint` /
`type-check` / `build`.
