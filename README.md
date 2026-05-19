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
- **Tailwind CSS** for styling (dark mode via `class` strategy)
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

## Out of scope

- Offline / PWA support
- Internationalization
- Real-time multiplayer
- Server-side rendering

## Contributing

Run `npm run lint`, `npm run type-check`, and `npm test` before sending a
PR. The CI workflow runs the same plus a production build.
