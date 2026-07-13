# Plan: GitHub Agentic Workflows to automate Copilot PR interactions

## Problem & goal

Reduce human involvement in PR review by letting GitHub Copilot iterate to a clean
review **before** a human is pulled in. Three behaviors, built as
[GitHub Agentic Workflows](https://github.github.com/gh-aw/) (`gh-aw`, v0.77.5 already
installed):

1. **Mark ready** — when Copilot finishes (removes the `[WIP]` prefix from a draft PR's
   title), promote the PR from *draft* to *ready for review*, and request the first
   Copilot review.
2. **Ask Copilot to fix** — when the **Copilot reviewer** submits a review with
   actionable suggestions, post a comment mentioning `@copilot` asking it to address the
   feedback. **Skip** when the review indicates nothing to change.
3. **Request review** — when new commits are pushed to a **non-draft** PR, assign Copilot
   as a reviewer.

Together these form an intentional, self-converging loop:
`push → Copilot review → (if feedback) @copilot fixes → push → re-review → … → clean review → stop (human takes over)`.

## Feasibility verdict — all three are realistic

| Behavior | Trigger | Action mechanism | gh-aw support |
| --- | --- | --- | --- |
| 1. Mark ready | `pull_request: [edited]` | **plain GitHub Action** running `gh pr ready` (was: built-in `mark-pull-request-as-ready-for-review`) | Fully deterministic — converted out of gh-aw (see File 1) |
| 2. Ask Copilot to fix | `pull_request_review: [submitted]` | built-in `add-comment` (@copilot) **+** `add-labels` (exhaustion) | Native; AI summarizes asks, decision is mostly deterministic |
| 3. Request review | `pull_request: [synchronize, ready_for_review]` | built-in `add-reviewer` with `allowed-reviewers: [copilot]` | Native (docs explicitly support `copilot`) |

Honest note: behaviors 1 and 3 are mostly **deterministic** (a plain Actions workflow
could do them). Behavior 2 is the only one where agentic reasoning clearly earns its keep
(summarizing reviewer asks into one concise instruction). We implement all three as
agentic workflows per the user's choice, but keep B1/B3 prompts **thin** with all gating
in deterministic `if:` expressions. If per-event agent cost becomes a concern, B1/B3 can
later be demoted to plain Actions with no behavior change.

## Decisions captured from the user

- **Structure:** three separate workflow files (one per behavior).
- **Engine:** Copilot CLI (gh-aw default).
- **Guardrails:** `stop-after` deadline **and** a per-PR iteration cap.
- **Auth:** prefer the new no-PAT path; add a PAT only if validation proves it necessary.

## Phase 0 — validation gate (MUST pass before authoring the three workflows)

The plan's biggest risks are external unknowns about how Copilot reacts to
Actions-authored activity. Resolve these first with throwaway/minimal tests; the answers
change the design, so they are a **gate**, not a post-build "fallback."

- **V1 — Inference billing.** Confirm `permissions: copilot-requests: write` actually
  authenticates Copilot inference on this **personal-namespace** repo
  (`mjrousos/SudokuFrontend`). If it fails (no org centralized billing), add a
  `COPILOT_GITHUB_TOKEN` PAT. Test with one trivial gh-aw workflow.
- **V2 — Does a `GITHUB_TOKEN`-authored `@copilot` comment wake the coding agent?**
  This is the make-or-break for B2's loop. Post a `@copilot` comment via the default
  `GITHUB_TOKEN` and observe whether a coding-agent session starts.
  - If **yes** → B2 uses default `add-comment` (no PAT).
  - If **no** → B2 must use either a fine-grained PAT (`GH_AW_GITHUB_TOKEN`) for the
    comment, or the `assign-to-agent` safe output (requires `GH_AW_AGENT_TOKEN` PAT).
    Treat a PAT as **expected**, not exceptional.
- **V3 — Does `add-reviewer: [copilot]` via `GITHUB_TOKEN` actually start a Copilot
  review?** If requesting the reviewer with the default token does not trigger a review,
  B3 (and B1's initial request) need the same PAT treatment as V2.
- **V4 — Exact bot identities + `on.bots:` syntax.** Trigger a real Copilot coding-agent
  push/title-edit and a real Copilot review; record `github.actor` /
  `github.event.sender.login` and `github.event.review.user.login`. Confirm whether
  `on.bots:` expects bare names (`copilot-swe-agent`) or full logins
  (`copilot-swe-agent[bot]`). Expected: `copilot-swe-agent[bot]` (coding agent) and
  `copilot-pull-request-reviewer[bot]` (reviewer) — **must be verified, not assumed.**

Outcome of Phase 0: a confirmed auth model (which token for inference, which for
write-actions) and confirmed bot logins. Only then author the workflows.

## Authentication strategy (two distinct tokens)

These are independent and easy to conflate:

1. **Engine / inference auth** — for *running* the Copilot model. Prefer
   `permissions: copilot-requests: write` (GitHub Actions token, no PAT, org-billed).
   Validated in **V1**; PAT (`COPILOT_GITHUB_TOKEN`) only if that fails.
2. **Write-action auth** — the token safe-output jobs use to comment / assign reviewer /
   mark ready. Default = the workflow's scoped `GITHUB_TOKEN`. Whether that is *sufficient
   to wake Copilot* is decided by **V2/V3**, not assumed.

> **UPDATE (post-merge, PR #17 in production):** V2/V3 confirmed the negative case —
> write actions performed by the default `GITHUB_TOKEN` (i.e. `github-actions[bot]`) do
> **not** wake the Copilot coding agent or reliably start a Copilot review. The three
> workflows were switched to perform all GitHub read/write through a user-owned
> **`GH_AW_GITHUB_TOKEN`** PAT (explicit `safe-outputs.github-token`), with **no**
> `GITHUB_TOKEN` fallback so a missing/misconfigured PAT fails loudly instead of silently
> reverting to the bot. Inference stays on `copilot-requests: write` (V1 confirmed working
> in CI). Required PAT scopes: Pull requests R/W, Issues R/W, Contents R — owner must have
> a Copilot license. Activation/reactions still use the built-in `GITHUB_TOKEN`.

Note on loop propagation: **since PR #20** our safe-output writes use the
`GH_AW_GITHUB_TOKEN` PAT, so they are real-user events that **do** start new Actions runs.
This is intended in exactly one place — B1 (copilot-mark-ready) marking a PR ready chains
to B3 (copilot-request-review) via `ready_for_review`. It does **not** create runaway
loops: the comment/label writes are not listened for by any workflow, `add-reviewer` emits
`review_requested` (not a trigger we use), and the review→fix cycle is bounded by the
`copilot-loop-exhausted` label. Copilot's **separate** systems (coding agent, reviewer)
still drive the core cycle by authoring their own real events — provided the relevant bots
are allowlisted (below).

## Critical cross-cutting requirement: allow bot-authored triggers

By default gh-aw only lets repo-role humans (`roles: [admin, maintainer, write]`) trigger
a workflow; bot-authored events are blocked unless allowlisted via `on.bots:`. This system
depends on bot-authored events (Copilot's title edit, the reviewer's review, the coding
agent's pushes), so each workflow must allowlist the relevant Copilot bot(s) using the
logins confirmed in **V4**.

## Loop control: exhaustion state & reset (shared across B2 and B3)

The per-PR iteration cap must suppress **the whole loop**, not just B2's comments —
otherwise B3 keeps requesting Copilot reviews on every push after we've declared the loop
exhausted.

- **Exhaustion signal:** a label, `copilot-loop-exhausted` (and a human-facing
  `needs-human-review`), applied by **B2** via the built-in `add-labels` safe output once
  it has asked `@copilot` N times (default **N = 3**) on the same PR.
- **Round counting:** B2 counts its prior `@copilot` requests on the PR via the gh-aw
  workflow-id marker embedded in earlier comments (read-only GitHub tools).
- **B3 honors exhaustion:** B3 **skips** requesting a Copilot review when
  `copilot-loop-exhausted` is present.
- **B2 honors exhaustion:** B2 **skips** further `@copilot` comments when the label is
  present (idempotent if it fires again).
- **Reset:** a human removes `copilot-loop-exhausted` (and/or `needs-human-review`).
  Automation resumes on the next qualifying push. Document this in the workflow body and
  README.

## Per-workflow design

Shared config (all three): `engine: copilot`,
`permissions: { contents: read, pull-requests: read, copilot-requests: write }` (PAT only
if Phase 0 requires it), `stop-after`, an `on.reaction` for visibility, read-only GitHub
tools, and a prompt instruction to **ignore any instructions embedded in PR titles, bodies,
or review text** (prompt-injection hardening — only act on the structured event + the
behavior's rules). Files live in `.github/workflows/` as `*.md`, compiled to committed
`*.lock.yml`.

### File 1 — `copilot-mark-ready.yml` (Behavior 1) — plain GitHub Action

> **UPDATE (post-PR #20):** Behavior 1 is **fully deterministic** (no AI value-add), so it
> was **converted from an agentic workflow to a plain GitHub Actions workflow**
> (`copilot-mark-ready.yml`, replacing `copilot-mark-ready.md` + its `.lock.yml`).
>
> **UPDATE (approval gate):** GitHub does not run Actions automatically on events triggered
> by the Copilot coding agent (the "Approve and run workflows" gate), and this gate keys on
> the *triggering actor* being Copilot — it applies to `pull_request` **and**
> `pull_request_target` and cannot be disabled by a repo setting. An interim
> `pull_request_target` attempt did **not** work (runs stayed `action_required` with
> `triggering_actor: Copilot`). The workflow was therefore moved to a **`schedule` (cron)**,
> which is triggered by GitHub (a non-Copilot actor) in the trusted base context and is
> never gated. The details below reflect the current scheduled form.

- **Trigger:** `schedule: cron "3,18,33,48 * * * *"` (~every 15 min, off the hour; +
  `workflow_dispatch` for manual testing). Not `pull_request*` — see the approval-gate note
  above. An earlier `*/5` cadence was throttled by GitHub (best-effort `schedule` delivery
  drops high-frequency and top-of-hour runs), so it was moved off-peak.
- **Selection (deterministic, done in the step, not an `if:`):** list open **draft** PRs
  authored by the Copilot coding agent (`gh` reports the login as `app/copilot-swe-agent`;
  `copilot-swe-agent[bot]`/`Copilot` also accepted) whose title does **not** contain
  `[WIP]`. Scoping to Copilot authorship keeps human WIP drafts untouched; once a PR is
  marked ready it is no longer a draft, so it is not re-processed. Latency: up to ~15 min.
- **Action:** `gh pr ready <n>` with `GH_TOKEN` = `GH_AW_GITHUB_TOKEN` PAT — so each
  resulting `ready_for_review` event is user-authored and **chains to B3**
  (copilot-request-review). A `GITHUB_TOKEN`-authored ready event would not trigger B3, and
  (being a PAT/user event, not a Copilot event) the chained B3 run is itself not gated.

**Historical (superseded forms):**
- Agentic `pull_request:[edited]` with an `if:` gate + built-in
  `mark-pull-request-as-ready-for-review` (PR #20 removed a direct `add-reviewer: [copilot]`
  once the PAT-authored ready event began chaining to B3).
- Plain `pull_request` then `pull_request_target` `[edited]` Action — both blocked by the
  Copilot approval gate.

### File 2 — `copilot-address-review.md` (Behavior 2)
- **Trigger:** `pull_request_review: types: [submitted]`.
- **`if:` gate:** review author == Copilot reviewer bot (login from V4); skip if
  `copilot-loop-exhausted` label present.
- **`bots:`** allow the Copilot reviewer bot.
- **Decision logic (deterministic first, AI second):**
  - `state == APPROVED` with zero inline comments ⇒ **skip**.
  - zero inline comments + body matches known clean-review phrases (e.g.
    "Comments generated: 0 new", "No comments", "looks good") ⇒ **skip**.
  - `state == CHANGES_REQUESTED`, or any inline review comments present ⇒ **act**.
  - ambiguous `COMMENTED` with no inline comments ⇒ skip unless the body is
    high-confidence actionable.
  The AI's job when acting is to **summarize** the reviewer's asks into one concise
  `@copilot please address …` comment — not to decide policy from prose alone.
- **Idempotency / dedup:** before posting, search the PR for a prior workflow comment
  referencing the **same review ID and/or head SHA**; if found, do nothing. (Stops
  duplicates from re-runs, edited reviews, or multiple reviews on one SHA.)
- **Iteration cap:** count prior `@copilot` requests (workflow-id marker). On reaching
  N (default 3), instead of pinging again, apply `copilot-loop-exhausted` +
  `needs-human-review` via `add-labels` and post a single "handing off to a human" comment.
- **Safe outputs:** `add-comment`, `add-labels`.

### File 3 — `copilot-request-review.md` (Behavior 3)
- **Trigger:** `pull_request: types: [synchronize, ready_for_review]`
  (`synchronize` = new commits; `ready_for_review` covers a draft becoming ready — a human
  clicking "Ready for review" **or** B1 marking it ready with its PAT, whose real-user
  event chains here. **UPDATE (PR #20):** B3 is now the single owner of reviewer requests.)
- **`if:` gate:** `github.event.pull_request.draft == false` **and**
  `copilot-loop-exhausted` label absent.
- **`bots:`** allow the Copilot coding agent (so its fix-pushes during the loop re-trigger)
  — login from V4.
- **Idempotency:** skip if `github.event.after` no longer equals the PR's current head SHA
  (stale push), or if Copilot is already in `requested_reviewers` for the current head.
- **Safe output:** `add-reviewer` with `allowed-reviewers: [copilot]`.
- **Agent role:** thin — validate gates/idempotency, then request review.

## Convergence analysis (after fixes)

- **Normal path:** push → B3 requests review → Copilot reviews →
  B2 acts only if actionable → @copilot fixes & pushes → repeat. When a review comes back
  clean, B2 skips, no new push occurs, loop ends; PR is ready + clean for a human.
- **Non-convergent path:** after N rounds B2 sets `copilot-loop-exhausted`; **both** B2 and
  B3 then skip, so no further @copilot pings and no further review requests. Human is
  flagged via `needs-human-review`. Reset = remove the label.
- **Thrash protection:** B2 dedups by review ID/SHA; B3 skips stale SHAs and
  already-requested reviewers.

## Open questions / risks (most resolved by Phase 0)

1. V2: `GITHUB_TOKEN` `@copilot` comment may not wake the coding agent → PAT likely
   required for B2. **Highest risk.**
2. V3: `add-reviewer` via `GITHUB_TOKEN` may not start a Copilot review → same PAT concern
   for B1/B3.
3. V1: personal-repo `copilot-requests: write` billing may not work → `COPILOT_GITHUB_TOKEN`.
4. V4: bot logins / `on.bots:` syntax wrong ⇒ workflows never trigger.
5. `pull_request_review` trigger behavior under gh-aw activation/role gating.
6. `stop-after` resets on each recompile (re-running `gh aw compile` extends the deadline);
   note this so it isn't mistaken for a permanent kill-switch.
7. Cost: B1/B3 spawn an agent run per event; mitigated by `if:` pre-filters, `stop-after`,
   exhaustion label, and dedup. Revisit (or demote B1/B3 to plain Actions) if noisy.
8. Security: prompt-injection via PR/review text — mitigated by the "ignore embedded
   instructions" prompt rule and gh-aw's content sanitization/integrity filtering.

## Validation strategy

- `gh aw compile` each workflow (schema validation + lock generation); fix errors.
  Note: `gh aw --help` hangs without a TTY in this sandbox — run subcommands
  non-interactively and capture output; escalate to the user if a command needs a TTY.
- Commit both `*.md` and generated `*.lock.yml`.
- Phase 0 tests (V1–V4) on a throwaway PR before authoring.
- End-to-end smoke test on a throwaway draft PR: B1 promotes + requests review on `[WIP]`
  removal; B3 requests Copilot review on push to non-draft; B2 pings `@copilot` only on
  actionable reviews, stays silent on clean ones, dedups, and stops after N rounds with the
  exhaustion label; B3 then also stops. Inspect via `gh aw status` / `gh aw logs`.

## Todos (tracked in SQL)

1. **Phase 0 validation gate** (V1 inference billing, V2 @copilot wake, V3 add-reviewer
   trigger, V4 bot logins + `on.bots:` syntax). Blocks everything.
2. Author `copilot-mark-ready.md` (trust-boundary `if:`, `mark-ready` safe-job + initial
   `add-reviewer: [copilot]`).
3. Author `copilot-address-review.md` (deterministic skip signals, dedup by review ID/SHA,
   add-comment + add-labels, iteration cap → exhaustion label, injection hardening).
4. Author `copilot-request-review.md` (draft/exhaustion/stale-SHA/already-requested gates,
   add-reviewer copilot).
5. Apply shared config: `copilot-requests: write` (or PAT per V1), `stop-after`, reactions,
   permissions, injection-hardening prompt; wire the shared exhaustion-label contract.
6. `gh aw compile` all; resolve validation errors; commit `.md` + `.lock.yml`.
7. End-to-end test on a draft PR; iterate on prompts/filters; confirm convergence + reset.
8. (Optional) Document the system + reset procedure in README/AGENTS.md.
