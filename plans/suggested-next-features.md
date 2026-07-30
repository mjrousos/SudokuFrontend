# Suggested next features

Ten ideas for evolving **SudokuFrontend**, distilled from a survey of how other
Sudoku apps work. The research pass (run by a research sub-agent) covered
sudoku.com, NYT Sudoku, sudoku.coach, websudoku, Andoku, Enjoy Sudoku,
Good Sudoku (Zach Gage), Cracking the Cryptic / SudokuPad, f-puzzles,
sudokuexchange.com and sudokuwiki.org, plus the WAI-ARIA grid pattern, WCAG 2.1
and the Workbox PWA guidance. Findings are attributed by app name below rather
than by deep link, since app UIs shift between releases.

**Ground rules used when picking these ideas**

- The backend (`../SudokuBackend`) is a **fixed contract**. Anything requiring a
  new endpoint is called out explicitly and pushed to the "parked" list.
- Ideas are scored against what the app already does today: 81-char board codec
  (`src/shared/sudoku/boardCodec.ts`), client conflict detection
  (`conflicts.ts`), pencil marks (`Cell.notes`), a server fill-hint, a serial
  per-game move queue (`src/features/game/logic/moveQueue.ts`), a server-side
  timer for Ranked/Daily, Light/Dark/System theming, leaderboards and stats.
- Effort is a rough T-shirt size for this codebase, not a commitment.

| # | Idea | Effort | Backend needed? |
| --- | --- | --- | --- |
| 1 | Undo / redo | M | No |
| 2 | Persist in-progress board state & notes | S | No |
| 3 | Smart pencil marks (auto-candidates + auto-erase) | M | No |
| 4 | Number pad upgrades: remaining-count badges + digit-first input | S–M | No |
| 5 | Client-side solver → coaching hints | L | No |
| 6 | Assist & difficulty settings panel | M | No |
| 7 | Feedback and completion polish | S | No |
| 8 | Accessibility round two | S–M | No |
| 9 | PWA / offline app shell | M | No (shell only) |
| 10 | Streak, calendar and stats visualisation | M | No |

---

## 1. Undo / redo

**What other apps do.** Every mainstream app has it: sudoku.com (`Ctrl+Z` /
`Ctrl+Y` plus toolbar buttons), NYT, Good Sudoku and SudokuPad. SudokuPad and
sudoku.com include **pencil-mark changes** in the same stack, which is what lets
players experiment fearlessly. sudoku.coach caps the stack (~50 entries) to bound
memory. Good Sudoku also rolls back the *displayed* hint count when a hint is
undone.

**Why here.** It is the single most conspicuous omission versus the industry
baseline — the toolbar today offers pause / hint / submit / abandon only.

**How it fits our contract.** The server has a strictly monotonic
`nextMoveNumber` and no "rewind" route, so undo cannot rewrite server history.
Model it as a **compensating move**: undoing a placement posts `value: 0` for
that cell (and redo re-posts the digit) through the existing per-game
`moveQueue`, while the local stack holds
`{ row, col, prevValue, nextValue, prevNotes, nextNotes }`. Notes-only entries
never touch the network. Server-visible counters (`mistakeCount`, `hintCount`,
`isAssisted`) stay authoritative and must **not** be decremented locally.

**Watch out for:** interleaving with in-flight moves (push onto the same FIFO
queue), a 409 stale-move refetch invalidating the stack (clear it on canonical
refetch), and disabling undo once a game is `Completed`/`Abandoned`.

## 2. Persist in-progress board state and notes across reloads

**What other apps do.** sudoku.com, sudoku.coach and SudokuPad all restore your
grid *and* your candidate marks after a reload or a tab crash; losing notes is
one of the loudest complaints in app-store reviews when it happens.

**Why here.** Placements survive (the server owns `currentBoard`), but
`setCellNotes` is an in-memory Pinia mutation — a refresh silently throws away
every pencil mark, which is often more work than the digits themselves.

**Shape.** A small `localStorage` slice keyed by `gameId`
(e.g. `sudoku.notes.<gameId>`), serialising notes as a compact per-cell digit
string, rehydrated after `fetchGame` and reconciled against `currentBoard`
(notes for cells the server shows as filled are dropped). Add a size/age cap and
evict entries for games that come back `Completed`/`Abandoned`. Follow the
existing storage conventions in `src/shared/auth/tokenStorage.ts`, including
tolerating a throwing `localStorage` (Safari private mode). Nothing
user-sensitive is stored beyond puzzle progress.

## 3. Smart pencil marks: auto-candidates and auto-erase

**What other apps do.** sudoku.com ships "Auto Candidates" and "Auto-Remove
Notes" as separate toggles; sudoku.coach renders auto-generated candidates in a
lighter colour so you can tell them from your own; Good Sudoku keeps candidates
always-on as a design philosophy ("let the computer do the bookkeeping"); NYT
deliberately omits them to keep difficulty honest. CTC/SudokuPad splits **corner**
marks (a shortlist) from **centre** marks (the candidate set).

**Why here.** We already render a 3×3 note grid and have `conflicts.ts` doing
row/col/box analysis — computing candidates is the same peer scan.

**Shape.** A `candidates.ts` helper in `src/shared/sudoku/` returning the legal
digits per empty cell; two independent, off-by-default toggles (populate
candidates; erase a digit from peers' notes when it is placed) with a distinct
style for machine-generated marks. Optionally add the corner/centre split later.
These are pure client conveniences and do **not** affect the server's
`isAssisted` flag — decide and document whether we want to surface that
asymmetry to players.

## 4. Number pad upgrades: remaining-count badges and digit-first input

**What other apps do.** Nearly every polished app shows how many of each digit
are still unplaced and dims a digit once all nine are down (sudoku.com,
sudoku.coach). On touch devices, sudoku.com, NYT and Andoku default to
**digit-first** entry (pick a digit, then tap cells to paint it) because number
pad buttons are a far larger tap target than a 1/9-width cell; sudoku.coach
offers both modes as a remembered preference. Enjoy Sudoku long-presses a pad
button to place a note instead of a value.

**Why here.** The remaining-count badge is a handful of lines over the existing
board string, and our current input is cell-first only, which is the weaker
mobile ergonomic.

**Shape.** A computed digit histogram from `currentBoard` feeding badges plus a
disabled/dimmed state at zero; an input-mode preference (`cell-first` /
`digit-first`, defaulting by pointer type) persisted in `localStorage` alongside
the theme preference. Keep the keyboard path unchanged and keep `aria-pressed`
semantics on the selected digit.

## 5. Client-side solver powering coaching hints

**What other apps do.** sudokuwiki.org is the canonical step-by-step solver: it
applies techniques cheapest-first and explains each one in words ("Naked single
in r4c6: only 7 remains"), highlighting the deducing cells and the eliminated
candidates. sudoku.coach uses the same idea for hints *and* for its lessons.
Good Sudoku shows only that *a* technique is available, leaving the deduction to
the player.

**Why here.** Our hint endpoint fills a cell for you: maximum spoiler, zero
teaching, and it permanently sets `isAssisted`. A local solver enables a
*graduated* hint ladder: nudge ("there is a hidden single in box 5") → explain
("the 4s in box 5 are confined to row 6, so 4 leaves the rest of row 6") →
reveal (the existing server hint, the only rung that costs `hintCount`).

**Shape.** A pure, well-tested `src/shared/sudoku/solver/` module covering the
cheap techniques that dominate Easy–Hard puzzles (naked/hidden singles, naked
and hidden pairs/triples, pointing pairs, box/line reduction, and optionally
X-Wing), each step returning a machine-readable `{ technique, cells,
eliminations, explanation }` so the board can highlight it. Pure logic in
`src/shared/sudoku` sits inside the coverage-enforced scope, which suits
table-driven unit tests. This is the largest item on the list — treat the solver
and the hint UI as two separate PRs.

## 6. Assist and difficulty settings panel

**What other apps do.** The spectrum of mistake feedback is itself a feature:
sudoku.com defaults to instant red highlighting but offers count-only mode; NYT
strips highlighting on Hard/Expert; Good Sudoku has a soft amber "peer warning"
middle setting; Andoku and Enjoy Sudoku offer a three-strikes "lives" mode. NYT
also auto-advances the cursor to the next empty cell after entry — divisive
enough that it belongs behind a toggle.

**Why here.** We hard-code one assist profile (always highlight conflicts,
always highlight peers and same values). Making it a preference lets one build
serve beginners and purists, and it is display logic only — `mistakeCount` and
`Inconsistent` still come from the server.

**Shape.** A settings modal (reuse `AppModal.vue`, including its
`inheritAttrs: false` + `v-bind="$attrs"` pattern) writing a single persisted
preferences object: conflict display mode, peer/same-value highlighting,
auto-advance cursor, three-strike mode, plus the toggles from ideas 3 and 4.
A `useSettings` composable in `src/shared/composables/` matching the `useTheme`
singleton pattern keeps it testable and inside the coverage scope.

## 7. Feedback and completion polish

**What other apps do.** sudoku.com flashes a cell green on a good placement and
red-shakes a bad one, then fires a particle burst on completion; NYT drops
confetti and springs the stats card in, with a "celebrations" toggle for people
who don't want motion; Good Sudoku's staggered left-to-right "wave fill" on
completion is the most-praised finishing animation in the genre; sudoku.coach
deliberately does none of it.

**Why here.** Our completion experience is a modal (`CompletionDialog.vue`), and
a `Consistent` / `Inconsistent` response currently lands with no transient
feedback at all.

**Shape.** CSS keyframes with staggered `animation-delay` for the completion
wave, a short per-cell flash keyed off `MoveResponse.evaluation`, and — this is
the part that must not be skipped — a `@media (prefers-reduced-motion: reduce)`
guard plus a user toggle, since we have no reduced-motion handling anywhere
today. Playwright specs should assert on state/`data-*` attributes, not on
animation timing.

## 8. Accessibility round two

**What other apps do.** Most mainstream Sudoku apps are mediocre here; NYT is
the strongest, exposing the grid as `role="grid"` with per-cell labels of the
form "row 3, column 5, value 7, given". Our `SudokuBoard.vue` already does that,
plus roving tabindex and programmatic focus on cursor moves — genuinely ahead of
sudoku.com. The remaining gaps are specific and cheap:

- **Notes aren't announced.** The cell `aria-label` omits pencil marks (the
  notes span carries only `aria-label="notes"`). Append "notes: 2, 4, 7".
- **Touch targets shrink below the WCAG 2.5.5 minimum.** Cells drop to
  `2.25rem` (36px) under the `max-width: 640px` breakpoint
  (`SudokuBoard.vue`); scale with the viewport instead so 44px is kept where
  the screen allows.
- **Missing keyboard verbs** that other apps bind: `Ctrl+Z`/`Ctrl+Y` (undo,
  idea 1), `Tab`/`Shift+Tab` to jump to the next/previous **empty** cell,
  `Escape` to deselect, `H` for hint. `parseKeyEvent` currently returns `null`
  for modifier chords, so this is a contained change with existing unit tests.
- **A High-Contrast theme.** sudoku.com ships one; our tri-state `useTheme`
  singleton and `theme-init.js` generalise to a fourth value cleanly.
- A visible keyboard-shortcut cheat sheet, which nearly every desktop-first
  Sudoku site offers.

## 9. PWA / offline app shell

**What other apps do.** sudoku.com is a full PWA (cache-first app shell,
puzzles cached for offline play, moves replayed on reconnect); sudoku.coach
caches the shell and loaded puzzles but needs the network for stats and
leaderboards; NYT deliberately isn't a PWA because play is tied to a
subscription.

**Why here.** A Sudoku board is the archetypal "play it on the train" app, and
Vite makes the shell part nearly free. Note this contradicts the README's
current **Out of scope** list, so adopting it is a deliberate scope decision and
the README must be updated in the same change.

**Shape.** Stage it. *Stage 1* (small): `vite-plugin-pwa`/Workbox precaching of
the built shell, a web app manifest and icons, an install prompt, and an
offline/online banner via `navigator.onLine`. *Stage 2* (larger): buffer moves
in IndexedDB behind the existing `moveQueue` and drain them on reconnect —
appealing because the serial FIFO with a monotonic `moveNumber` is already the
right abstraction, but it interacts with `Idempotency-Key` memoisation, token
expiry while offline and 409 stale-move recovery, so it deserves its own design
note. Never cache authenticated responses in the service worker; leave
`/auth/*`, `/games` and `/users` network-only so the ETag cache stays the single
auth-scoped cache.

## 10. Streak, calendar and stats visualisation

**What other apps do.** NYT made the daily streak a retention engine: streak and
max streak on the completion screen, a solve-time histogram and a calendar of
completed days. sudoku.coach's GitHub-style 90-day heatmap is the most-cited
feature in its reviews. sudoku.com shows a per-difficulty daily league and
"7-day streak 🔥" badges. sudoku.coach also reports percentile ("top 12% this
week") instead of raw ranks near the top, to avoid demoralising newcomers.

**Why here.** `UserStatsDto` already carries `currentDailyStreak`,
`longestDailyStreak`, and per-difficulty best/average/win-rate, but the stats
page renders them as plain numbers and the completion dialog doesn't mention the
streak at all.

**Shape.** Surface the streak (with its increment) on the daily completion
dialog; add a per-difficulty best-vs-average bar chart and a win-rate gauge from
data we already fetch; highlight and sticky-pin the signed-in user's own
leaderboard row and show 🥇🥈🥉 for the top three. A true daily heatmap and a
solve-time histogram need a per-game history endpoint we don't have — a
short-window approximation from daily leaderboards is possible but chatty, so
prefer shipping the parts backed by `UserStatsDto` first. Prefer hand-rolled
SVG/CSS over a new charting dependency unless the scope grows.

---

## Parked: attractive but blocked by the fixed backend contract

| Idea | Why it's parked |
| --- | --- |
| Variant Sudoku (killer, thermo, sandwich, jigsaw, 6×6/16×16) — the CTC/SudokuPad ecosystem | Needs new puzzle models and constraint data from the generator. |
| Real-time co-op or race modes (Sudoku Party, NYT's withdrawn 2023 beta, SudokuPad shared cursors) | No WebSocket/SSE or shared-session endpoints. |
| "Ghost replay" of another solver's path (sudoku.coach) | Needs a per-game move-history endpoint. |
| Server-side notes sync across devices | No notes storage in the contract; idea 2 is the local-only substitute. |
| Publishing custom/imported puzzles to leaderboards (sudokuexchange, f-puzzles URL sharing) | Needs a puzzle-creation endpoint. *Local* practice on a pasted 81-char grid is feasible client-side, but it can't be ranked. |
| Camera OCR import (Andoku, Enjoy Sudoku) | Feasible with Tesseract.js, but heavy for a web bundle and low value versus the items above. |
| An interactive "learn the techniques" course (sudoku.coach) | Not blocked — but it only becomes worthwhile once the solver from idea 5 exists, so sequence it after that. |

## Suggested sequencing

1. **Quick wins that close obvious gaps:** ideas 2, 4 (badges), 7 and the cheap
   half of 8.
2. **Core play loop:** idea 1, then 3, then 6 (which gives the toggles from 3
   and 4 a home).
3. **Bigger bets:** idea 5 (solver, then coaching UI, then a learn mode), idea 9
   stage 1, idea 10.
