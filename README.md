# Sudoku Frontend

A Vue 3 + TypeScript single-page application for the
[SudokuBackend](../SudokuBackend) ASP.NET Core API. The frontend lets users
register, sign in, play Sudoku in Practice / Ranked / Daily modes, view
leaderboards, and manage their account.

> This repository contains the frontend only. The backend lives at
> `../SudokuBackend` and is treated as a fixed contract — changes to the
> backend are out of scope.

## Stack

- **Vue 3** (Composition API, `<script setup>`) + **TypeScript** (strict)
- **Vite** for dev / build / preview
- **Pinia** for state, **Vue Router 4** for routing
- **Tailwind CSS** for styling (dark mode via `class` strategy with a
  Light / Dark / System toggle — see [Theming](#theming) below)
- **VeeValidate + Zod** for typed form validation
- **Vitest + @vue/test-utils + MSW + happy-dom** for unit & component tests
- **Playwright** for end-to-end tests

## Prerequisites

- **Node.js ≥ 20** (Node 22 LTS recommended). `nvm`/`fnm` users: `nvm use`.
- **npm ≥ 10** (ships with Node 20+).
- **Docker** (only needed to run the backend locally and for the E2E suite).
- The [`SudokuBackend`](../SudokuBackend) repository checked out alongside
  this one as `../SudokuBackend` (for E2E tests and local development).

## Quick start

```powershell
npm ci
copy .env.example .env       # adjust VITE_API_BASE_URL if not localhost:8080
npm run dev
```

Then open <http://localhost:5173>.

### Configuring the backend

The backend has CORS **off by default** — you must add this frontend's origin
to `Cors__AllowedOrigins` before it will accept browser requests. The easiest
way is via environment variables when you start the backend:

```powershell
# From ../SudokuBackend
$env:Cors__AllowedOrigins__0 = "http://localhost:5173"
$env:Cors__AllowedOrigins__1 = "http://localhost:4173"   # only needed if you use `npm run preview`
docker compose up --build
```

> **Why 4173?** Vite's `npm run preview` defaults to port 4173 unless we pin
> it. This project pins preview to **5173** to match the dev origin, so most
> people only need `__0` — but leaving `__1` in place doesn't hurt.

## Available scripts

| Script                 | What it does                                 |
| ---------------------- | -------------------------------------------- |
| `npm run dev`          | Vite dev server on <http://localhost:5173>   |
| `npm run build`        | Type-check then production build to `dist/`  |
| `npm run preview`      | Serve the production build locally on 5173   |
| `npm run type-check`   | `vue-tsc --noEmit`                           |
| `npm run lint`         | ESLint over `.ts`, `.vue`, `.js`, and `.cjs` |
| `npm run lint:fix`     | …with `--fix`                                |
| `npm run format`       | Prettier write                               |
| `npm run format:check` | Prettier check (no writes)                   |
| `npm test`             | Vitest run (unit + component)                |
| `npm run test:watch`   | Vitest in watch mode                         |
| `npm run test:cov`     | …with v8 coverage to `coverage/`             |
| `npm run test:e2e`     | Playwright E2E (requires backend running)    |
| `npm run test:e2e:ui`  | …with the Playwright UI                      |

This table mirrors `package.json` scripts; keep it and any CI/dev docs in sync
when commands change.

## Project layout

```
src/
├─ shared/         Cross-cutting code: HTTP client, auth plumbing, UI kit,
│                  Sudoku domain helpers (board codec, conflict detector).
├─ features/       One folder per feature slice (auth, daily, game, home,
│                  leaderboards, profile, stats). Most slices contain
│                  api/, store/, views/, and/or components/ sub-folders;
│                  the lightweight `home` slice keeps its views at the
│                  top level.
├─ layouts/        Top-level layouts (default chrome, auth chrome).
├─ router/         Route table + navigation guards.
└─ styles/         Tailwind entrypoint.

tests/
├─ unit/           Vitest setup & extra integration specs.
└─ e2e/            Playwright specs + page objects + global setup/teardown.
```

## Architecture highlights

### HTTP client

A thin, typed wrapper around `fetch` (`src/shared/api/httpClient.ts`) drives
every backend call through an ordered interceptor pipeline:

1. **Auth** — attaches `Authorization: ****** for protected
   calls. The flags live on `RequestOptions` in
   `src/shared/api/httpClient.ts`: `anonymous: true` skips header injection,
   while `noRefresh: true` only disables refresh-on-401 retry behavior (it
   does not imply `anonymous`). Auth endpoints opt out explicitly (`/auth/*`
   passes `anonymous: true`, and `/auth/refresh` also passes `noRefresh: true`
   to avoid recursive refresh attempts).
2. **Idempotency** — generates a UUIDv4 `Idempotency-Key` for `POST/PUT/DELETE`,
   memoized per logical call so retries reuse it.
3. **ETag** — `/users` and `/leaderboards` GETs participate in an auth-scoped
   cache: store `{ etag, body, authIdentity }`; send `If-None-Match`; serve
   the cached body on `304`. Cleared on logout and `token_reused`; also
   cleared in `authStore.applyTokens` when `user.value.userId !== res.userId`
   (the concrete "identity switch" check for token responses representing a
   different account).
4. **Refresh** — on 401 from a protected call, a **single-flight, cross-tab**
   refresh runs through `navigator.locks` (with a localStorage-mutex
   fallback) and a `BroadcastChannel` so that multiple tabs sharing the same
   rotating refresh token never trip the backend's reuse detector. Failures
   force a redirect to `/login` and clear all auth state.
5. **ProblemDetails** — non-2xx responses are normalized to a typed
   `ApiError { status, title, detail, type, fieldErrors }` for views.

### Token storage

- **Access token** lives only in memory (Pinia state, not persisted).
- **Refresh token** is stored in `localStorage` because the backend's
  contract requires the client to send it back on `/auth/refresh`. We
  mitigate XSS risk with a strict CSP, no `v-html` on user content, and a
  `npm audit` step in CI.

### Game play

The Sudoku board is encoded as an 81-character string (`0`–`9`, `0` =
empty) on the wire. `src/shared/sudoku/boardCodec.ts` converts to/from a
`Cell[][]` grid; `conflicts.ts` flags row/column/box duplicates client-side
for instant feedback.

Moves go through a **per-game serial queue** (`features/game/logic/moveQueue.ts`)
so that fast keyboard input cannot race `nextMoveNumber` on the wire. The
server's `MoveResponse.evaluation` is either `Consistent` or
`Inconsistent` — `Inconsistent` means _"this digit conflicts with another in
the same row/col/box"_ and **not** _"this digit is wrong vs. the solution"_.
The UI surfaces conflicts but only the final `POST /games/{id}/solution`
call tells us whether the user has actually solved the puzzle.

### Theming

The app ships with a tri-state theme toggle (Light / Dark / **System**,
default) wired into both the main header and the auth-screen layout. The
implementation has three parts:

- **`public/theme-init.js`** — a tiny dependency-free script referenced
  from `<head>` in `index.html`. Runs synchronously before the app
  mounts, reads the saved preference from `localStorage['sudoku.theme']`,
  resolves `system` against `prefers-color-scheme`, and applies the
  `dark` class on `<html>` plus `style.colorScheme`. This eliminates the
  flash of the wrong theme on reload. It is a separate file (not inline)
  because the CSP uses `script-src 'self'` with no nonce.
- **`src/shared/composables/useTheme.ts`** — module-level singleton that
  exposes the current `preference`, the `resolved` `'light'`/`'dark'`,
  `setPreference`, and `cyclePreference`. Listens to
  `matchMedia('(prefers-color-scheme: dark)')` so the page updates live
  when the OS theme changes (only while preference is `'system'`).
  Initialized once from `main.ts`.
- **`src/shared/ui/ThemeToggle.vue`** — single-button cycler used in
  `AppHeader.vue` and `AuthLayout.vue`. Carries
  `data-testid="theme-toggle"` plus `data-theme-preference` and
  `data-theme-resolved` for Playwright.

The storage key is **`sudoku.theme`** and values are `'light' | 'dark' |
'system'`; anything else is treated as `'system'`. If `localStorage`
throws (Safari private mode, disabled storage), the toggle still works
in-memory for the session.

## Out of scope

- Offline / PWA support
- Internationalization
- Real-time multiplayer
- Server-side rendering

## Contributing

Run `npm run lint`, `npm run type-check`, and `npm test` before sending a
PR. The CI workflow runs the same plus a production build.

## Automated Copilot PR review

A single scheduled **reconciler** (`.github/workflows/copilot-reconciler.yml`) lets
Copilot iterate on a pull request before a human is pulled in. It is a plain GitHub
Actions workflow that, on each run, executes one well-commented Node script
(`.github/scripts/copilot-reconcile.mjs`) — all the logic lives there. It scans open,
non-fork PRs **authored by the Copilot coding agent** and applies the following deterministic
scenarios per PR:

| Scenario              | When                                                                                                       | What it does                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Mark ready**        | PR is a **draft** whose title no longer contains `[WIP]`                                                   | Marks it ready for review (`gh pr ready`)                                                                                 |
| **Request review**    | PR is **non-draft** with new commits since the last Copilot review (and no current re-review is in flight) | Requests the Copilot reviewer for the current head; replaces a stale duplicate request left behind by a completed review  |
| **Address review**    | The latest Copilot review is for the current head and has **unresolved review threads**                    | Comments mentioning `@copilot` to address the feedback                                                                    |
| **Hand off to human** | The latest Copilot review is for the current head and is **clean** (no unresolved threads)                 | Adds the **`needs-human-review`** label and a short comment noting Copilot is done and a human should do the final review |

Together they form a loop — mark ready → request review → address feedback →
(Copilot pushes a fix) → re-review — until a review comes back clean, at which point the
PR is labelled **`needs-human-review`** for a human's final pass. To prevent runaway
loops, the reconciler also stops asking after **5 rounds** on a PR and applies the
**`copilot-loop-exhausted`** and **`needs-human-review`** labels; a PR carrying
`copilot-loop-exhausted` is then skipped entirely.

Both the clean hand-off and the exhaustion hand-off are idempotent: the label plus a
hidden per-review marker in the comment mean a PR is flagged at most once per clean
review, so consecutive ~15-min ticks don't repeat it.

Because the reconciler runs on a schedule and reconciles the full PR state on every
tick, it does not depend on one workflow chaining to another — a single pass can mark a
draft ready and request its first review.

**Actionable = unresolved threads (not review state).** The Copilot reviewer submits
reviews with state `COMMENTED` even when they contain actionable inline comments, so the
reconciler detects "changes requested" from **unresolved review threads**, not the review
state. A review with zero unresolved threads is treated as _not_ actionable for `@copilot`
prodding; if it is for the current head, the reconciler instead hands off to a human.

**Idempotency.** Every action is gated by an idempotent predicate (draft state,
requested-reviewer presence, the latest review's commit vs. the current head, and a hidden
`<!-- copilot-reconcile: addressed-review=… -->` marker embedded in our own comments), so
re-running every ~15 minutes never duplicates work. `@copilot` is prodded at most once per
Copilot review.

**Dry run.** Manual `workflow_dispatch` runs default to `dry_run: true` — the script
_reports_ the actions it would take (and writes them to the run's job summary) without
performing any writes. Scheduled runs perform writes.

**Reset:** remove the `copilot-loop-exhausted` label to resume automation on the next run.

### Workflow approval on Copilot's pull requests

GitHub does **not** run Actions automatically on events triggered by the Copilot
coding agent — a write-access user must click **"Approve and run workflows"**.
This gate keys on the _triggering actor_ being Copilot, so it applies to both
`pull_request` and `pull_request_target` and **cannot** be disabled by a
repository setting (it is separate from, and stricter than, the fork-PR approval
setting).

The reconciler sidesteps this entirely by running on a **schedule** rather than on a
Copilot-authored PR event: a cron run is triggered by GitHub (not Copilot) in the trusted
base context, so it is never gated. It runs at :03/:18/:33/:48 (~every 15 min, off the
hour): `schedule` delivery is best-effort, and GitHub throttles high-frequency crons
(e.g. `*/5`) and top-of-hour slots hardest, so this cadence is delivered more reliably.
Trade-off: up to ~15 minutes of latency before a paused PR is nudged forward.

All of the reconciler's writes are performed with the `GH_AW_GITHUB_TOKEN` PAT (owned by a
write-access user), so they are attributed to that user and run without approval — and,
crucially, an `@copilot` mention from a real user actually wakes the coding agent.
(Copilot's own reviewer and coding-agent runs are GitHub-managed "dynamic" workflows, not
ours, so they are never subject to _our_ approval gate.)

### Required secret: `GH_AW_GITHUB_TOKEN`

The reconciler performs its write actions (mark ready, request the Copilot reviewer,
comment `@copilot`, apply labels) through a **user-owned PAT**, not the default
`GITHUB_TOKEN`. A comment or reviewer request authored by `github-actions[bot]` does
**not** wake the Copilot coding agent or reliably start a Copilot review, so the bot token
cannot drive the review→fix loop.

Create a **fine-grained PAT owned by a user account with a Copilot license and write
access to this repo**, with these repository permissions, and store it as the
`GH_AW_GITHUB_TOKEN` repository secret:

- **Pull requests: Read and write** — mark ready, add reviewer, PR comments
- **Issues: Read and write** — labels (and PR comments, which use the issues API)
- **Contents: Read** — read repository content

The workflow passes it to the script as `GH_TOKEN` and blanks the built-in `GITHUB_TOKEN`
(`GITHUB_TOKEN: ""`) so `gh` cannot silently fall back to the bot token; if the secret is
missing the workflow fails loudly rather than acting as `github-actions[bot]`.

> **Labels:** the reconciler applies (but does not create) the `copilot-loop-exhausted`
> and `needs-human-review` labels, so both must exist in the repo. They have
> already been created here; in a new repo run
> `gh label create copilot-loop-exhausted` and `gh label create needs-human-review`.

The reconciler is a plain, hand-maintained workflow + script (no code generation /
`gh aw compile` step). The `.github/aw/` scaffolding is retained for possible future
[GitHub Agentic Workflows](https://github.github.com/gh-aw/), but no agentic workflows
currently exist; see `plans/copilot-reconciler-cron-workflow.md` for the design and
`plans/copilot-pr-automation-agentic-workflows.md` for the superseded agentic approach.

## Copilot PR tracker

A companion **dashboard** visualizes where every open, Copilot-authored PR sits in
the reconciler's loop. It reads the same signals the reconciler acts on (draft/`[WIP]`
state, requested reviewers, the latest Copilot review, unresolved review threads, and
the `needs-human-review` / `copilot-loop-exhausted` labels) and lays the PRs out on a
board with four columns:

| Column                     | Meaning                                                         |
| -------------------------- | --------------------------------------------------------------- |
| **Work in progress**       | Draft PR still carrying `[WIP]` — Copilot is still working      |
| **In Copilot review**      | Handed to the Copilot reviewer; awaiting or processing a review |
| **Addressing feedback**    | Has unresolved review threads Copilot is working through        |
| **Ready for human review** | Review came back clean (or the loop was exhausted) — your turn  |

It is **read-only** — it never writes to PRs, so it needs only read access and never
touches the reconciler's PAT. All the state derivation lives in one place
(`.github/extensions/copilot-pr-tracker/gh.mjs`) and the board renderer in `ui.mjs`,
and the three surfaces below all reuse them so they can't drift apart.

### 1. Canvas (GitHub Copilot App)

`.github/extensions/copilot-pr-tracker/` is a Copilot CLI **canvas extension**. Open the
**Copilot PR tracker** canvas in the app to get the live board in a side panel, with a
Refresh button and live updates over Server-Sent Events. Nothing to install beyond the
app — it auto-detects this repo.

### 2. Website (GitHub Pages)

For anyone **without** the Copilot App, the same board is published as a static site by
`.github/workflows/pr-tracker-pages.yml`:

**<https://mjrousos.github.io/SudokuFrontend/>**

The workflow runs the generator (`build-site.mjs`) on a schedule (twice hourly), on
pushes to `main` that touch the tracker, and on demand (**Actions → Copilot PR tracker
site → Run workflow**). It writes `index.html` + `state.json` and deploys them with the
built-in `GITHUB_TOKEN` (scoped to read-only repo/PR permissions) — **no PAT required** (unlike the reconciler, it only
reads). The page re-fetches its snapshot every few minutes.

> **First-time activation:** the schedule and Pages deploy only take effect once this
> workflow is on the **default branch** (`main`) — GitHub runs `schedule` triggers only
> from the default branch. The workflow enables Pages itself (`configure-pages` with
> `enablement: true`); if your org disables that, set **Settings → Pages → Source =
> GitHub Actions** once.

### 3. Standalone local server

To run the live board yourself without the app, start the bundled server (needs Node and
an authenticated [`gh`](https://cli.github.com/) — or a `GH_TOKEN` env var):

```bash
node .github/extensions/copilot-pr-tracker/server.mjs
# then open http://127.0.0.1:8123/
```

Flags: `--repo owner/name` (default: auto-detect from the repo), `--port` (default
`8123`, or `PORT`), `--host` (default `127.0.0.1`, or `HOST`). It serves the same live
`/api/state`, `/api/refresh`, and SSE `/events` endpoints the canvas uses.

### Theme (light / dark)

Inside the Copilot App the canvas follows the app's synced light/dark theme
automatically. The **website** and **local server** add their own **Auto / Light / Dark**
toggle in the header — Auto follows your OS preference, and an explicit choice is
remembered per browser (`localStorage`). The toggle only appears when the board is served
standalone; it stays hidden in the canvas so the app keeps driving the theme.
