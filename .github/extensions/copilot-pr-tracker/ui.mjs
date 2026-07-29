// ui.mjs — the iframe renderer for the copilot-pr-tracker canvas.
// A single self-contained HTML document: themed CSS + client JS that renders
// the tracker snapshot as a four-column board and keeps it live via SSE.

export function renderHtml(options = {}) {
    // One renderer serves three consumers by varying only these endpoints:
    //   - canvas + local server: live /api/state, /api/refresh, SSE /events.
    //   - static site (GitHub Pages): fetch ./state.json, no SSE, refresh re-GETs.
    const config = {
        stateUrl: options.stateUrl ?? "/api/state",
        refreshUrl: "refreshUrl" in options ? options.refreshUrl : "/api/refresh",
        eventsUrl: "eventsUrl" in options ? options.eventsUrl : "/events",
        pollMs: options.pollMs ?? 45000,
        cacheBust: options.cacheBust ?? false,
        subtitle: options.subtitle ?? "",
    };
    // Escape "<" so a config value can't break out of the <script> element.
    const configJson = JSON.stringify(config).replace(/</g, "\\u003c");
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

  /* Standalone website palette (served by server.mjs or the static Pages build,
     i.e. outside the Copilot App). Inside the canvas the host injects a synced
     light/dark theme, so these rules are scoped under html.standalone — a class
     the script below adds ONLY when those host tokens are absent — and never
     affect the embedded canvas. */
  html.standalone {
    color-scheme: light;
    --background-color-default: #ffffff;
    --surface: #ffffff;
    --text-color-default: #1f2328;
    --text-color-muted: #656d76;
    --border-color-default: #d0d7de;
  }
  html.standalone.dark {
    color-scheme: dark;
    --background-color-default: #0d1117;
    --surface: #161b22;
    --text-color-default: #e6edf3;
    --text-color-muted: #8b949e;
    --border-color-default: #30363d;
    /* Accents brightened for legibility on a dark background. These flow into
       the --c-* tokens above via var() substitution. */
    --true-color-gray: #8b949e;
    --true-color-purple: #d2a8ff;
    --true-color-blue: #4493f8;
    --true-color-orange: #ec8e2c;
    --true-color-teal: #39c5cf;
    --true-color-green: #3fb950;
    --true-color-red: #f85149;
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
    background: var(--surface, var(--background-color-default, #ffffff));
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
  .subtitle { font-size: 12px; color: var(--text-color-muted, #656d76); }
  button.refresh {
    font: inherit; font-size: 13px; cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--surface, var(--background-color-default, #ffffff));
    color: var(--text-color-default, #1f2328);
    border: 1px solid var(--border-color-default, #d0d7de);
    border-radius: 6px; padding: 5px 12px;
  }
  button.refresh:hover { border-color: var(--c-review); color: var(--c-review); }
  button.refresh:disabled { opacity: .55; cursor: default; }
  button.theme-toggle {
    font: inherit; font-size: 13px; cursor: pointer;
    display: none; align-items: center; gap: 6px;
    background: var(--surface, var(--background-color-default, #ffffff));
    color: var(--text-color-default, #1f2328);
    border: 1px solid var(--border-color-default, #d0d7de);
    border-radius: 6px; padding: 5px 10px;
  }
  button.theme-toggle:hover { border-color: var(--c-review); color: var(--c-review); }
  .theme-glyph { font-size: 14px; line-height: 1; }
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
    background: var(--surface, var(--background-color-default, #ffffff));
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
    <span class="subtitle" id="subtitle"></span>
    <span class="spacer"></span>
    <span class="updated" id="updated"></span>
    <button class="theme-toggle" id="theme-toggle" onclick="cycleTheme()" title="Theme" aria-label="Theme">
      <span class="theme-glyph" aria-hidden="true">&#9681;</span>
      <span class="theme-label">Auto</span>
    </button>
    <button class="refresh" id="refresh" onclick="doRefresh()">
      <span class="dot" id="refresh-dot" style="background: var(--c-review);"></span>
      <span id="refresh-label">Refresh</span>
    </button>
  </header>
  <div id="banner-slot"></div>
  <div id="content"><div class="loading-hint">Loading Copilot PRs…</div></div>

<script>
  const CONFIG = ${configJson};
  function withBust(url) {
    if (!CONFIG.cacheBust) return url;
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now();
  }

  // --- Theme (standalone website only) -----------------------------------
  // Embedded in the Copilot App, the host injects a synced light/dark theme, so
  // we leave theming to it. Served as a plain website there is no host, so we
  // supply our own palette + an Auto/Light/Dark toggle (persisted). We detect
  // "standalone" by the absence of the host's theme tokens/attributes; only then
  // do we add the html.standalone class the dark-mode CSS above is scoped to.
  var THEME_MODES = ["auto", "light", "dark"];
  var THEME_GLYPH = { auto: "\u25D1", light: "\u2600", dark: "\u263D" };
  var THEME_LABEL = { auto: "Auto", light: "Light", dark: "Dark" };
  var themeMedia = window.matchMedia("(prefers-color-scheme: dark)");
  var themeMode = "auto";
  var standaloneTheme = false;

  function hostThemed() {
    function has(node) {
      if (!node) return false;
      if (node.hasAttribute && (node.hasAttribute("data-color-mode") || node.hasAttribute("data-theme-source"))) return true;
      if (node.classList && node.classList.contains("pointer-on-hover")) return true;
      var v = getComputedStyle(node).getPropertyValue("--background-color-default");
      return !!(v && v.trim());
    }
    return has(document.documentElement) || has(document.body);
  }
  function applyTheme() {
    if (!standaloneTheme) return;
    var dark = themeMode === "dark" || (themeMode === "auto" && themeMedia.matches);
    document.documentElement.classList.toggle("dark", dark);
    var btn = document.getElementById("theme-toggle");
    if (btn) {
      var g = btn.querySelector(".theme-glyph");
      var t = btn.querySelector(".theme-label");
      if (g) g.textContent = THEME_GLYPH[themeMode];
      if (t) t.textContent = THEME_LABEL[themeMode];
      btn.title = "Theme: " + THEME_LABEL[themeMode];
      btn.setAttribute("aria-label", "Theme: " + THEME_LABEL[themeMode] + " (click to change)");
    }
  }
  function cycleTheme() {
    themeMode = THEME_MODES[(THEME_MODES.indexOf(themeMode) + 1) % THEME_MODES.length];
    try { localStorage.setItem("prTrackerTheme", themeMode); } catch (e) { /* ignore */ }
    applyTheme();
  }
  function initTheme() {
    if (hostThemed()) return; // embedded canvas: the host owns light/dark.
    standaloneTheme = true;
    document.documentElement.classList.add("standalone");
    var stored = null;
    try { stored = localStorage.getItem("prTrackerTheme"); } catch (e) { /* ignore */ }
    if (THEME_MODES.indexOf(stored) >= 0) themeMode = stored;
    var btn = document.getElementById("theme-toggle");
    if (btn) btn.style.display = "inline-flex";
    if (themeMedia.addEventListener) themeMedia.addEventListener("change", applyTheme);
    else if (themeMedia.addListener) themeMedia.addListener(applyTheme);
    applyTheme();
  }
  initTheme();
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

  async function fetchState(url, opts) {
    const r = await fetch(url, opts);
    if (!r.ok) {
      let body = "";
      try { body = (await r.text()).slice(0, 300); } catch (e) { /* ignore */ }
      throw new Error("HTTP " + r.status + " " + r.statusText + (body ? ": " + body : ""));
    }
    return r.json();
  }

  function errMessage(e) { return e && e.message ? e.message : String(e); }

  async function doRefresh() {
    if (busy) return;
    setBusy(true);
    try {
      const data = CONFIG.refreshUrl
        ? await fetchState(CONFIG.refreshUrl, { method: "POST" })
        : await fetchState(withBust(CONFIG.stateUrl));
      render(data);
    } catch (e) {
      render({ error: errMessage(e), prs: [], columns: [] });
    } finally {
      setBusy(false);
    }
  }

  async function loadInitial() {
    const sub = document.getElementById("subtitle");
    if (sub) sub.textContent = CONFIG.subtitle || "";
    try {
      render(await fetchState(withBust(CONFIG.stateUrl)));
    } catch (e) {
      render({ error: errMessage(e), prs: [], columns: [] });
    }
  }

  // Live updates pushed by the server (e.g. when the agent invokes refresh).
  // Only when an events endpoint is configured — the static site has none.
  if (CONFIG.eventsUrl) {
    try {
      const es = new EventSource(CONFIG.eventsUrl);
      es.onmessage = (ev) => {
        if (busy) return;
        // Guard the parse/render so one malformed or non-JSON event (e.g. a
        // keepalive) can't throw and kill subsequent live updates.
        try {
          render(JSON.parse(ev.data));
        } catch (err) {
          /* ignore a bad event and keep the stream alive */
        }
      };
    } catch (e) { /* SSE optional */ }
  }

  loadInitial();
  // Gentle auto-refresh while the panel/tab is visible.
  setInterval(() => { if (document.visibilityState === "visible") doRefresh(); }, CONFIG.pollMs);
</script>
</body>
</html>`;
}
