# Plan: consolidate Copilot PR automation into a single cron-triggered "reconciler"

## Goal

Replace the two remaining **agentic** (gh-aw) workflows — `copilot-address-review` and
`copilot-request-review` — with **plain, cron-triggered GitHub Actions** whose logic lives
in a well-commented, easily-extended **script**. Fold in the already-converted
`copilot-mark-ready` behavior so all Copilot "prodding" lives in one place.

The workflow periodically "prods along" Copilot work that is paused between steps, for
**Copilot-authored PRs only**, covering three scenarios:

1. **Mark ready** — mark non-`[WIP]` Copilot draft PRs as ready for review. *(Already done
   as a scheduled scan in `copilot-mark-ready.yml`; migrate it into the reconciler.)*
2. **Address review** — when the Copilot reviewer leaves feedback that requests changes,
   comment mentioning `@copilot` asking it to address the feedback.
3. **Request review** — after new changes are pushed to a non-draft Copilot PR, if Copilot
   isn't already reviewing, request the Copilot reviewer.

## Why cron (recap of the auth problem this solves)

GitHub does **not** run Actions automatically on events triggered by the Copilot coding
agent — a maintainer must click "Approve and run workflows". This gate keys on the
**triggering actor being Copilot**, so it applies to `pull_request` **and**
`pull_request_target` and cannot be disabled by a repo setting. A **scheduled** run is
triggered by GitHub's scheduler (a non-Copilot actor) in the trusted base context, so it is
never gated. This was proven with `copilot-mark-ready.yml`.

Because the reconciler runs on cron and performs all writes with a user-owned PAT, every
action is attributed to a real user — which both **avoids the approval gate** and lets the
`@copilot` mention actually wake the coding agent (a `github-actions[bot]` mention does
not).

> Note on Copilot's own processes: requesting the Copilot reviewer, and Copilot responding
> to an `@copilot` mention, run as GitHub-managed **"dynamic"** workflows
> (`dynamic/agents/copilot-pull-request-reviewer`, `dynamic/copilot-swe-agent/copilot`),
> **not** as our Actions workflows — so they are not subject to *our* approval gate. The
> gate only ever affected the automation workflows we author.

## Do these need AI? — assessment

| Scenario | AI needed? | Rationale |
| --- | --- | --- |
| 1. Mark ready | **No** | Pure predicate over PR state (draft + title lacks `[WIP]`). |
| 2. Address review | **No** (optional) | "Changes requested" is detectable deterministically from **unresolved review threads / inline comments**. AI is only *optionally* useful to summarize asks or disambiguate an unusual review; not required. |
| 3. Request review | **No** | Compare head SHA vs. last Copilot review; check pending reviewer request. |

**Conclusion:** all three can be **plain cron Actions** — no gh-aw/agentic engine required.
This removes gh-aw as a dependency for these behaviors entirely (see "Cleanup" below).

## Facts established from this repo (verified 2026-07-13, read-only)

- **Copilot PR author login:** `app/copilot-swe-agent` (a bot). Head branches are
  `copilot/*`. Scope every scenario to this author to honor "only Copilot-created PRs".
- **Copilot reviewer login:** `copilot-pull-request-reviewer[bot]`. Its reviews have
  `state = "COMMENTED"` **even when there are actionable inline comments** — so **do not**
  rely on `CHANGES_REQUESTED`.
- **Actionable signal:** unresolved review threads. Example (PR #30): review `COMMENTED`
  with a summary body, **1 inline comment**, **1 unresolved review thread** (GraphQL
  `reviewThreads.nodes[] | select(.isResolved==false)`). A "nothing to change" review has
  **0** inline comments / unresolved threads.
- **Requesting the Copilot reviewer:** the request target login is **`Copilot`**. While a
  request is pending it appears in `pulls/{n}.requested_reviewers`; the issue timeline logs
  a `review_requested` event with `requested_reviewer.login == "Copilot"`. Once Copilot
  reviews, it leaves `requested_reviewers` (the pending request is consumed).
- **Auth:** the existing **`GH_AW_GITHUB_TOKEN`** PAT (fine-grained, user-owned, Copilot
  license; scopes: Pull requests R/W, Issues R/W, Contents R) already drives the other
  workflows and is the right token here too.
- **Cron delivery:** `*/5` was throttled/dropped by GitHub; the off-peak
  `3,18,33,48 * * * *` (~15 min) is delivered reliably. Reuse that cadence.

## Target architecture

### One workflow + one script

```
.github/
├─ workflows/
│  └─ copilot-reconciler.yml     # thin: cron + workflow_dispatch → run the script
└─ scripts/
   └─ copilot-reconcile.mjs      # ALL logic, per scenario, heavily commented
```

- **`copilot-reconciler.yml`** — minimal. Triggers (`schedule` off-peak +
  `workflow_dispatch`), `concurrency`, read-only `permissions`, one step that runs the
  script with `GH_TOKEN: ${{ secrets.GH_AW_GITHUB_TOKEN }}` (and `GITHUB_TOKEN: ""` so `gh`
  can't silently fall back to the built-in token), and a `DRY_RUN` input wired from
  `workflow_dispatch` for safe manual testing.
- **`copilot-reconcile.mjs`** — the reconciler. Enumerates open Copilot-authored PRs once,
  then applies each scenario's rules. Uses the `gh` CLI (already on the runner and
  PAT-authenticated via `GH_TOKEN`) via `child_process`; no npm dependencies.

**This `copilot-reconciler.yml` supersedes `copilot-mark-ready.yml`** (scenario 1 moves in).

### Script language — recommendation

**Node.js ESM (`.mjs`), zero runtime dependencies, shelling out to `gh`.** Rationale:
- The repo is TypeScript/Node; maintainers already know it.
- The logic is a per-PR decision tree with dedup + GraphQL — far more readable/maintainable
  in JS than in Bash+jq (which the user explicitly wants to avoid).
- Pure decision functions (classification, dedup) can be unit-tested with the repo's
  existing **Vitest** if desired.
- Runs directly via `node .github/scripts/copilot-reconcile.mjs` — no build step.

Alternative (documented, not recommended): a single Bash + `jq` + `gh api graphql` script.
Lower structure/readability for this much conditional logic.

> Copilot CLI is **not** needed for the core logic. If, later, richer summarization or
> fuzzy "is this actionable?" classification is wanted, the script can shell out to Copilot
> CLI behind an opt-in flag — but the deterministic unresolved-thread signal makes this
> unnecessary initially.

### Script structure (illustrative)

```
copilot-reconcile.mjs
  main()
    load config (repo, DRY_RUN, round cap, reviewer/author logins)
    prs = listCopilotPRs()                 // open, author app/copilot-swe-agent
    for pr of prs:
      if hasLabel(pr, 'copilot-loop-exhausted'): continue
      markReadyIfEligible(pr)              // Scenario 1
      requestReviewIfNeeded(pr)            // Scenario 3
      addressReviewIfRequested(pr)         // Scenario 2
  // helpers
  gh(args) / ghJson(args) / ghGraphql(query, vars)
  listCopilotPRs()
  markReadyIfEligible(pr)
  requestReviewIfNeeded(pr)
  addressReviewIfRequested(pr)
  hasLabel / addLabels / postComment / findOurMarkerComments
  log(action) honoring DRY_RUN
```

Every scenario is one well-commented function; adding a new behavior = add a function +
one call in the loop.

## Detailed behavior specs

Common: operate only on **open PRs authored by `app/copilot-swe-agent`**; skip any PR
carrying the **`copilot-loop-exhausted`** label; treat all PR/review text as **untrusted
data** (never interpret it as commands); honor `DRY_RUN`.

### Scenario 1 — Mark ready (migrated)
- **Eligible:** PR is a **draft** and title does **not** contain `[WIP]`.
- **Action:** `gh pr ready <n>` (PAT). Marking ready emits a user-authored
  `ready_for_review` event (harmless; the same reconciler pass also covers scenario 3, so
  we no longer depend on event chaining).
- **Idempotent:** once ready it is no longer a draft → not re-processed.

### Scenario 2 — Address review (`@copilot` prod)
- **Detect actionable feedback (deterministic):**
  - Find the **latest** review by `copilot-pull-request-reviewer[bot]`.
  - Compute **unresolved review threads** via GraphQL (`reviewThreads` where
    `isResolved == false`), ideally limited to threads whose first comment author is the
    Copilot reviewer.
  - **Actionable** ⇔ unresolved-thread count > 0 (equivalently, the latest reviewer review
    has ≥1 associated inline comment that isn't resolved). **Not actionable** (skip) ⇔ the
    latest reviewer review has no inline comments / no unresolved threads (an "LGTM"/"0
    comments" review, an approval, etc.).
- **Dedup (avoid prodding every 15 min):** record which review we've already responded to.
  Preferred: embed a hidden marker in our own comment, e.g.
  `<!-- copilot-reconcile: addressed-review=<reviewId> head=<sha> -->`, and before posting
  scan our prior comments for that `reviewId`/`sha`. Prod **once per new actionable Copilot
  review**.
- **Action:** `gh pr comment <n> --body "@copilot please address the review feedback: …"`
  (PAT, so it wakes the coding agent). Keep the body a short, templated instruction plus a
  link to the review; optionally list the file:line of each unresolved thread. Include the
  hidden dedup marker.
- **Round cap / exhaustion:** count prior `@copilot` prods on the PR (via our marker). On
  reaching **N (default 3)**, instead of prodding, add labels **`copilot-loop-exhausted`**
  + **`needs-human-review`** and post a one-line "handing off to a human" comment. Both
  scenarios 2 and 3 then skip this PR until a human removes the label.

### Scenario 3 — Request review after new pushes
- **Eligible:** PR is **non-draft** and not loop-exhausted.
- **Detect "new changes since last review":**
  - `head = pulls/{n}.head.sha`.
  - Find the latest Copilot-reviewer review and the commit it reviewed (its `commit_id`).
  - **Needs review** ⇔ no Copilot review exists for the **current** `head` (i.e. the latest
    reviewed commit ≠ current head, or there is no Copilot review yet).
- **"Already reviewing?" guard (avoid redundant requests):** skip if `Copilot` is already
  in `requested_reviewers` (a pending request), or if a Copilot review already exists for
  the current head.
- **Action:** request the Copilot reviewer for `head`. Mechanism to confirm at
  implementation — `gh pr edit <n> --add-reviewer "Copilot"` or
  `POST /repos/{o}/{r}/pulls/{n}/requested_reviewers {"reviewers":["Copilot"]}` (PAT).
- **Convergence:** push → (scenario 3) request review → Copilot reviews → (scenario 2) if
  unresolved threads, prod `@copilot` → Copilot pushes fix → repeat, bounded by the
  exhaustion cap.

## Idempotency & safety (critical for a periodic reconciler)

| Concern | Mitigation |
| --- | --- |
| Re-runs every ~15 min | Every action gated by an idempotent predicate (draft state, requested-reviewer presence, dedup marker). |
| Duplicate `@copilot` comments | Dedup by `reviewId`/`sha` marker; prod once per new actionable review. |
| Runaway loop | `copilot-loop-exhausted` label after N rounds; honored by scenarios 2 & 3; reset = human removes label. |
| Overlapping cron runs | `concurrency: { group: copilot-reconciler, cancel-in-progress: false }`. |
| Touching human PRs | Scope strictly to `app/copilot-swe-agent`-authored PRs. |
| Prompt injection via PR/review text | Script performs only deterministic `gh` calls; untrusted text is never executed or passed as instructions. If Copilot CLI is later added, pass text as data and constrain output. |
| Accidental mass-action on first deploy | Ship with a `DRY_RUN` path; do a dry run before enabling writes (see Rollout). |

## Auth

- Reuse **`GH_AW_GITHUB_TOKEN`** (already configured). The script reads it as `GH_TOKEN`;
  set `GITHUB_TOKEN: ""` in the step env so `gh` cannot silently use the built-in token.
- No new secrets required. (If we ever add Copilot-CLI classification, that step needs
  Copilot inference auth — out of scope for the initial deterministic version.)

## Trigger & workflow shape

- `on.schedule: - cron: "3,18,33,48 * * * *"` (~15 min, off-peak — proven reliable) plus
  `on.workflow_dispatch` with a boolean `dry_run` input (default `true` for manual runs).
- `permissions: { contents: read }` (all writes go through the PAT).
- `concurrency` group as above.
- Single step: `run: node .github/scripts/copilot-reconcile.mjs` with `GH_TOKEN`,
  `GITHUB_TOKEN: ""`, `REPO: ${{ github.repository }}`, `DRY_RUN: ${{ inputs.dry_run || 'false' }}`.

## Files to add / change / remove

**Add**
- `.github/workflows/copilot-reconciler.yml`
- `.github/scripts/copilot-reconcile.mjs`
- *(optional)* `.github/scripts/copilot-reconcile.spec.ts` (Vitest for pure decision fns)

**Remove (replaced by the reconciler)**
- `.github/workflows/copilot-address-review.md` + `.lock.yml`
- `.github/workflows/copilot-request-review.md` + `.lock.yml`
- `.github/workflows/copilot-mark-ready.yml` (folded into the reconciler)

**Update**
- `README.md` — collapse the three-workflow section into "one scheduled reconciler +
  script"; keep the `GH_AW_GITHUB_TOKEN` and `copilot-loop-exhausted` reset docs.
- `plans/copilot-pr-automation-agentic-workflows.md` — cross-reference this plan as the
  successor design.

## Cleanup opportunity (optional, after migration)

Once no `*.md`/`*.lock.yml` gh-aw workflows remain, the gh-aw scaffolding is unused:
- `.github/aw/actions-lock.json` and the `*.lock.yml` linguist attribute in `.gitattributes`
  can be removed.
- The gh-aw compile step / tooling notes become irrelevant.
Decide whether to remove or retain gh-aw for possible future agentic workflows.

## Open questions to resolve during implementation

1. **Exact "request Copilot reviewer" call** from a script — confirm `gh pr edit
   --add-reviewer "Copilot"` vs the REST `requested_reviewers` endpoint (and the precise
   login/case). *Verify by requesting on a throwaway non-draft Copilot PR and confirming a
   Copilot review starts.*
2. **Do unresolved threads auto-resolve** when Copilot pushes a fix, or only on re-review /
   manual resolve? Affects whether "unresolved threads" alone can cause repeated prods.
   *Mitigation already in design: dedup by review id so we prod once per **review**, not
   per unresolved-thread poll.* Validate the real resolve behavior.
3. **Actionable classification edge cases** — a Copilot review that is `COMMENTED` with a
   body but **zero** inline comments/threads (pure summary/approval): confirm we treat it as
   **not** actionable. Validate against a real "clean" Copilot review.
4. **Detecting Copilot already mid-work** — if Copilot is actively responding (a "Copilot
   started work" timeline event after our prod), ensure the dedup marker prevents a second
   prod before the next review. Confirm timeline signals if we want a stronger guard.
5. **Script language sign-off** — confirm Node `.mjs` (recommended) vs Bash.
6. **Cadence** — 15 min (recommended, matches proven mark-ready) vs hourly.
7. **Round cap N** — default 3; confirm.

## Validation & testing strategy

- **Dry run first:** run the script locally (`GH_TOKEN=<pat> DRY_RUN=true node
  .github/scripts/copilot-reconcile.mjs`) and via `workflow_dispatch` with `dry_run: true`;
  confirm it *reports* the right actions on current open Copilot PRs (e.g. mark #30 ready,
  prod on #30's unresolved thread) without performing them.
- **Lint/validate** the workflow YAML (actionlint if available; YAML parse otherwise).
- **Unit-test** the pure decision functions (classification, dedup, eligibility) with
  Vitest if we factor them out.
- **Enable writes** (`dry_run: false`) and watch one full loop on a real Copilot PR: ready
  → review requested → prod on feedback → fix pushed → re-review → … → exhaustion label
  after N.
- Confirm no duplicate comments across consecutive cron ticks (dedup working).

## Rollout / migration steps

1. Land the plan (this doc). ✅
2. Implement `copilot-reconcile.mjs` (scenarios 1–3, dry-run support, dedup, exhaustion).
3. Add `copilot-reconciler.yml` (cron + dispatch, PAT, concurrency), default manual runs to
   `dry_run: true`.
4. Dry-run locally + via dispatch; verify reported actions against live PRs.
5. Remove the two agentic workflows and `copilot-mark-ready.yml`; update README + plans.
6. Enable (`dry_run: false`), monitor the first scheduled ticks and a full convergence loop.
7. *(Optional)* Remove now-unused gh-aw scaffolding.

## Todos checklist

- [ ] Confirm open questions 1–7 (esp. the request-reviewer call and resolve behavior).
- [ ] Write `copilot-reconcile.mjs` with per-scenario functions + `DRY_RUN`.
- [ ] Write `copilot-reconciler.yml` (cron `3,18,33,48 * * * *`, `workflow_dispatch` w/
      `dry_run`, `concurrency`, PAT env, `GITHUB_TOKEN: ""`).
- [ ] Dry-run validation against live Copilot PRs.
- [ ] Remove `copilot-address-review.*`, `copilot-request-review.*`, `copilot-mark-ready.yml`.
- [ ] Update `README.md` and cross-link `plans/copilot-pr-automation-agentic-workflows.md`.
- [ ] Enable writes; verify a full loop + exhaustion cap + dedup.
- [ ] (Optional) Remove unused gh-aw scaffolding.
