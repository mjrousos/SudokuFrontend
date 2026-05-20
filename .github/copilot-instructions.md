# Copilot instructions — SudokuFrontend

Vue 3 + TypeScript SPA against the `../SudokuBackend` ASP.NET Core API.
The backend is a **fixed contract**: don't propose backend changes from this
repo. The README is the canonical user-facing doc; this file captures
non-obvious things needed to be productive in the code.

## Commands

Node ≥ 20 (CI uses Node 20). Always run from the repo root.

| Task | Command |
| --- | --- |
| Lint | `npm run lint` (`npm run lint:fix` to auto-fix) |
| Type-check | `npm run type-check` (`vue-tsc --noEmit`) |
| Unit/component tests | `npm test` (Vitest, happy-dom) |
| Single test file | `npx vitest run path/to/file.spec.ts` |
| Single test by name | `npx vitest run -t "name pattern"` |
| Targeted dir | `npx vitest run src/shared/composables src/features/game` |
| Watch | `npm run test:watch` |
| Coverage | `npm run test:cov` (thresholds enforced — see below) |
| E2E | `npm run test:e2e` (requires backend + Docker) |
| E2E UI | `npm run test:e2e:ui` |
| Build | `npm run build` (`vue-tsc --noEmit && vite build`) |
| Dev server | `npm run dev` (port **5173**) |

Before sending a PR run `npm run lint`, `npm run type-check`, `npm test`. CI
also runs `npm run build` and the Playwright suite.

### Coverage scope

`vitest.config.ts` only measures `src/shared/{api,auth,sudoku,composables}`
and `src/features/*/{store,api,logic}`. Thresholds: **lines 90, statements
90, branches 80, functions 90**. Views, layouts, router wiring, and UI
shell are deliberately excluded — they are covered by Playwright. Don't try
to raise unit coverage on those layers; add an E2E spec instead.

### E2E setup

- `playwright.config.ts` runs `webServer: npm run preview` on **5173**
  (preview is pinned to 5173 to match the dev origin so CORS only needs one
  entry).
- `tests/e2e/global-setup.ts` runs `docker compose up -d --build` in
  `../SudokuBackend` and waits for `/health/ready`. Set
  `E2E_SKIP_BACKEND=1` to reuse an already-running backend, or
  `SUDOKU_BACKEND_PATH=…` to point elsewhere.
- The backend has CORS off by default; the setup script injects
  `Cors__AllowedOrigins__{0,1}` for `:5173`/`:4173`.

## Architecture you must know before editing

### Feature-slice layout

```
src/
├─ shared/        api/, auth/, sudoku/, ui/, composables/, config.ts
├─ features/<name>/  api/, store/ (Pinia), views/, components/, logic/
├─ layouts/       DefaultLayout.vue, AuthLayout.vue
├─ router/        index.ts + guards.ts
└─ styles/        Tailwind entrypoint
```

Path alias `@/*` → `src/*` (`tsconfig.app.json`). Always import via `@/…`,
never deep relative paths across feature boundaries.

### HTTP client (`src/shared/api/httpClient.ts`)

A typed `fetch` wrapper with an ordered interceptor pipeline. New backend
calls go through `client.ts` (`installHttpClient` is called by the auth
store at startup). Order matters:

1. **Auth** — adds `Authorization: Bearer …` whenever an access token is
   present, **unless** the caller passes `anonymous: true`. There is no
   path-based special-casing; `/auth/*` endpoints opt out explicitly by
   passing `anonymous: true` (see `src/features/auth/api/authApi.ts`).
   `/auth/refresh` additionally passes `noRefresh: true` so a 401 on the
   refresh call itself doesn't recurse into another refresh attempt.
2. **Idempotency** — `Idempotency-Key` is a UUIDv4 generated for every
   mutating request (`POST/PUT/PATCH/DELETE` — see `MUTATING_METHODS` in
   `httpClient.ts`) and **memoized per logical call** so the refresh-retry
   reuses the same key. Pass `idempotencyKey: '<string>'` to supply your
   own, or `idempotencyKey: null` to explicitly opt out.
3. **ETag cache** — only `/users` and `/leaderboards` GETs participate
   (`isCacheable` in `httpClient.ts`). Entries are `{ etag, body,
   authIdentity }`; on lookup, a mismatched `authIdentity` evicts the
   entry and misses, so a different logged-in user (or an anonymous
   visitor) can't read a previous user's cached body. The cache is
   **fully cleared** on `logout()` and `forceLogout()` (covering
   `manual`, `session_expired`, and `token_reused`) via
   `clearStateLocally`, and on a user-identity switch in `applyTokens`
   (when `user.value.userId` changes). An initial login from an
   anonymous state relies on the per-entry identity-mismatch eviction
   rather than a full flush. If you add another auth-state transition
   that should drop cached bodies, call `etagCache.clear()` explicitly.
4. **Refresh-on-401** — single-flight, **cross-tab** via `navigator.locks`
   (with a localStorage-mutex fallback) and a `BroadcastChannel`. See
   `src/shared/auth/crossTabRefresh.ts` and `authStore.refreshAccessToken`.
   On failure: `forceLogout('session_expired' | 'token_reused')` clears all
   state and redirects to `/login`.
5. **ProblemDetails** — every non-2xx becomes a typed
   `ApiError { status, title, detail, type, fieldErrors }`. Views should
   catch `ApiError` (not generic `Error`) to read `fieldErrors`.

### Cross-tab auth refresh (subtle)

Inside the `withRefreshLock` callback in
`src/features/auth/store/authStore.ts`, **always** `await
new Promise(r => setTimeout(r, 0))` before deciding whether to fire the
network refresh. Without that macrotask yield, a tab waiting on the lock
can enter the critical section before its own `BroadcastChannel` handler
runs, miss the freshly-broadcast token, and trigger the backend's
`token_reused` detection. The store also re-reads `loadPersistedRefresh()`
inside the lock as a belt-and-suspenders guard.

### Token storage

- **Access token**: in-memory only (Pinia state). Never persisted.
- **Refresh token**: `localStorage` (backend requires the client to echo it
  on `/auth/refresh`). XSS risk is mitigated by strict CSP + no `v-html`
  on user content. Don't add `v-html` on user-controlled strings.

### Sudoku domain

- Boards are 81-char strings on the wire (`0`–`9`, `0` = empty).
  `src/shared/sudoku/boardCodec.ts` is the only place that should
  encode/decode; `conflicts.ts` does client-side row/col/box duplicate
  detection.
- `MoveResponse.evaluation` is `Consistent | Inconsistent`. `Inconsistent`
  means **"conflicts with another digit in the same row/col/box"**, not
  "wrong vs. the solution". Only `POST /games/{id}/solution` tells you the
  puzzle is actually solved.
- Moves go through a **per-game serial FIFO queue**
  (`src/features/game/logic/moveQueue.ts`) because the server uses a
  strictly monotonic `moveNumber`; parallel POSTs return 409 stale-move.
  On 409 the store refetches canonical state before draining further.

### Router

`src/router/index.ts` — Vue Router matches in declaration order, so
`/leaderboards/daily` **must** be declared before
`/leaderboards/:difficulty`, otherwise `daily` is captured as a difficulty
value. Auth guards use route `meta`: `requiresAuth: true` and
`guestOnly: true` (see `router/guards.ts`).

## Conventions

- **Vue 3 `<script setup lang="ts">`** everywhere. Stores are
  setup-function Pinia (`defineStore('name', () => { … })`), not options
  style.
- **Strict TS** with `noUncheckedIndexedAccess`, `verbatimModuleSyntax`,
  and `useUnknownInCatchVariables`. Use `import type { … }` for type-only
  imports; narrow caught `unknown` with `instanceof ApiError` etc.
- **Forms**: VeeValidate + Zod schemas. Surface server `fieldErrors` from
  `ApiError` into the form rather than a top-level toast.
- **Styling**: Tailwind utility classes; dark mode is `class` strategy
  (toggled at the `<html>` element). No CSS modules / scoped styles unless
  unavoidable.
- **Attribute fallthrough on Teleport/Transition roots**: when a component
  template's root is `<Teleport>` or `<transition>` (no single DOM root),
  attribute/`data-testid` fallthrough silently drops. Use
  `defineOptions({ inheritAttrs: false })` and `v-bind="$attrs"` on the
  inner DOM element. `src/shared/ui/AppModal.vue` is the canonical
  example — copy that pattern for any new modal/teleporting component so
  Playwright `data-testid` selectors land where expected.
- **Tests**: colocate `*.spec.ts` next to source under `src/`; integration
  specs live under `tests/unit/`. `tests/unit/setup.ts` resets Pinia and
  the HTTP client between every test — don't rely on cross-test state.
  Use MSW for network mocking in component tests.
- **Playwright `page.route()`**: prefer **URL function predicates**
  (`(url) => url.pathname.endsWith('/users/me/stats')`) over glob strings
  — globs against absolute URLs have silently failed to match in this
  repo's Playwright version. See `tests/e2e/refresh.spec.ts` for examples.
- **Playwright rate-limit isolation**: every test gets a unique
  `X-Forwarded-For` via the `forwardedFor` fixture in
  `tests/e2e/fixtures.ts` so the backend's per-IP auth rate limit
  (10/min) doesn't bleed across tests. Any helper that hits the backend
  directly (e.g., `tests/e2e/util/api.ts`) must accept and forward it.
- **Config**: read env via `src/shared/config.ts` (`API_BASE_URL`,
  `API_V1`), not `import.meta.env` directly, so trailing-slash and
  `/api/v1` suffix handling stay in one place.
