// gh.mjs — GitHub data access + PR state derivation for the copilot-pr-tracker canvas.
//
// This mirrors the state machine implemented by the repo's reconciler
// (.github/scripts/copilot-reconcile.mjs). The reconciler *moves* Copilot PRs
// along; this module read-only *observes* where each PR currently sits so the
// canvas can render it. The detection constants below are deliberately kept in
// sync with that script.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// --- Detection constants (kept in sync with copilot-reconcile.mjs) ----------

// The Copilot coding agent authors PRs under `app/copilot-swe-agent`.
const COPILOT_AUTHOR_RE = /copilot-swe-agent/i;
// The Copilot reviewer bot (login form varies across REST/GraphQL surfaces).
const COPILOT_REVIEWER_RE = /copilot.*review/i;
// Once requested, GitHub echoes the pending reviewer back as login "Copilot".
const COPILOT_REQUESTED_RE = /copilot/i;

const LABEL_EXHAUSTED = "copilot-loop-exhausted";
const LABEL_NEEDS_HUMAN = "needs-human-review";
const WIP_RE = /\[WIP\]/;

// --- thin gh CLI wrappers ---------------------------------------------------

async function gh(args, cwd) {
    const { stdout } = await execFileAsync("gh", args, {
        cwd,
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
        env: process.env,
    });
    return stdout;
}

async function ghJson(args, cwd) {
    const out = (await gh(args, cwd)).trim();
    return out ? JSON.parse(out) : null;
}

/** GET a paginated REST array endpoint and flatten pages into one array. */
async function ghApiList(path, cwd) {
    const pages = await ghJson(["api", path, "--paginate", "--slurp"], cwd);
    if (!Array.isArray(pages)) return [];
    return pages.flat();
}

/** Run a GraphQL query. Numbers are passed typed (-F), strings with -f. */
async function ghGraphql(query, vars, cwd) {
    const args = ["api", "graphql", "-f", `query=${query}`];
    for (const [k, v] of Object.entries(vars)) {
        if (typeof v === "number") args.push("-F", `${k}=${v}`);
        else args.push("-f", `${k}=${v}`);
    }
    return ghJson(args, cwd);
}

// --- repo resolution --------------------------------------------------------

// A repo identifier is "owner/name": exactly one slash and no whitespace.
const REPO_RE = /^[^/\s]+\/[^/\s]+$/;

/** Resolve "owner/name" from an explicit override or the working directory. */
export async function resolveRepo(override, cwd) {
    if (override != null && override !== "") {
        const value = String(override).trim();
        if (!REPO_RE.test(value)) {
            throw new Error('repo override must be in "owner/name" format.');
        }
        return value;
    }
    const name = (await gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], cwd)).trim();
    if (!name) throw new Error("Could not resolve the current repository (gh repo view).");
    return name;
}

// --- data access ------------------------------------------------------------

/** Open, non-fork PRs authored by the Copilot coding agent. */
async function listCopilotPRs(repo, cwd) {
    const prs = await ghJson(
        [
            "pr", "list", "--repo", repo, "--state", "open", "--limit", "1000",
            "--json", "number,title,isDraft,author,isCrossRepository,headRefOid,labels,url,updatedAt,additions,deletions",
        ],
        cwd,
    );
    return (prs ?? [])
        .filter((pr) => pr.isCrossRepository === false)
        .filter((pr) => COPILOT_AUTHOR_RE.test(pr.author?.login ?? ""))
        .map((pr) => ({
            number: pr.number,
            title: pr.title,
            url: pr.url,
            isDraft: pr.isDraft,
            headRefOid: pr.headRefOid,
            labels: (pr.labels ?? []).map((l) => l.name),
            updatedAt: pr.updatedAt,
            additions: pr.additions,
            deletions: pr.deletions,
        }));
}

/** The most recent Copilot-reviewer review for a PR, or null if none exists. */
async function getLatestCopilotReview(repo, number, cwd) {
    const [owner, name] = repo.split("/");
    const reviews = await ghApiList(`repos/${owner}/${name}/pulls/${number}/reviews`, cwd);
    const copilotReviews = reviews.filter((r) => COPILOT_REVIEWER_RE.test(r.user?.login ?? ""));
    copilotReviews.sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));
    return copilotReviews.at(-1) ?? null;
}

/** PR detail beyond the list view: current head SHA + requested reviewers. */
async function getPrDetail(repo, number, cwd) {
    const [owner, name] = repo.split("/");
    const pr = await ghJson(["api", `repos/${owner}/${name}/pulls/${number}`], cwd);
    return {
        headSha: pr?.head?.sha,
        requestedReviewers: (pr?.requested_reviewers ?? []).map((u) => u.login),
    };
}

/**
 * Count UNRESOLVED threads raised by the Copilot reviewer in ONE specific
 * review (by numeric databaseId). Scoping to a single review is what keeps a
 * later *clean* review from looking actionable because of stale unresolved
 * threads the coding agent could not resolve — same reasoning as the reconciler.
 */
async function countUnresolvedReviewerThreads(repo, number, reviewDatabaseId, cwd) {
    const [owner, name] = repo.split("/");
    const query =
        "query($owner:String!,$repo:String!,$number:Int!,$cursor:String){" +
        "repository(owner:$owner,name:$repo){pullRequest(number:$number){" +
        "reviewThreads(first:100,after:$cursor){" +
        "nodes{isResolved comments(first:1){nodes{author{login} pullRequestReview{databaseId}}}}" +
        "pageInfo{hasNextPage endCursor}}}}}";
    let count = 0;
    let cursor = null;
    for (let page = 0; page < 50; page++) {
        const vars = { owner, repo: name, number };
        if (cursor) vars.cursor = cursor;
        const conn = (await ghGraphql(query, vars, cwd))?.data?.repository?.pullRequest?.reviewThreads;
        for (const t of conn?.nodes ?? []) {
            if (t.isResolved !== false) continue;
            const c = t.comments?.nodes?.[0];
            if (
                COPILOT_REVIEWER_RE.test(c?.author?.login ?? "") &&
                c?.pullRequestReview?.databaseId === reviewDatabaseId
            ) {
                count++;
            }
        }
        if (!conn?.pageInfo?.hasNextPage) break;
        cursor = conn.pageInfo.endCursor;
    }
    return count;
}

// --- state derivation -------------------------------------------------------

/**
 * The tracked lifecycle states, ordered from "just opened" toward "ready for a
 * human". `column` groups them into the four board columns the user thinks in.
 */
export const COLUMNS = [
    { id: "wip", title: "Work in progress" },
    { id: "review", title: "In Copilot review" },
    { id: "feedback", title: "Addressing feedback" },
    { id: "human", title: "Ready for human review" },
];

/**
 * Derive the display state for a single PR from its metadata plus (for
 * non-draft PRs) the review context gathered from the API.
 *
 * `ctx` is `{}` for drafts / already-flagged PRs (no review lookup needed),
 * otherwise `{ headSha, latest, copilotRequested, unresolvedCount }`.
 */
export function deriveState(pr, ctx) {
    const isWip = WIP_RE.test(pr.title ?? "");
    const hasNeedsHuman = pr.labels.includes(LABEL_NEEDS_HUMAN);
    const hasExhausted = pr.labels.includes(LABEL_EXHAUSTED);

    // Terminal-ish: a human has been asked to take over.
    if (hasExhausted) {
        return state("ready-exhausted", "human", "Ready — loop exhausted",
            "Automated iteration hit the reconciler's round cap. A human should take over. " +
            `Remove the \`${LABEL_EXHAUSTED}\` label to resume automation.`);
    }
    if (hasNeedsHuman) {
        return state("ready-for-human", "human", "Ready for human review",
            "Copilot finished with no remaining feedback — a human should do the final review.");
    }

    if (pr.isDraft) {
        return isWip
            ? state("wip", "wip", "WIP",
                "Draft marked [WIP] — Copilot is still working. The reconciler publishes it once [WIP] is removed.")
            : state("marking-ready", "wip", "Marking ready",
                "Draft with [WIP] removed — the reconciler will mark it ready for review on its next run.");
    }

    // Non-draft: classify from review context.
    if (ctx.copilotRequested) {
        return state("in-review", "review", "In review",
            "Copilot Code Review is reviewing the latest changes.");
    }
    if (ctx.latest && ctx.latest.commit_id === ctx.headSha) {
        if (ctx.unresolvedCount > 0) {
            const n = ctx.unresolvedCount;
            return state("addressing-feedback", "feedback", "Addressing feedback",
                `Copilot reviewer left ${n} unresolved thread${n === 1 ? "" : "s"} on the current head — ` +
                "@copilot has been prodded to address the feedback.");
        }
        return state("review-clean", "human", "Review clean",
            "Latest Copilot review had no unresolved feedback — the reconciler will flag this for human review on its next run.");
    }
    if (ctx.latest) {
        return state("awaiting-rereview", "review", "Awaiting re-review",
            "New commits landed after the last review — the reconciler will request a fresh Copilot review.");
    }
    return state("awaiting-review", "review", "Awaiting review",
        "No Copilot review yet — the reconciler will request Copilot Code Review.");
}

function state(id, column, statusLabel, detail) {
    return { state: id, column, statusLabel, detail };
}

/**
 * Gather the full tracker snapshot for a repo: every open Copilot-authored PR
 * with its derived state and the metadata the UI renders.
 */
export async function gatherState(repo, cwd) {
    const prs = await listCopilotPRs(repo, cwd);
    const enriched = [];
    for (const pr of prs) {
        let ctx = {};
        let review = null;
        const needsReviewLookup =
            !pr.isDraft &&
            !pr.labels.includes(LABEL_NEEDS_HUMAN) &&
            !pr.labels.includes(LABEL_EXHAUSTED);
        if (needsReviewLookup) {
            const [detail, latest] = await Promise.all([
                getPrDetail(repo, pr.number, cwd),
                getLatestCopilotReview(repo, pr.number, cwd),
            ]);
            const headSha = detail.headSha || pr.headRefOid;
            const copilotRequested = detail.requestedReviewers.some((l) => COPILOT_REQUESTED_RE.test(l));
            let unresolvedCount = 0;
            if (latest && latest.commit_id === headSha) {
                unresolvedCount = await countUnresolvedReviewerThreads(repo, pr.number, latest.id, cwd);
            }
            ctx = { headSha, latest, copilotRequested, unresolvedCount };
            if (latest) {
                review = {
                    url: latest.html_url ?? null,
                    state: latest.state ?? null,
                    commitId: latest.commit_id ?? null,
                    onCurrentHead: latest.commit_id === headSha,
                    submittedAt: latest.submitted_at ?? null,
                };
            }
        }
        const derived = deriveState(pr, ctx);
        enriched.push({
            number: pr.number,
            title: pr.title,
            url: pr.url,
            isDraft: pr.isDraft,
            labels: pr.labels,
            headSha: (ctx.headSha || pr.headRefOid || "").slice(0, 7),
            updatedAt: pr.updatedAt,
            additions: pr.additions,
            deletions: pr.deletions,
            unresolvedCount: ctx.unresolvedCount ?? 0,
            review,
            ...derived,
        });
    }
    // Sort by column progression, then most-recently-updated first.
    const order = new Map(COLUMNS.map((c, i) => [c.id, i]));
    enriched.sort((a, b) => {
        const c = (order.get(a.column) ?? 99) - (order.get(b.column) ?? 99);
        if (c !== 0) return c;
        return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
    return { repo, generatedAt: new Date().toISOString(), error: null, prs: enriched };
}
