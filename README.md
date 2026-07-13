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

| Script              | What it does                                          |
| ------------------- | ----------------------------------------------------- |
| `npm run dev`       | Vite dev server on <http://localhost:5173>            |
| `npm run build`     | Type-check then production build to `dist/`           |
| `npm run preview`   | Serve the production build locally on 5173           |
| `npm run type-check`| `vue-tsc --noEmit`                                    |
| `npm run lint`      | ESLint over `.ts` and `.vue`                          |
| `npm run lint:fix`  | …with `--fix`                                         |
| `npm run format`    | Prettier write                                        |
| `npm test`          | Vitest run (unit + component)                         |
| `npm run test:cov`  | …with v8 coverage to `coverage/`                      |
| `npm run test:e2e`  | Playwright E2E (requires backend running)             |

## Project layout

```
src/
├─ shared/         Cross-cutting code: HTTP client, auth plumbing, UI kit,
│                  Sudoku domain helpers (board codec, conflict detector).
├─ features/       One folder per feature slice (auth, game, daily,
│                  leaderboards, profile, stats). Each contains its own
│                  api/, store/, views/, components/.
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

1. **Auth** — attaches `Authorization: Bearer <accessToken>` for protected
   calls; skipped on `/auth/*` to avoid recursion.
2. **Idempotency** — generates a UUIDv4 `Idempotency-Key` for `POST/PUT/DELETE`,
   memoized per logical call so retries reuse it.
3. **ETag** — `/users` and `/leaderboards` GETs participate in an auth-scoped
   cache: store `{ etag, body, authIdentity }`; send `If-None-Match`; serve
   the cached body on `304`. Cleared on login, logout, and `token_reused`.
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
`Inconsistent` — `Inconsistent` means *"this digit conflicts with another in
the same row/col/box"* and **not** *"this digit is wrong vs. the solution"*.
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

Three workflows in `.github/workflows/` let Copilot iterate on a pull request
before a human is pulled in. Two are
[GitHub Agentic Workflows](https://github.github.com/gh-aw/) (`*.md` compiled to
`*.lock.yml`); the third (`copilot-mark-ready`) is a plain GitHub Actions
workflow (`*.yml`), because its logic is purely deterministic and needs no AI:

| Workflow | Kind | Trigger | What it does |
| --- | --- | --- | --- |
| `copilot-mark-ready` | plain Action | `[WIP]` removed from a **draft** PR title | Marks the PR ready for review (which triggers `copilot-request-review` to request the reviewer) |
| `copilot-request-review` | agentic | New commits pushed to a **non-draft** PR, or a draft becomes ready | Requests the Copilot reviewer |
| `copilot-address-review` | agentic | Copilot reviewer submits a review | If changes are requested, asks `@copilot` to address them; stays silent on clean reviews |

Together they form a loop — review → fix → re-review — until the review comes
back clean. To prevent runaway loops, `copilot-address-review` stops asking
after **3 rounds** and applies the **`copilot-loop-exhausted`** and
**`needs-human-review`** labels; both `copilot-request-review` and
`copilot-address-review` skip PRs that carry `copilot-loop-exhausted`.

**Reset:** remove the `copilot-loop-exhausted` label to resume automation on the
next push.

### Workflow approval on Copilot's pull requests

GitHub gates Actions runs that are *triggered by the Copilot coding agent* (and
other non-write contributors) behind a manual **"Approve workflows to run"**
step — this is a security control and, on Copilot's PRs, it is **not** removed by
the repo's fork-PR approval setting.

`copilot-mark-ready` avoids this by using the **`pull_request_target`** trigger,
which runs in the trusted base-branch context and is therefore not subject to the
approval gate. This is safe only because the workflow never checks out or runs
pull-request-authored code — it just reads the event and calls `gh pr ready`.
**Do not add a PR-code checkout to that workflow.**

The two agentic workflows use ordinary `pull_request` / `pull_request_review`
triggers, so runs they receive directly from a Copilot **bot** event (a
fix-push's `synchronize`, or the reviewer's review) may still show "awaiting
approval" and need a one-click approve. Steps that are chained via the
`GH_AW_GITHUB_TOKEN` PAT (owned by a write-access user) are attributed to that
user and run without approval.

### Required secret: `GH_AW_GITHUB_TOKEN`

These workflows perform their write actions (mark ready, request the Copilot
reviewer, comment `@copilot`, apply labels) through a **user-owned PAT**, not the
default `GITHUB_TOKEN`. A comment or reviewer request authored by
`github-actions[bot]` does **not** wake the Copilot coding agent or reliably
start a Copilot review, so the bot token cannot drive the review→fix loop.

The `GH_AW_GITHUB_TOKEN` secret provides GitHub read/write for all three
workflows — the two agentic ones (gh-aw uses it for safe-output writes) and the
plain `copilot-mark-ready` Action (which passes it as `GH_TOKEN` to `gh pr
ready`). Model inference is separate — it uses `copilot-requests: write`. Create
a **fine-grained PAT owned by a user account with a Copilot license and write
access to this repo**, with these repository permissions, and store it as the
`GH_AW_GITHUB_TOKEN` repository secret:

- **Pull requests: Read and write** — mark ready, add reviewer, PR comments
- **Issues: Read and write** — labels (and PR comments, which use the issues API)
- **Contents: Read** — read repository content

All three workflows reference this secret explicitly, so if it is missing they
fail loudly rather than silently acting as `github-actions[bot]` (whose actions
cannot drive Copilot). Repository triggering, reactions, and status comments
still use the built-in `GITHUB_TOKEN`.

> **Labels:** the workflows apply (but do not create) the `copilot-loop-exhausted`
> and `needs-human-review` labels, so both must exist in the repo. They have
> already been created here; in a new repo run
> `gh label create copilot-loop-exhausted` and `gh label create needs-human-review`.

For the two agentic workflows the `*.md` files are the source of truth; the
committed `*.lock.yml` files are generated by `gh aw compile` and must be
regenerated (not hand-edited) after any frontmatter change. `copilot-mark-ready`
is a plain, hand-maintained `*.yml` workflow (not generated).

