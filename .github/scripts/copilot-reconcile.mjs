// NOTE: TypeScript "no-check" pragmas are intentionally avoided here (ESLint bans them).
// This script is kept out of type-checking via `checkJs: false` in tsconfig.node.json,
// while still being importable by the unit tests (which rely on types inferred from this
// implementation).
/*
 * Copilot PR reconciler
 * =====================
 *
 * A single, cron-triggered "reconciler" that periodically prods along Copilot coding-agent
 * work that is paused between steps. It replaces three earlier workflows
 * (copilot-mark-ready.yml + the copilot-address-review / copilot-request-review agentic
 * gh-aw workflows) with one deterministic Node script. See
 * `plans/copilot-reconciler-cron-workflow.md` for the full design rationale.
 *
 * WHY CRON (not pull_request): GitHub does not run Actions automatically on events
 * triggered by the Copilot coding agent (the "Approve and run workflows" gate keys on the
 * triggering actor being Copilot, and applies to pull_request AND pull_request_target). A
 * scheduled run is triggered by GitHub's scheduler — a non-Copilot actor — so it is never
 * gated. All writes go through a user-owned PAT (GH_TOKEN = GH_AW_GITHUB_TOKEN) so every
 * action is attributed to a real user, which is also what lets an `@copilot` mention wake
 * the coding agent (a github-actions[bot] mention does not).
 *
 * It handles these scenarios for OPEN, COPILOT-AUTHORED PRs only:
 *   1. Mark ready   — mark a non-[WIP] Copilot draft PR as ready for review.
 *   2. Address review — when the Copilot reviewer's latest review has actionable
 *                       (unresolved-thread) feedback, comment `@copilot` to address it; when
 *                       that review is instead CLEAN (Copilot is done iterating), label the
 *                       PR `needs-human-review` and note that a human should do the final
 *                       review.
 *   3. Request review — after new commits land on a non-draft Copilot PR, request the
 *                       Copilot reviewer if it isn't already reviewing the current head.
 *
 * SAFETY: this script performs only deterministic `gh` calls. All PR/review text is treated
 * as untrusted DATA — it is never executed, and never echoed back as an instruction. Every
 * write is gated behind an idempotent predicate and honors DRY_RUN.
 *
 * No npm dependencies: it shells out to the `gh` CLI (already on the runner, authenticated
 * via GH_TOKEN) using child_process with argument arrays (no shell string interpolation).
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { appendFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

// ---------------------------------------------------------------------------
// Constants (logins, labels, marker)
// ---------------------------------------------------------------------------

// The Copilot coding agent authors PRs under this login (`gh` reports
// `app/copilot-swe-agent`; the bot / display forms are accepted for robustness across API
// surfaces). Scoping every scenario to this author honors "only Copilot-created PRs".
const COPILOT_AUTHOR_RE = /copilot-swe-agent/i;

// The Copilot reviewer bot. NOTE: its reviews carry state "COMMENTED" even when they hold
// actionable inline comments, so we must NOT rely on CHANGES_REQUESTED — we detect
// actionability from unresolved review threads instead. The login form differs by API
// surface (REST reviews report `copilot-pull-request-reviewer[bot]`; GraphQL reports
// `copilot-pull-request-reviewer` with no suffix), so match leniently.
const COPILOT_REVIEWER_RE = /copilot.*review/i;

// The login that MUST be used to REQUEST the Copilot reviewer via the REST
// requested_reviewers endpoint. This exact string is load-bearing: the display name
// "Copilot" (and `gh pr edit --add-reviewer Copilot`) is silently accepted but dropped —
// the API returns success (exit 0 / HTTP 201) yet adds no reviewer, because the bot is not
// a resolvable collaborator under that name. This is GitHub's own value (see
// github/github-mcp-server pkg/github/copilot.go → RequestCopilotReview).
export const COPILOT_REVIEWER_LOGIN = 'copilot-pull-request-reviewer[bot]';

// Once requested, GitHub reports the pending reviewer back in `requested_reviewers` under
// the display login "Copilot" (not the `[bot]` form used to request it). Match any login
// containing "copilot" — only the Copilot reviewer is ever requested by this script.
const COPILOT_REQUESTED_RE = /copilot/i;

const LABEL_EXHAUSTED = 'copilot-loop-exhausted';
const LABEL_NEEDS_HUMAN = 'needs-human-review';

// Hidden HTML marker embedded in our own address-review comments, used to (a) dedupe so we
// prod at most once per Copilot review, and (b) count prior prods for the exhaustion cap.
const MARKER_RE = /copilot-reconcile:\s*addressed-review=(\S+)\s+head=(\S+)\s*-->/g;

// Hidden marker on the exhaustion hand-off comment. It acts as a RESET BOUNDARY: prods are
// counted only after the most recent exhaustion comment, so a human removing the
// `copilot-loop-exhausted` label genuinely grants a fresh N rounds (rather than immediately
// re-hitting the cap on the next actionable review).
const EXHAUSTED_MARKER = '<!-- copilot-reconcile: exhausted -->';

// ---------------------------------------------------------------------------
// Pure decision functions (no I/O — unit-tested in copilot-reconcile.spec.ts)
// ---------------------------------------------------------------------------

/** Scenario 1: a PR is mark-ready-eligible when it is a draft whose title lacks `[WIP]`. */
export function isMarkReadyEligible(pr) {
  return pr.isDraft === true && !/\[WIP\]/.test(pr.title ?? '');
}

/**
 * Scenario 2: a Copilot review is "actionable" (worth prodding `@copilot` about) only when
 * it reviewed the CURRENT head AND left at least one unresolved review thread.
 *
 * - No review                       -> not actionable.
 * - Review is for an older commit    -> not actionable (a re-review is pending via
 *                                       scenario 3; prodding now would double-drive and
 *                                       could repeat forever while threads stay unresolved).
 * - 0 unresolved threads             -> not actionable (a "COMMENTED" summary / "LGTM" /
 *                                       approval with nothing to change).
 */
export function classifyActionableReview({ latestReview, headSha, unresolvedThreadCount }) {
  if (!latestReview) return false;
  if (latestReview.commit_id !== headSha) return false;
  return unresolvedThreadCount > 0;
}

/**
 * Scenario 3: a non-draft PR needs a fresh review request when there is no Copilot review
 * yet, or the latest Copilot review looked at a commit other than the current head.
 */
export function needsReviewRequest({ hasCopilotReview, latestReviewedCommit, headSha }) {
  if (!hasCopilotReview) return true;
  return latestReviewedCommit !== headSha;
}

/** Build the hidden dedup marker embedded in our address-review comments. */
export function buildMarker(reviewId, headSha) {
  return `<!-- copilot-reconcile: addressed-review=${reviewId} head=${headSha} -->`;
}

/** Parse all `{ reviewId, head }` markers out of a single comment body. */
export function parseMarkers(commentBody) {
  const out = [];
  if (!commentBody) return out;
  // Use a FRESH regex per call. matchAll seeds its internal clone from the source regex's
  // `lastIndex`, so sharing one stateful global (/g) regex risks silently missing early
  // markers if `lastIndex` is ever left non-zero. A per-call instance has no shared state.
  const re = new RegExp(MARKER_RE.source, 'g');
  for (const m of commentBody.matchAll(re)) {
    out.push({ reviewId: m[1], head: m[2] });
  }
  return out;
}

/**
 * Count prior `@copilot` prods on the PR, but only those SINCE the most recent exhaustion
 * boundary (a comment carrying EXHAUSTED_MARKER). Counting since the boundary is what makes
 * the documented reset work: removing the `copilot-loop-exhausted` label un-skips the PR and
 * this counter starts fresh, granting another N rounds. `comments` must be in chronological
 * order (the REST issue-comments endpoint returns oldest-first) and pre-filtered to our own
 * authored comments (see ownComments) so a forged marker can't inflate the count.
 */
export function countPriorProds(comments) {
  const list = comments ?? [];
  let boundary = -1;
  for (let i = 0; i < list.length; i++) {
    if ((list[i].body ?? '').includes(EXHAUSTED_MARKER)) boundary = i;
  }
  return list.slice(boundary + 1).filter((c) => parseMarkers(c.body).length > 0).length;
}

/**
 * Keep only comments authored by our own (PAT) identity. Marker text on other users'
 * comments is UNTRUSTED — on a public repo anyone can post a comment with a forged hidden
 * marker to suppress a prod, force exhaustion, or block the human hand-off. `selfLogin` is
 * the login resolved from `gh api user`; if it is unknown, nothing is trusted.
 */
export function ownComments(comments, selfLogin) {
  if (!selfLogin) return [];
  return (comments ?? []).filter((c) => c.user?.login === selfLogin);
}

/** True when some prior comment has already addressed the given review id (dedup). */
export function isAlreadyAddressed(comments, reviewId) {
  const id = String(reviewId);
  return (comments ?? []).some((c) =>
    parseMarkers(c.body).some((mk) => mk.reviewId === id),
  );
}

/**
 * Given that the latest Copilot review is CLEAN (no actionable threads) and for the current
 * head, decide whether to flag the PR for a human's final review. Skip if the PR isn't ready
 * (draft), Copilot is still a pending reviewer (a re-review is in flight), or it was already
 * flagged — either the `needs-human-review` label is present (also set by the exhaustion
 * path) or we already posted a handoff comment for THIS review (so a human clearing the
 * label doesn't cause a re-flag on the same review).
 */
export function shouldFlagForHumanReview({
  isReady,
  copilotRequested,
  hasNeedsHumanLabel,
  alreadyFlaggedForReview,
}) {
  return isReady && !copilotRequested && !hasNeedsHumanLabel && !alreadyFlaggedForReview;
}

// ---------------------------------------------------------------------------
// gh helpers (thin wrappers over the CLI)
// ---------------------------------------------------------------------------

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', env: process.env });
}

function ghJson(args) {
  const out = gh(args).trim();
  return out ? JSON.parse(out) : null;
}

/** GET a paginated REST array endpoint and flatten pages into one array. */
function ghApiList(path) {
  // `--slurp` (with `--paginate`) wraps each page into one JSON array-of-pages; for an
  // array endpoint that is an array of arrays, which we flatten.
  const pages = ghJson(['api', path, '--paginate', '--slurp']);
  if (!Array.isArray(pages)) return [];
  return pages.flat();
}

/** Run a GraphQL query. Numbers are passed with -F (typed), strings with -f. */
function ghGraphql(query, vars) {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [k, v] of Object.entries(vars)) {
    if (typeof v === 'number') args.push('-F', `${k}=${v}`);
    else args.push('-f', `${k}=${v}`);
  }
  return ghJson(args);
}

/** Login of the authenticated (PAT) identity — used to distinguish our own marker comments
 * from untrusted ones. Throws if it can't be resolved (a hard precondition). */
function resolveSelfLogin() {
  // `--jq .login` yields a bare string (not JSON), so read it directly rather than via ghJson.
  const login = gh(['api', 'user', '--jq', '.login']).trim();
  if (!login) {
    throw new Error('Could not resolve the authenticated user login (gh api user).');
  }
  return login;
}

// ---------------------------------------------------------------------------
// Config + logging
// ---------------------------------------------------------------------------

function loadConfig() {
  const repo = process.env.REPO;
  if (!repo || !repo.includes('/')) {
    throw new Error('REPO env must be set to "owner/repo".');
  }
  const [owner, name] = repo.split('/');
  const roundCap = Number.parseInt(process.env.ROUND_CAP ?? '5', 10);
  return {
    repo,
    owner,
    name,
    // DRY_RUN=true reports actions without performing writes. Any value other than the
    // exact string "true" (including empty on scheduled runs) means writes are ON.
    dryRun: (process.env.DRY_RUN ?? 'false').toLowerCase() === 'true',
    roundCap: Number.isNaN(roundCap) ? 5 : roundCap,
  };
}

const summary = [];

function record(line) {
  summary.push(line);
  console.log(line);
}

/**
 * Gate a mutating action behind DRY_RUN. `description` is logged either way; `fn` only runs
 * when writes are enabled.
 */
function performWrite(cfg, description, fn) {
  if (cfg.dryRun) {
    record(`[dry-run] ${description}`);
    return;
  }
  record(description);
  fn();
}

function flushSummary() {
  const file = process.env.GITHUB_STEP_SUMMARY;
  const body =
    '### Copilot reconciler\n\n' +
    (summary.length ? summary.map((l) => `- ${l}`).join('\n') : '- No actions.') +
    '\n';
  if (file) {
    try {
      appendFileSync(file, body);
    } catch {
      /* step summary is best-effort */
    }
  }
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

/** Open, non-fork PRs authored by the Copilot coding agent. */
function listCopilotPRs(cfg) {
  const prs = ghJson([
    'pr',
    'list',
    '--repo',
    cfg.repo,
    '--state',
    'open',
    '--limit',
    '1000',
    '--json',
    'number,title,isDraft,author,isCrossRepository,headRefOid,labels',
  ]);
  return (prs ?? [])
    .filter((pr) => pr.isCrossRepository === false)
    .filter((pr) => COPILOT_AUTHOR_RE.test(pr.author?.login ?? ''))
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      isDraft: pr.isDraft,
      headRefOid: pr.headRefOid,
      labels: (pr.labels ?? []).map((l) => l.name),
    }));
}

function hasLabel(pr, name) {
  return pr.labels.includes(name);
}

/** Latest Copilot-reviewer review for a PR, plus whether any Copilot review exists. */
function getCopilotReviewState(cfg, number) {
  const reviews = ghApiList(`repos/${cfg.owner}/${cfg.name}/pulls/${number}/reviews`);
  const copilotReviews = reviews.filter((r) => COPILOT_REVIEWER_RE.test(r.user?.login ?? ''));
  copilotReviews.sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));
  const latest = copilotReviews.at(-1) ?? null;
  return { hasCopilotReview: copilotReviews.length > 0, latest };
}

/** PR detail we need beyond the list view: current head SHA + requested reviewers. */
function getPrDetail(cfg, number) {
  const pr = ghJson(['api', `repos/${cfg.owner}/${cfg.name}/pulls/${number}`]);
  const requested = (pr?.requested_reviewers ?? []).map((u) => u.login);
  return { headSha: pr?.head?.sha, requestedReviewers: requested };
}

/**
 * From raw `reviewThreads` GraphQL nodes, select the UNRESOLVED threads that were raised by
 * the Copilot reviewer in ONE specific review (identified by its numeric `databaseId`).
 * Returns `{ path, line }` for each. Pure — unit-tested.
 *
 * Scoping to a single review is the crux of the "stale feedback" fix: the Copilot coding
 * agent frequently CANNOT mark review threads resolved, so unresolved threads from earlier
 * rounds pile up and never clear. If we counted every unresolved thread, a later *clean*
 * review (0 new comments) would still look "actionable" and we'd keep prodding @copilot
 * about feedback that was already addressed commits ago. A thread's originating review is
 * its first comment's `pullRequestReview.databaseId`; matching it to the latest review means
 * a clean latest review contributes zero actionable threads regardless of lingering old
 * ones. (The Copilot reviewer opens a NEW thread each review rather than replying to old
 * ones, so keying on the first comment's review is reliable here.)
 */
export function selectReviewerThreadsForReview(nodes, reviewDatabaseId) {
  return (nodes ?? [])
    .filter((t) => t.isResolved === false)
    .filter((t) => {
      const c = t.comments?.nodes?.[0];
      return (
        COPILOT_REVIEWER_RE.test(c?.author?.login ?? '') &&
        c?.pullRequestReview?.databaseId === reviewDatabaseId
      );
    })
    .map((t) => ({ path: t.path, line: t.line }));
}

/**
 * Unresolved Copilot-reviewer threads that belong to the review identified by
 * `reviewDatabaseId` (the latest review's numeric id), with path:line metadata. See
 * selectReviewerThreadsForReview for why threads are scoped to a single review.
 *
 * Paginates every page of review threads: stale threads accumulate (the coding agent often
 * can't resolve them) and are returned oldest-first, so on a long-lived PR the LATEST
 * review's threads land on the last page — fetching only the first page would misclassify an
 * actionable review as clean and trigger a premature human hand-off.
 */
function getUnresolvedReviewerThreads(cfg, number, reviewDatabaseId) {
  const query =
    'query($owner:String!,$repo:String!,$number:Int!,$cursor:String){' +
    'repository(owner:$owner,name:$repo){pullRequest(number:$number){' +
    'reviewThreads(first:100,after:$cursor){' +
    'nodes{isResolved path line comments(first:1){nodes{author{login} pullRequestReview{databaseId}}}}' +
    'pageInfo{hasNextPage endCursor}}}}}';
  const nodes = [];
  let cursor = null;
  // Bound the loop defensively (50 pages = 5000 threads, far beyond any real PR).
  for (let page = 0; page < 50; page++) {
    const vars = { owner: cfg.owner, repo: cfg.name, number };
    if (cursor) vars.cursor = cursor;
    const conn = ghGraphql(query, vars)?.data?.repository?.pullRequest?.reviewThreads;
    for (const n of conn?.nodes ?? []) nodes.push(n);
    if (!conn?.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return selectReviewerThreadsForReview(nodes, reviewDatabaseId);
}

/** Issue-style comments on the PR (used for dedup + prod counting). */
function listComments(cfg, number) {
  return ghApiList(`repos/${cfg.owner}/${cfg.name}/issues/${number}/comments`);
}

// ---------------------------------------------------------------------------
// Scenario 1 — Mark ready
// ---------------------------------------------------------------------------

function markReadyIfEligible(cfg, pr) {
  if (!isMarkReadyEligible(pr)) return;
  performWrite(cfg, `PR #${pr.number}: mark ready for review`, () => {
    gh(['pr', 'ready', String(pr.number), '--repo', cfg.repo]);
  });
  // Whether we actually marked it (or dry-ran), treat it as non-draft for the rest of THIS
  // pass so scenario 3 can request a review immediately — no dependence on event chaining.
  pr.isDraft = false;
}

// ---------------------------------------------------------------------------
// Scenario 2 — Address review: prod @copilot on actionable feedback, or hand off to a
// human when the latest review is clean (Copilot is done).
// ---------------------------------------------------------------------------

function addressReviewIfRequested(cfg, pr) {
  const detail = getPrDetail(cfg, pr.number);
  const headSha = detail.headSha ?? pr.headRefOid;
  const { latest } = getCopilotReviewState(cfg, pr.number);

  // Copilot must have reviewed the CURRENT head; otherwise a re-review is pending — wait.
  if (!latest || latest.commit_id !== headSha) return;

  // Only threads raised by THIS latest review count. Stale unresolved threads from earlier
  // rounds (which the coding agent often can't resolve) must not make a clean re-review look
  // actionable — see selectReviewerThreadsForReview.
  const unresolved = getUnresolvedReviewerThreads(cfg, pr.number, latest.id);
  // Only trust markers on our OWN comments (see ownComments): on a public repo anyone can
  // post a forged hidden marker to manipulate dedup / exhaustion / hand-off.
  const comments = ownComments(listComments(cfg, pr.number), cfg.selfLogin);
  const actionable = classifyActionableReview({
    latestReview: latest,
    headSha,
    unresolvedThreadCount: unresolved.length,
  });

  // CLEAN review → Copilot left no actionable feedback on the current head, so it is done
  // iterating. Flag the PR for a human's final review (once).
  if (!actionable) {
    flagForHumanReviewIfDone(cfg, pr, detail, latest.id, comments);
    return;
  }

  // ACTIONABLE review → prod @copilot (dedup + exhaustion cap).
  // Dedup: prod at most once per Copilot review.
  if (isAlreadyAddressed(comments, latest.id)) return;

  // Exhaustion cap: after N prods on this PR, stop pinging and hand off to a human.
  if (countPriorProds(comments) >= cfg.roundCap) {
    performWrite(
      cfg,
      `PR #${pr.number}: exhaustion cap (${cfg.roundCap}) reached — labelling + human handoff`,
      () => {
        gh([
          'pr',
          'edit',
          String(pr.number),
          '--repo',
          cfg.repo,
          '--add-label',
          LABEL_EXHAUSTED,
          '--add-label',
          LABEL_NEEDS_HUMAN,
        ]);
        postComment(
          cfg,
          pr.number,
          `Automated Copilot iteration is exhausted after ${cfg.roundCap} rounds; ` +
            `a human should now review. (Remove the \`${LABEL_EXHAUSTED}\` label to resume automation.)` +
            `\n\n${EXHAUSTED_MARKER}`,
        );
      },
    );
    return;
  }

  const body = buildAddressComment(latest, headSha, unresolved);
  performWrite(cfg, `PR #${pr.number}: prod @copilot to address review ${latest.id}`, () => {
    postComment(cfg, pr.number, body);
  });
}

/**
 * Build the address-review comment. Only deterministic metadata (review link, file:line of
 * each unresolved thread) is included — never the reviewer's prose, so untrusted text can
 * never smuggle instructions into the coding agent's prompt.
 */
function buildAddressComment(review, headSha, unresolved) {
  const lines = [
    '@copilot please address the review feedback from the Copilot reviewer on this PR. Make sure to mark review threads as resolved when the feedback is addressed.',
    '',
  ];
  if (review.html_url) lines.push(`Review: ${review.html_url}`);
  if (unresolved.length) {
    lines.push('Unresolved threads:');
    for (const t of unresolved) lines.push(`- ${t.path ?? '(file)'}:${t.line ?? '?'}`);
  }
  lines.push('', buildMarker(review.id, headSha));
  return lines.join('\n');
}

function postComment(cfg, number, body) {
  gh(['pr', 'comment', String(number), '--repo', cfg.repo, '--body', body]);
}

/** Hidden marker so a given clean review is handed off to a human at most once. */
function humanReviewMarker(reviewId) {
  return `<!-- copilot-reconcile: human-review=${reviewId} -->`;
}

/**
 * Scenario 2, "done" branch: the latest Copilot review is clean (no actionable threads), so
 * Copilot has finished iterating. Add the `needs-human-review` label and a short comment so
 * it's clear a human should perform the final review. Idempotent — see
 * shouldFlagForHumanReview (skips drafts, in-flight re-reviews, and already-flagged PRs).
 */
function flagForHumanReviewIfDone(cfg, pr, detail, reviewId, comments) {
  const flag = shouldFlagForHumanReview({
    isReady: !pr.isDraft,
    copilotRequested: detail.requestedReviewers.some((l) => COPILOT_REQUESTED_RE.test(l)),
    hasNeedsHumanLabel: hasLabel(pr, LABEL_NEEDS_HUMAN),
    alreadyFlaggedForReview: comments.some((c) =>
      (c.body ?? '').includes(humanReviewMarker(reviewId)),
    ),
  });
  if (!flag) return;

  performWrite(
    cfg,
    `PR #${pr.number}: Copilot review clean — adding ${LABEL_NEEDS_HUMAN} for human final review`,
    () => {
      gh(['pr', 'edit', String(pr.number), '--repo', cfg.repo, '--add-label', LABEL_NEEDS_HUMAN]);
      postComment(
        cfg,
        pr.number,
        `The Copilot reviewer finished its review with no remaining feedback, so automated ` +
          `Copilot iteration is complete. Adding the \`${LABEL_NEEDS_HUMAN}\` label — a human ` +
          `should now perform the final review.\n\n${humanReviewMarker(reviewId)}`,
      );
    },
  );
}

// ---------------------------------------------------------------------------
// Scenario 3 — Request review after new pushes
// ---------------------------------------------------------------------------

function requestReviewIfNeeded(cfg, pr) {
  if (pr.isDraft) return;

  const detail = getPrDetail(cfg, pr.number);
  const headSha = detail.headSha ?? pr.headRefOid;
  const { hasCopilotReview, latest } = getCopilotReviewState(cfg, pr.number);

  const needs = needsReviewRequest({
    hasCopilotReview,
    latestReviewedCommit: latest?.commit_id,
    headSha,
  });
  if (!needs) return;

  // Already-reviewing guard: skip if Copilot is already a pending requested reviewer.
  if (detail.requestedReviewers.some((l) => COPILOT_REQUESTED_RE.test(l))) return;

  if (cfg.dryRun) {
    record(`[dry-run] PR #${pr.number}: request Copilot reviewer for ${short(headSha)}`);
    return;
  }

  record(`PR #${pr.number}: requesting Copilot reviewer for ${short(headSha)}`);
  const ok = requestCopilotReviewer(cfg, pr.number);
  if (!ok) {
    record(
      `PR #${pr.number}: WARNING — could not add the Copilot reviewer; manual follow-up needed.`,
    );
  }
}

/**
 * Request the Copilot reviewer and CONFIRM it actually took effect.
 *
 * The login is load-bearing: `gh pr edit --add-reviewer Copilot` and the REST endpoint with
 * the display login "Copilot" both report success (exit 0 / HTTP 201) but add NO reviewer,
 * because the bot is not a resolvable collaborator under that name — this was the original
 * bug (the old code trusted that non-error as success). The login that works over REST is
 * `copilot-pull-request-reviewer[bot]` (COPILOT_REVIEWER_LOGIN) — GitHub's own value (see
 * github/github-mcp-server pkg/github/copilot.go → RequestCopilotReview). It works even for
 * a re-request after Copilot has already reviewed once.
 *
 * Because the API reports success even when it silently drops the reviewer, we do NOT trust
 * the exit status: after the request we re-read `requested_reviewers` and verify. A false
 * return surfaces a warning; the next scheduled run retries (no alternate API path would
 * help — the same failure modes, e.g. Copilot review disabled, affect every mechanism).
 *
 * Returns true iff Copilot ends up as a requested reviewer.
 */
function requestCopilotReviewer(cfg, number) {
  try {
    gh([
      'api',
      '--method',
      'POST',
      `repos/${cfg.owner}/${cfg.name}/pulls/${number}/requested_reviewers`,
      '-f',
      `reviewers[]=${COPILOT_REVIEWER_LOGIN}`,
    ]);
  } catch (err) {
    record(`PR #${number}: REST reviewer request errored (${errMsg(err)})`);
  }
  return isCopilotRequested(cfg, number);
}

/** Re-read the PR and report whether the Copilot reviewer is currently requested. */
function isCopilotRequested(cfg, number) {
  const pr = ghJson(['api', `repos/${cfg.owner}/${cfg.name}/pulls/${number}`]);
  return (pr?.requested_reviewers ?? []).some((u) => COPILOT_REQUESTED_RE.test(u.login ?? ''));
}

// ---------------------------------------------------------------------------
// Misc small helpers
// ---------------------------------------------------------------------------

function short(sha) {
  return sha ? String(sha).slice(0, 7) : '(unknown)';
}

function errMsg(err) {
  return err?.message ? String(err.message).split('\n')[0] : String(err);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const cfg = loadConfig();
  // Resolve our own identity up front so we can trust only our own marker comments.
  cfg.selfLogin = resolveSelfLogin();
  record(
    `Reconciling ${cfg.repo} as ${cfg.selfLogin} (dryRun=${cfg.dryRun}, roundCap=${cfg.roundCap}).`,
  );

  const prs = listCopilotPRs(cfg);
  record(`Found ${prs.length} open Copilot-authored PR(s): ${prs.map((p) => '#' + p.number).join(', ') || '(none)'}`);

  for (const pr of prs) {
    // Loop-exhausted PRs are left entirely to a human until the label is removed.
    if (hasLabel(pr, LABEL_EXHAUSTED)) {
      record(`PR #${pr.number}: skipped (${LABEL_EXHAUSTED}).`);
      continue;
    }
    try {
      markReadyIfEligible(cfg, pr); // Scenario 1
      requestReviewIfNeeded(cfg, pr); // Scenario 3
      addressReviewIfRequested(cfg, pr); // Scenario 2
    } catch (err) {
      // One PR's failure must not abort the whole reconcile pass.
      record(`PR #${pr.number}: error — ${errMsg(err)}`);
    }
  }

  flushSummary();
}

// Only run when executed directly (`node copilot-reconcile.mjs`), not when imported by the
// unit tests. This keeps the pure functions above importable without side effects. Normalize
// argv[1] to an absolute path first (path.resolve handles relative and `./`-prefixed forms),
// so the reconciler runs regardless of how the workflow invokes it.
const isMain =
  Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolvePath(process.argv[1]);
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
