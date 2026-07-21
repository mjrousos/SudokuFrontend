// ui.mjs — the iframe renderer for the copilot-pr-tracker canvas.
// A single self-contained HTML document: themed CSS + client JS that renders
// the tracker snapshot as a four-column board and keeps it live via SSE.

export function renderHtml() {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Copilot PR tracker</title>
<style>
  :root {
    --c-wip: var(--true-color-gray, #6e7781);
    --c-marking: var(--true-color-purple, #8250df);
    --c-review: var(--true-color-blue, #0969da);
    --c-feedback: var(--true-color-orange, #bc4c00);
    --c-clean: var(--true-color-teal, #1b7c83);
    --c-human: var(--true-color-green, #1a7f37);
    --c-exhausted: var(--true-color-red, #cf222e);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--background-color-default, #ffffff);
    color: var(--text-color-default, #1f2328);
    font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
    font-size: var(--text-body-medium, 14px);
    line-height: var(--leading-body-medium, 20px);
  }
  header {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border-color-default, #d0d7de);
    position: sticky; top: 0; z-index: 5;
    background: var(--background-color-default, #ffffff);
  }
  h1 {
    margin: 0;
    font-size: var(--text-title-medium, 18px);
    font-weight: var(--font-weight-semibold, 600);
    line-height: 1.2;
  }
  .repo {
    font-family: var(--font-mono, "SFMono-Regular", Consolas, monospace);
    font-size: 12px;
    color: var(--text-color-muted, #656d76);
    border: 1px solid var(--border-color-default, #d0d7de);
    border-radius: 999px; padding: 2px 10px;
  }
  .spacer { flex: 1 1 auto; }
  .updated { font-size: 12px; color: var(--text-color-muted, #656d76); }
  button.refresh {
    font: inherit; font-size: 13px; cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--background-color-default, #ffffff);
    color: var(--text-color-default, #1f2328);
    border: 1px solid var(--border-color-default, #d0d7de);
    border-radius: 6px; padding: 5px 12px;
  }
  button.refresh:hover { border-color: var(--c-review); color: var(--c-review); }
  button.refresh:disabled { opacity: .55; cursor: default; }
  .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin .8s linear infinite; }

  .banner {
    margin: 12px 18px 0; padding: 10px 14px; border-radius: 8px;
    border: 1px solid var(--c-exhausted);
    background: color-mix(in srgb, var(--c-exhausted) 10%, transparent);
    font-size: 13px;
  }

  .board {
    display: grid; grid-template-columns: repeat(4, minmax(240px, 1fr));
    gap: 14px; padding: 16px 18px 28px; align-items: start;
  }
  @media (max-width: 900px) { .board { grid-auto-flow: column; grid-auto-columns: 280px; grid-template-columns: none; overflow-x: auto; } }
  .col { min-width: 0; }
  .col-head {
    display: flex; align-items: center; gap: 8px; margin-bottom: 10px;
    font-weight: var(--font-weight-semibold, 600); font-size: 13px;
  }
  .col-accent { width: 10px; height: 10px; border-radius: 3px; }
  .count {
    margin-left: auto; font-size: 12px; font-weight: 600;
    color: var(--text-color-muted, #656d76);
    background: color-mix(in srgb, var(--text-color-muted, #656d76) 12%, transparent);
    border-radius: 999px; padding: 1px 9px; min-width: 22px; text-align: center;
  }
  .empty {
    font-size: 12px; color: var(--text-color-muted, #656d76);
    border: 1px dashed var(--border-color-default, #d0d7de);
    border-radius: 8px; padding: 14px; text-align: center;
  }
  .card {
    border: 1px solid var(--border-color-default, #d0d7de);
    border-left: 4px solid var(--accent, var(--c-review));
    border-radius: 8px; padding: 11px 12px; margin-bottom: 10px;
    background: var(--background-color-default, #ffffff);
  }
  .card-top { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .num { font-family: var(--font-mono, monospace); font-size: 12px; color: var(--text-color-muted, #656d76); text-decoration: none; }
  .num:hover { color: var(--c-review); text-decoration: underline; }
  .badge {
    margin-left: auto; display: inline-flex; align-items: center; gap: 5px;
    font-size: 11px; font-weight: 600; white-space: nowrap;
    color: var(--accent, var(--c-review));
    background: color-mix(in srgb, var(--accent, var(--c-review)) 12%, transparent);
    border-radius: 999px; padding: 2px 8px;
  }
  .title { display: block; font-weight: 600; color: var(--text-color-default, #1f2328); text-decoration: none; margin: 2px 0 6px; }
  .title:hover { color: var(--c-review); text-decoration: underline; }
  .detail { font-size: 12px; color: var(--text-color-muted, #656d76); margin: 0 0 8px; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; font-size: 11px; color: var(--text-color-muted, #656d76); }
  .chip { border: 1px solid var(--border-color-default, #d0d7de); border-radius: 999px; padding: 0 7px; line-height: 17px; }
  .add { color: var(--c-human); font-family: var(--font-mono, monospace); }
  .del { color: var(--c-exhausted); font-family: var(--font-mono, monospace); }
  .rev { color: var(--c-review); text-decoration: none; }
  .rev:hover { text-decoration: underline; }
  .loading-hint { padding: 40px 18px; text-align: center; color: var(--text-color-muted, #656d76); }
</style>
</head>
<body>
  <header>
    <h1>Copilot PR tracker</h1>
    <span class="repo" id="repo">…</span>
    <span class="spacer"></span>
    <span class="updated" id="updated"></span>
    <button class="refresh" id="refresh" onclick="doRefresh()">
      <span class="dot" id="refresh-dot" style="background: var(--c-review);"></span>
      <span id="refresh-label">Refresh</span>
    </button>
  </header>
  <div id="banner-slot"></div>
  <div id="content"><div class="loading-hint">Loading Copilot PRs…</div></div>

<script>
  const STATE_ACCENT = {
    "wip": "var(--c-wip)",
    "marking-ready": "var(--c-marking)",
    "awaiting-review": "var(--c-review)",
    "awaiting-rereview": "var(--c-review)",
    "in-review": "var(--c-review)",
    "addressing-feedback": "var(--c-feedback)",
    "review-clean": "var(--c-clean)",
    "ready-for-human": "var(--c-human)",
    "ready-exhausted": "var(--c-exhausted)",
  };
  const COL_ACCENT = {
    "wip": "var(--c-wip)",
    "review": "var(--c-review)",
    "feedback": "var(--c-feedback)",
    "human": "var(--c-human)",
  };

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function rel(iso) {
    if (!iso) return "";
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "just now";
    const m = s / 60; if (m < 60) return Math.floor(m) + "m ago";
    const h = m / 60; if (h < 24) return Math.floor(h) + "h ago";
    return Math.floor(h / 24) + "d ago";
  }

  function cardHtml(pr) {
    const accent = STATE_ACCENT[pr.state] || "var(--c-review)";
    const labels = (pr.labels || [])
      .map((l) => '<span class="chip">' + esc(l) + "</span>").join("");
    const diff =
      (pr.additions != null ? '<span class="add">+' + pr.additions + "</span>" : "") +
      (pr.deletions != null ? '<span class="del">\u2212' + pr.deletions + "</span>" : "");
    const reviewLink = pr.review && pr.review.url
      ? '<a class="rev" href="' + esc(pr.review.url) + '" target="_blank" rel="noopener">reviewed ' + rel(pr.review.submittedAt) + "</a>"
      : "";
    return (
      '<div class="card" style="--accent:' + accent + '">' +
        '<div class="card-top">' +
          '<a class="num" href="' + esc(pr.url) + '" target="_blank" rel="noopener">#' + pr.number + "</a>" +
          '<span class="badge"><span class="dot" style="background:' + accent + '"></span>' + esc(pr.statusLabel) + "</span>" +
        "</div>" +
        '<a class="title" href="' + esc(pr.url) + '" target="_blank" rel="noopener">' + esc(pr.title) + "</a>" +
        '<p class="detail">' + esc(pr.detail) + "</p>" +
        '<div class="meta">' +
          labels + diff +
          (pr.headSha ? '<span class="chip">' + esc(pr.headSha) + "</span>" : "") +
          '<span>updated ' + rel(pr.updatedAt) + "</span>" +
          reviewLink +
        "</div>" +
      "</div>"
    );
  }

  function render(data) {
    document.getElementById("repo").textContent = data.repo || "";
    document.getElementById("updated").textContent =
      data.generatedAt ? "updated " + rel(data.generatedAt) : "";

    const bannerSlot = document.getElementById("banner-slot");
    bannerSlot.innerHTML = data.error
      ? '<div class="banner"><strong>Couldn\\'t load PRs.</strong> ' + esc(data.error) + "</div>"
      : "";

    const content = document.getElementById("content");
    const cols = data.columns || [];
    const prs = data.prs || [];

    if (!data.error && prs.length === 0) {
      content.innerHTML = '<div class="loading-hint">No open Copilot-authored PRs right now. 🎉</div>';
      return;
    }

    content.innerHTML =
      '<div class="board">' +
      cols.map((col) => {
        const items = prs.filter((p) => p.column === col.id);
        const body = items.length
          ? items.map(cardHtml).join("")
          : '<div class="empty">None</div>';
        return (
          '<div class="col">' +
            '<div class="col-head">' +
              '<span class="col-accent" style="background:' + (COL_ACCENT[col.id] || "var(--c-review)") + '"></span>' +
              esc(col.title) +
              '<span class="count">' + items.length + "</span>" +
            "</div>" +
            body +
          "</div>"
        );
      }).join("") +
      "</div>";
  }

  let busy = false;
  function setBusy(on) {
    busy = on;
    const btn = document.getElementById("refresh");
    const dot = document.getElementById("refresh-dot");
    const label = document.getElementById("refresh-label");
    btn.disabled = on;
    dot.className = on ? "dot spin" : "dot";
    dot.style.border = on ? "2px solid var(--c-review)" : "";
    dot.style.background = on ? "transparent" : "var(--c-review)";
    dot.style.borderTopColor = on ? "transparent" : "";
    label.textContent = on ? "Refreshing…" : "Refresh";
  }

  async function doRefresh() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/refresh", { method: "POST" });
      render(await r.json());
    } catch (e) {
      render({ error: String(e), prs: [], columns: [] });
    } finally {
      setBusy(false);
    }
  }

  async function loadInitial() {
    try {
      const r = await fetch("/api/state");
      render(await r.json());
    } catch (e) {
      render({ error: String(e), prs: [], columns: [] });
    }
  }

  // Live updates pushed by the extension (e.g. when the agent invokes refresh).
  try {
    const es = new EventSource("/events");
    es.onmessage = (ev) => { if (!busy) render(JSON.parse(ev.data)); };
  } catch (e) { /* SSE optional */ }

  loadInitial();
  // Gentle auto-refresh while the panel is visible.
  setInterval(() => { if (document.visibilityState === "visible") doRefresh(); }, 45000);
</script>
</body>
</html>`;
}
