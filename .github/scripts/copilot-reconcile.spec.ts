import { describe, it, expect } from 'vitest';
import {
  COPILOT_REVIEWER_LOGIN,
  isMarkReadyEligible,
  needsReviewRequest,
  classifyActionableReview,
  selectReviewerThreadsForReview,
  shouldFlagForHumanReview,
  buildMarker,
  parseMarkers,
  countPriorProds,
  ownComments,
  isAlreadyAddressed,
} from './copilot-reconcile.mjs';

describe('COPILOT_REVIEWER_LOGIN (scenario 3 request)', () => {
  it('is the [bot] login, not the display name "Copilot"', () => {
    // Load-bearing: requesting with "Copilot" is silently dropped by the REST API (returns
    // 201 but adds no reviewer). The bot login must be used. See requestCopilotReviewer.
    expect(COPILOT_REVIEWER_LOGIN).toBe('copilot-pull-request-reviewer[bot]');
    expect(COPILOT_REVIEWER_LOGIN).not.toBe('Copilot');
  });
});

describe('isMarkReadyEligible (scenario 1)', () => {
  it('is eligible for a draft PR whose title lacks [WIP]', () => {
    expect(isMarkReadyEligible({ isDraft: true, title: 'Add feature' })).toBe(true);
  });

  it('is not eligible when the title still contains [WIP]', () => {
    expect(isMarkReadyEligible({ isDraft: true, title: '[WIP] Add feature' })).toBe(false);
  });

  it('is not eligible when the PR is already ready (not a draft)', () => {
    expect(isMarkReadyEligible({ isDraft: false, title: 'Add feature' })).toBe(false);
  });

  it('tolerates a missing title', () => {
    expect(isMarkReadyEligible({ isDraft: true })).toBe(true);
  });
});

describe('needsReviewRequest (scenario 3)', () => {
  it('needs a review when no Copilot review exists yet', () => {
    expect(
      needsReviewRequest({ hasCopilotReview: false, latestReviewedCommit: undefined, headSha: 'abc' }),
    ).toBe(true);
  });

  it('needs a review when the latest review looked at an older commit', () => {
    expect(
      needsReviewRequest({ hasCopilotReview: true, latestReviewedCommit: 'old', headSha: 'new' }),
    ).toBe(true);
  });

  it('does not need a review when the latest review is for the current head', () => {
    expect(
      needsReviewRequest({ hasCopilotReview: true, latestReviewedCommit: 'head', headSha: 'head' }),
    ).toBe(false);
  });
});

describe('classifyActionableReview (scenario 2)', () => {
  const headSha = 'head-sha';

  it('is actionable when the latest review is for head and has unresolved threads', () => {
    expect(
      classifyActionableReview({
        latestReview: { id: 1, commit_id: headSha },
        headSha,
        unresolvedThreadCount: 2,
      }),
    ).toBe(true);
  });

  it('is not actionable when there is no review', () => {
    expect(
      classifyActionableReview({ latestReview: null, headSha, unresolvedThreadCount: 3 }),
    ).toBe(false);
  });

  it('is not actionable when the review is for an older commit (a re-review is pending)', () => {
    expect(
      classifyActionableReview({
        latestReview: { id: 1, commit_id: 'older' },
        headSha,
        unresolvedThreadCount: 5,
      }),
    ).toBe(false);
  });

  it('is not actionable for a COMMENTED review with zero unresolved threads (clean/LGTM)', () => {
    expect(
      classifyActionableReview({
        latestReview: { id: 1, commit_id: headSha },
        headSha,
        unresolvedThreadCount: 0,
      }),
    ).toBe(false);
  });
});

describe('selectReviewerThreadsForReview (stale-feedback scoping)', () => {
  // Build a reviewThreads node like the GraphQL response.
  const node = (reviewId, { resolved = false, login = 'copilot-pull-request-reviewer', path = 'f.ts', line = 1 } = {}) => ({
    isResolved: resolved,
    path,
    line,
    comments: { nodes: [{ author: { login }, pullRequestReview: { databaseId: reviewId } }] },
  });

  it('counts only unresolved reviewer threads raised by the given (latest) review', () => {
    const nodes = [
      node(4704523540, { path: 'spec.ts', line: 84 }), // old review
      node(4704523540, { path: 'spec.ts', line: 172 }), // old review
      node(4707398725, { path: 'view.vue', line: 10 }), // latest review
    ];
    expect(selectReviewerThreadsForReview(nodes, 4707398725)).toEqual([
      { path: 'view.vue', line: 10 },
    ]);
  });

  it('yields ZERO for a clean latest review even when stale unresolved threads linger (the PR #36 bug)', () => {
    // Reproduces PR #36: all unresolved threads belong to OLDER reviews; the latest review
    // (4707398725) raised none. Must NOT be treated as actionable.
    const nodes = [
      node(4704523540, { path: 'spec.ts', line: 84 }),
      node(4706809177, { path: 'view.vue', line: 283 }),
      node(4706834457, { path: 'view.vue', line: 283 }),
      node(4707082403, { path: 'view.vue', line: 283 }),
    ];
    expect(selectReviewerThreadsForReview(nodes, 4707398725)).toEqual([]);
  });

  it('excludes resolved threads and non-reviewer (human) authors', () => {
    const nodes = [
      node(500, { resolved: true }), // resolved → excluded
      node(500, { login: 'some-human' }), // not the reviewer → excluded
      node(500, { path: 'keep.ts', line: 7 }), // kept
    ];
    expect(selectReviewerThreadsForReview(nodes, 500)).toEqual([{ path: 'keep.ts', line: 7 }]);
  });

  it('tolerates empty / missing input', () => {
    expect(selectReviewerThreadsForReview([], 1)).toEqual([]);
    expect(selectReviewerThreadsForReview(undefined, 1)).toEqual([]);
  });
});

describe('shouldFlagForHumanReview (scenario 2 "done" branch)', () => {
  const base = {
    isReady: true,
    copilotRequested: false,
    hasNeedsHumanLabel: false,
    alreadyFlaggedForReview: false,
  };

  it('flags when Copilot is done and the PR is ready and not yet flagged', () => {
    expect(shouldFlagForHumanReview(base)).toBe(true);
  });

  it('does not flag a draft PR', () => {
    expect(shouldFlagForHumanReview({ ...base, isReady: false })).toBe(false);
  });

  it('does not flag while a Copilot re-review is still pending', () => {
    expect(shouldFlagForHumanReview({ ...base, copilotRequested: true })).toBe(false);
  });

  it('does not flag when the needs-human-review label is already present', () => {
    expect(shouldFlagForHumanReview({ ...base, hasNeedsHumanLabel: true })).toBe(false);
  });

  it('does not re-flag the same clean review (handoff comment already posted)', () => {
    expect(shouldFlagForHumanReview({ ...base, alreadyFlaggedForReview: true })).toBe(false);
  });
});

describe('marker build/parse + dedup + prod counting', () => {
  it('round-trips a marker through build/parse', () => {
    const body = `hello\n${buildMarker(42, 'deadbeef')}`;
    expect(parseMarkers(body)).toEqual([{ reviewId: '42', head: 'deadbeef' }]);
  });

  it('parses zero markers from an unmarked body', () => {
    expect(parseMarkers('just a normal comment')).toEqual([]);
    expect(parseMarkers('')).toEqual([]);
    expect(parseMarkers(undefined)).toEqual([]);
  });

  it('is stateless across repeated calls (no shared global-regex lastIndex)', () => {
    const body = `${buildMarker(1, 'a')} ${buildMarker(2, 'b')} ${buildMarker(3, 'c')}`;
    const first = parseMarkers(body);
    const second = parseMarkers(body);
    expect(first).toHaveLength(3);
    expect(second).toEqual(first);
  });

  it('counts only comments that carry our marker as prods', () => {
    const comments = [
      { body: 'unrelated human comment' },
      { body: `prod one ${buildMarker(1, 'aaa')}` },
      { body: `prod two ${buildMarker(2, 'bbb')}` },
    ];
    expect(countPriorProds(comments)).toBe(2);
    expect(countPriorProds([])).toBe(0);
    expect(countPriorProds(undefined)).toBe(0);
  });

  it('counts prods only since the most recent exhaustion boundary (reset works)', () => {
    const comments = [
      { body: `prod A ${buildMarker(1, 'aaa')}` },
      { body: `prod B ${buildMarker(2, 'bbb')}` },
      { body: 'exhausted…\n\n<!-- copilot-reconcile: exhausted -->' }, // boundary
      { body: `prod C ${buildMarker(3, 'ccc')}` },
    ];
    // Only the prod after the boundary counts, so removing the label grants fresh rounds.
    expect(countPriorProds(comments)).toBe(1);
  });

  it('detects an already-addressed review by id (dedup), matching across string/number', () => {
    const comments = [{ body: `addressed ${buildMarker(7, 'sha7')}` }];
    expect(isAlreadyAddressed(comments, 7)).toBe(true);
    expect(isAlreadyAddressed(comments, '7')).toBe(true);
    expect(isAlreadyAddressed(comments, 8)).toBe(false);
    expect(isAlreadyAddressed([], 7)).toBe(false);
  });
});

describe('ownComments (marker-forgery guard)', () => {
  const cs = [
    { user: { login: 'reconciler-bot' }, body: 'ours' },
    { user: { login: 'attacker' }, body: 'forged' },
    { user: null, body: 'no author' },
  ];

  it('keeps only comments authored by our own identity', () => {
    expect(ownComments(cs, 'reconciler-bot')).toEqual([
      { user: { login: 'reconciler-bot' }, body: 'ours' },
    ]);
  });

  it('trusts nothing when the self login is unknown', () => {
    expect(ownComments(cs, null)).toEqual([]);
    expect(ownComments(cs, '')).toEqual([]);
  });

  it('tolerates empty / missing input', () => {
    expect(ownComments(undefined, 'reconciler-bot')).toEqual([]);
  });
});
