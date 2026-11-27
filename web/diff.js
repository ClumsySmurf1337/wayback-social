/* OSINT research tools — deleted diff mode (issue #13 follow-up).
 * One handle, one network; CDX rows are deduped to one row per post
 * (latest capture) and each post is live-checked through
 * /api/live-check (web/live-check.js) — live / deleted / unknown,
 * unknown never counted as deleted; every row keeps its Wayback
 * snapshot link. Non-post captures (profile / listing pages) are
 * skipped and counted, never live-checked — a 404 on a profile page
 * is not a deleted post (same rule as the CLI diff).
 *
 * Deleted diff is a paid feature (pricing.yaml
 * features.deleted_diff: false on free, true on Starter/Pro/Studio/
 * Bundle) — enforced in runDiff() before any search runs.
 *
 * Lives in the #osint-tools section of index.html; batch.js owns the
 * section routing and calls initDiff() from initOsintTools(). Shared
 * helpers come from batch.js (WS_OSINT state, setOsintRows,
 * currentCapsLocal, jsonExportAllowed, fmtTs, esc) and console.js
 * ($, showDlg, recordHistory, recordUsage, activeJob).
 *
 * No build step. Browser + Node for the pure helpers (module.exports
 * guard at the bottom). No CLI text anywhere on the page.
 */
"use strict";

/* --- Pure helpers (node-testable) ---------------------------------- */
// One post key per archived URL, or null when the row is not a post
// (profile / listing page). Mirrors the CLI's post_id extraction
// closely enough for the web: a post URL has a post-shaped path.
const POST_PATTERNS = {
  x: /\/status\/(\d+)/,
  instagram: /\/(?:p|reel)\/([\w-]+)/,
  facebook: /\/posts\/(\d+)/,
  tiktok: /\/video\/(\d+)/,
  youtube: /[?&]v=([\w-]{6,})|\/shorts\/([\w-]+)/,
  reddit: /\/comments\/([\w]+)/,
  threads: /\/post\/([\w-]+)/,
  bluesky: /\/post\/([\w]+)/,
  mastodon: /\/@[^/]+\/(\d+)/,
  tumblr: /\/post\/(\d+)/,
  twitch: /\/(?:videos|clip)\/([\w-]+)/,
};
function postKey(net, url) {
  if (!url) return null;
  const m = POST_PATTERNS[net];
  if (m) {
    const hit = m.exec(url);
    return hit ? net + ":" + (hit[1] || hit[2]) : null;
  }
  // Networks without a post-shaped path: the profile page itself is
  // not a post; anything deeper is treated as one post per URL.
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").filter(Boolean);
    return segs.length > 1 ? net + ":" + u.pathname : null;
  } catch (e) {
    return null;
  }
}

// Dedupe CDX rows to one per post (latest capture kept, earliest
// remembered). Returns {posts, skipped} — posts carry live_* fields
// (empty until live-checked) so the evidence pack can cite them.
function dedupePosts(rows, net, id) {
  const best = {}, order = [];
  let skipped = 0;
  (rows || []).forEach(function (r) {
    const orig = r[2], ts = r[1];
    const key = postKey(net, orig);
    if (!key) { skipped += 1; return; }
    if (!best[key]) { best[key] = null; order.push(key); }
    const cur = best[key];
    if (!cur || ts > cur.archived_timestamp) {
      best[key] = {
        network: net, identifier: id, post_id: key.split(":").slice(1).join(":"),
        archived_timestamp: ts, original_post_url: orig,
        archived_post_url: "https://web.archive.org/web/" + ts + "/" + orig,
        archived_statuscode: r[4] || "", archived_mimetype: r[3] || "",
        first_archived_timestamp: cur ? cur.first_archived_timestamp : ts,
        live_verdict: "", live_http_status: "", live_checked_at: "",
      };
    }
  });
  return { posts: order.map(function (k) { return best[k]; }), skipped: skipped };
}

/* --- Browser wiring (needs batch.js + console.js globals) ------------ */
function verdictCell(v) {
  if (v === "deleted") return '<span class="pill poor">deleted</span>';
  if (v === "live") return '<span class="pill good">live</span>';
  return '<span class="pill">unknown</span>';
}

function renderDiff(posts, skipped, onlyDeleted) {
  const shown = onlyDeleted ? posts.filter(function (p) { return p.live_verdict === "deleted"; }) : posts;
  const counts = { live: 0, deleted: 0, unknown: 0 };
  posts.forEach(function (p) { counts[p.live_verdict] = (counts[p.live_verdict] || 0) + 1; });
  $("diff-status").textContent = "Posts: " + posts.length + " — live " + counts.live + ", deleted " + counts.deleted +
    ", unknown " + counts.unknown + (skipped ? " (" + skipped + " non-post capture(s) skipped — profile / listing pages, not posts)." : ".") +
    (onlyDeleted ? " Showing deleted only." : "");
  // #diff-results is the tbody of #diff-table (rows written here must be
  // <tr>s inside a table, not loose markup in a div).
  $("diff-table").hidden = false;
  $("diff-results").innerHTML = shown.length ? shown.map(function (p) {
    return "<tr><td>" + fmtTs(p.archived_timestamp) + "</td>" +
      "<td><a href=\"" + esc(p.original_post_url) + "\" target=\"_blank\" rel=\"noopener\">" + esc(p.original_post_url) + "</a></td>" +
      "<td><a href=\"" + esc(p.archived_post_url) + "\" target=\"_blank\" rel=\"noopener\">snapshot</a></td>" +
      "<td>" + verdictCell(p.live_verdict) + "</td></tr>";
  }).join("") : '<tr><td colspan="4" class="muted">No deleted posts in this set.</td></tr>';
  $("diff-actions").hidden = !posts.length;
  WS_OSINT.diffRows = posts;
  WS_OSINT.diffSkipped = skipped;
  // Evidence pack + exports see the diff rows (with verdicts).
  setOsintRows(posts.map(function (p) {
    return ["", p.archived_timestamp, p.original_post_url, p.archived_mimetype, p.archived_statuscode, "", ""];
  }), posts.map(function (p) { return p.network; }), { mode: "diff" });
}

async function runDiff() {
  const net = $("diff-network").value, id = $("diff-handle").value.trim().replace(/^@/, "") || "jack";
  const from = $("diff-from").value.trim(), to = $("diff-to").value.trim();
  if ((from && !/^\d{8}$/.test(from)) || (to && !/^\d{8}$/.test(to))) {
    $("diff-status").textContent = "From/To dates must be YYYYMMDD — pick a date or clear the field. No search was run.";
    return;
  }
  const caps = currentCapsLocal();
  // Deleted diff is a paid feature (pricing.yaml features.deleted_diff:
  // false on free, true on Starter/Pro/Studio/Bundle) — the free tier
  // can search the archive and download captures, but live/deleted
  // verdicts need a paid key. Same gate as the pricing chart shows.
  if (!caps.deleted_diff) {
    $("diff-status").textContent = "Deleted diff is a Starter feature — the free tier can search the archive and download captures, but live / deleted verdicts need Starter ($9 launch) or above. See Pricing below.";
    showDlg("Deleted diff needs Starter",
      "Live / deleted verdicts are a paid feature (Starter $9 launch, Pro $19, Studio $49, or the All-in Bundle $59). The free tier still searches the archive and downloads captures — see Pricing below.");
    return;
  }
  const limit = Math.min(caps.archive_limit, 100);
  $("diff-status").textContent = "Diff: searching the archive for @" + id + " on " + NETWORKS[net].name + "…";
  $("diff-go").disabled = true;
  const SJ = window.WS_SEARCH_JOB;
  const seen = {}, rows = [];
  const fetchTimed = window.WS_MODES && window.WS_MODES.fetchPatternTimed;
  const steps = NETWORKS[net].patterns.map(function (pat, i) {
    return { label: NETWORKS[net].name + " — pattern " + (i + 1) + "/" + NETWORKS[net].patterns.length,
      run: async function (signal) {
        const out = [];
        const res = await fetchTimed(pat, id, limit, from, to, signal);
        res.forEach(function (r) {
          // Same alias-aware key as console.js addRow: one capture
          // stored under twitter.com by one pattern and x.com by the
          // other is one post, not two.
          const alias = window.WS_URL_ALIAS;
          const k = alias ? alias.dedupKey(r[1], r[2]) : r[1] + "|" + r[2];
          if (!seen[k]) { seen[k] = 1; rows.push(r); out.push(r); }
        });
        return out;
      } };
  });
  const job = new SJ.SearchJob(steps, {
    onProgress: function (p) { $("diff-status").textContent = "Diff: searching " + NETWORKS[net].name + "… — " + rows.length + " capture(s) so far (" + p.done + "/" + p.total + " patterns)."; },
    onState: function (s) { if (s === "done" || s === "failed" || s === "stopped") $("diff-go").disabled = false; },
  });
  SJ.bindSearchControls(job, {
    bar: $("diff-progress"), barFill: $("diff-fill"), barText: $("diff-text"),
    pauseBtn: $("diff-pause"), stopBtn: $("diff-stop"), resumeBtn: $("diff-resume"),
  });
  if (activeJob && activeJob !== job) activeJob.abandon();
  activeJob = job;
  job.start();
  for (;;) {
    await job.settled();
    if (job.state === "failed") {
      $("diff-status").textContent = "Live search didn't complete — the archive didn't answer in time. No results are shown, because none were returned.";
      $("diff-go").disabled = false;
      return;
    }
    const deduped = dedupePosts(rows, net, id);
    const posts = deduped.posts;
    $("diff-status").textContent = "Diff: checking " + posts.length + " post(s) live…";
    const verdicts = await window.WS_LIVE_CHECK.checkLive(posts.map(function (p) { return p.original_post_url; }));
    posts.forEach(function (p) {
      const v = verdicts.get(p.original_post_url) || {};
      p.live_verdict = v.live_verdict || "unknown";
      p.live_http_status = v.live_http_status || "";
      p.live_checked_at = v.live_checked_at || "";
    });
    renderDiff(posts, deduped.skipped, $("diff-only-deleted").checked);
    try { recordHistory(net, id, posts.length); recordUsage(); } catch (e) {}
    if (job.state !== "stopped") break;
    if (!(await job.waitForResume())) return;
  }
  $("diff-go").disabled = false;
}

function csvCellDiff(v) { return "\"" + String(v == null ? "" : v).replace(/"/g, "\"\"") + "\""; }
function downloadDiff(fmt) {
  const posts = WS_OSINT.diffRows || [];
  if (!posts.length) return;
  if (fmt === "json" && !jsonExportAllowed()) return;
  if (fmt === "csv") {
    const head = "network,identifier,post_id,archived_timestamp,original_post_url,archived_post_url,live_verdict,live_http_status,live_checked_at\n";
    const body = posts.map(function (p) {
      return [p.network, p.identifier, p.post_id, p.archived_timestamp, p.original_post_url, p.archived_post_url, p.live_verdict, p.live_http_status, p.live_checked_at].map(csvCellDiff).join(",");
    }).join("\n");
    download("archivecheck-diff.csv", head + body, "text/csv");
  } else {
    download("archivecheck-diff.json", JSON.stringify(posts, null, 2), "application/json");
  }
}

// Called by batch.js initOsintTools() — the diff tab wires itself here.
function initDiff() {
  const dn = $("diff-network");
  if (dn) Object.entries(NETWORKS).forEach(function (kv) {
    const o = document.createElement("option");
    o.value = kv[0]; o.textContent = kv[1].name + " — " + kv[1].coverage + " archive";
    dn.appendChild(o);
  });
  const dg = $("diff-go"); if (dg) dg.addEventListener("click", runDiff);
  const od = $("diff-only-deleted");
  if (od) od.addEventListener("change", function () {
    if (WS_OSINT.diffRows) renderDiff(WS_OSINT.diffRows, WS_OSINT.diffSkipped || 0, od.checked);
  });
  const dc = $("diff-csv"); if (dc) dc.addEventListener("click", function () { downloadDiff("csv"); });
  const dj = $("diff-json"); if (dj) dj.addEventListener("click", function () { downloadDiff("json"); });
}

if (typeof window !== "undefined") {
  window.WS_DIFF = { postKey: postKey, dedupePosts: dedupePosts, runDiff: runDiff, initDiff: initDiff };
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { postKey: postKey, dedupePosts: dedupePosts };
}
