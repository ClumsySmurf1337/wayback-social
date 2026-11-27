/* wayback-social web console — search, tiers, licence, checkout.
 * Extracted from index.html so the page stays a thin shell;
 * branding lives in branding.js, config in config.js, licence
 * verification in licence.js. No build step.
 */
const NETWORKS = {
  x:{name:"X / Twitter",patterns:["https://twitter.com/{id}/status/*","https://x.com/{id}/status/*"],coverage:"good"},
  instagram:{name:"Instagram",patterns:["https://www.instagram.com/{id}/p/*","https://www.instagram.com/{id}/reel/*","https://www.instagram.com/{id}/*"],coverage:"moderate"},
  facebook:{name:"Facebook",patterns:["https://www.facebook.com/{id}/posts/*","https://www.facebook.com/{id}/*"],coverage:"moderate"},
  tiktok:{name:"TikTok",patterns:["https://www.tiktok.com/@{id}/video/*"],coverage:"moderate"},
  youtube:{name:"YouTube",patterns:["https://www.youtube.com/@{id}/*","https://www.youtube.com/channel/{id}/*"],coverage:"moderate"},
  reddit:{name:"Reddit",patterns:["https://www.reddit.com/user/{id}/*"],coverage:"good"},
  linkedin:{name:"LinkedIn",patterns:["https://www.linkedin.com/in/{id}/*"],coverage:"poor"},
  threads:{name:"Threads",patterns:["https://www.threads.net/@{id}/post/*","https://www.threads.net/@{id}/*"],coverage:"moderate"},
  bluesky:{name:"Bluesky",patterns:["https://bsky.app/profile/{id}/post/*"],coverage:"good"},
  mastodon:{name:"Mastodon",patterns:["https://mastodon.social/@{id}/*"],coverage:"good"},
  pinterest:{name:"Pinterest",patterns:["https://www.pinterest.com/{id}/*"],coverage:"poor"},
  tumblr:{name:"Tumblr",patterns:["https://{id}.tumblr.com/post/*"],coverage:"moderate"},
  twitch:{name:"Twitch",patterns:["https://www.twitch.tv/{id}/*"],coverage:"moderate"},
  medium:{name:"Medium",patterns:["https://medium.com/@{id}/*"],coverage:"poor"},
};
const cfg = window.WAYBACK_SOCIAL_CONFIG;
const $ = id => document.getElementById(id);
// CDX transport lives in console-fetch.js now (loaded before this
// file): cdxBase / cdxUrl / ensureSearchToken / fetchPattern /
// fetchSingle are window globals from there. This file keeps the
// search orchestration, tiers, licence and rendering.
// The job of the search currently being rendered. A new search
// abandons the previous one (see search()): its waitForResume()
// resolves false so it stops waiting and never overwrites the new
// search's results. modes.js (broad search) shares this variable.
let activeJob = null;
const sel = $("network");
for (const [id,n] of Object.entries(NETWORKS)) {
  const o = document.createElement("option"); o.value=id; o.textContent=`${n.name} — ${n.coverage} archive`; sel.appendChild(o);
}
let lastRows = [];
let lastId = ""; // identifier of the last search: the handle, or the
// full post URL in single-post-URL mode — the CSV/JSON exports use
// this, not the handle box (which still holds "jack" after a URL
// search). Set in finishSearch; empty until the first search.
let lastRowsNet = []; // parallel to lastRows: the network each row came from (broad search); null = the selected network
let lastRowsSource = []; // parallel to lastRows: "wayback" | "arquivo" —
// which archive a row came from. A row is never presented as coming
// from the other archive (see web/arquivo.js).
function setLastRows(rows, nets, sources){
  lastRows = rows;
  lastRowsNet = nets || rows.map(()=>null);
  lastRowsSource = sources || rows.map(()=> "wayback");
}
// The snapshot link for a row, by its source — Arquivo.pt rows link
// to arquivo.pt, Ghostarchive rows to ghostarchive.org/archive/<id>,
// Common Crawl rows to the index record itself, never
// web.archive.org (each source module owns its rule; this is the
// fallback when it failed to load). `extra` is the row's 8th
// column: the Ghostarchive archive id / the Common Crawl crawl id.
function archiveLink(source, ts, orig, extra){
  if (typeof window !== "undefined") {
    if (source === "ghostarchive" && window.WS_GHOSTARCHIVE) {
      return window.WS_GHOSTARCHIVE.archiveLink(source, ts, orig, extra);
    }
    if (source === "commoncrawl" && window.WS_COMMONCRAWL) {
      return window.WS_COMMONCRAWL.archiveLink(source, ts, orig, extra);
    }
    if (window.WS_ARQUIVO) {
      return window.WS_ARQUIVO.archiveLink(source, ts, orig);
    }
  }
  return "https://web.archive.org/web/" + ts + "/" + orig;
}
// Shared with the osint tools (batch.js, citations.js, evidence-pack.js):
// the rows currently on screen, as CDX row arrays + their networks +
// their sources.
if (typeof window !== "undefined") {
  window.WS_CONSOLE = {
    getRows: function(){ return { rows: lastRows, nets: lastRowsNet, sources: lastRowsSource }; },
    archiveLink: archiveLink,
  };
}
function rowNet(i){ return lastRowsNet[i] || (typeof sel !== "undefined" ? sel.value : ""); }
function rowSource(i){ return lastRowsSource[i] || "wayback"; }
function showDlg(t,b){ $("dlgTitle").textContent=t; $("dlgBody").textContent=b; $("dlg").showModal(); }
// --- Tier + licence (v1.5) -------------------------------------------
// Caps come from licence.js (PLAN_CAPS mirrors pricing.yaml).
//
// LICENCE LOCKDOWN — DEMO VERIFICATION ONLY. Keys checked here are
// verified locally against a PUBLIC demo secret (licence.js header),
// so a key that passes here proves NOTHING about a purchase. The
// page must never present a demo-verified key as a secure or
// production licence: every place a key is shown says "demo key",
// and the copy says real keys are verified server-side and arrive
// by email after purchase (Paddle webhook -> Ed25519 -> D1 ->
// Resend — not built yet, see docs/storage-auth-plan.md). Do not
// weaken these labels when production verification lands: the demo
// path stays labelled demo, the production path gets its own label.
const LIC = window.WAYBACK_LICENCE;
// True when the tier on screen comes from a locally stored DEMO key:
// the stored tier equals the displayed tier and the demo flag is set
// (verifyLicence sets it; clearLicence removes it). A tier from a
// signed-in linked account (WS_AUTH) is not a demo key.
function isDemoKey(){
  try {
    return localStorage.getItem("ws_licence_demo") === "1"
      && localStorage.getItem("ws_licence_tier") === currentTier();
  } catch(e){ return false; }
}
function currentTier(){
  // A signed-in account's linked licence counts too (auth.js) — the
  // higher of licence-key tier and linked-account tier gates paid
  // features. Signed out, this is just the licence-key tier.
  try { if (window.WS_AUTH && window.WS_AUTH.effectiveTier) return window.WS_AUTH.effectiveTier(); } catch(e){}
  try { return localStorage.getItem("ws_licence_tier") || "free"; } catch(e){ return "free"; }
}
function currentCaps(){ return LIC.planCaps(currentTier()); }
function applyTier(){
  const tier = currentTier(), caps = currentCaps();
  const demo = isDemoKey();
  const badge = $("tier-badge");
  if (badge) badge.textContent = `${LIC.tierLabel(tier)} tier${demo ? " (demo key)" : ""} — ${caps.archive_limit} captures/search, ${caps.find_networks} networks in broad search, ${caps.exports.join("/")} export`;
  const ll = $("limit-label");
  if (ll) ll.textContent = `Limit (${LIC.tierLabel(tier)}: up to ${caps.archive_limit})`;
  const lim = $("limit");
  if (lim) lim.max = caps.archive_limit;
  const jb = $("json");
  if (jb) jb.disabled = !caps.exports.includes("json");
  const ls = $("licence-status");
  if (ls && tier !== "free") ls.textContent = demo
    ? `Demo key active: ${LIC.tierLabel(tier)} tier preview (stored on this device). Not a purchase.`
    : `Licence active: ${LIC.tierLabel(tier)} tier (stored on this device).`;
}
async function verifyLicence(){
  const key = $("licence-key").value.trim();
  const st = $("licence-status");
  if (!key) { st.textContent = "Paste a key first (DP1-…)."; return; }
  st.textContent = "Checking key locally (demo verification)…";
  try {
    const res = await LIC.verifyKey(key, cfg.LICENCE && cfg.LICENCE.demo_secret);
    if (!res.valid) { st.textContent = "Invalid key: " + res.reason; return; }
    try {
      localStorage.setItem("ws_licence", key);
      localStorage.setItem("ws_licence_tier", res.tier);
      localStorage.setItem("ws_licence_demo", "1"); // DEMO ONLY — see header
    } catch(e) {}
    st.textContent = `Demo key accepted — ${LIC.tierLabel(res.tier)} tier preview unlocked on this device only. This is NOT a purchase: demo keys are checked locally against a public demo secret and prove nothing about payment. Real licence keys are verified server-side and arrive by email after purchase.`;
    applyTier();
  } catch(e) { st.textContent = "Verification failed: " + e.message; }
}
function clearLicence(){
  try { localStorage.removeItem("ws_licence"); localStorage.removeItem("ws_licence_tier"); localStorage.removeItem("ws_licence_demo"); } catch(e) {}
  $("licence-key").value = "";
  $("licence-status").textContent = "Licence removed — back to the Free tier.";
  applyTier();
}
// --- Local usage + history (v1.5, localStorage only, never uploaded) --
function monthKey(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
function recordUsage(){
  try {
    const k = "ws_usage_" + monthKey();
    const u = JSON.parse(localStorage.getItem(k) || '{"searches":0}');
    u.searches = (u.searches || 0) + 1;
    localStorage.setItem(k, JSON.stringify(u));
  } catch(e) {}
}
function recordHistory(network, handle, captures){
  try {
    const h = JSON.parse(localStorage.getItem("ws_history") || "[]");
    h.unshift({at: new Date().toISOString(), network, handle, captures});
    localStorage.setItem("ws_history", JSON.stringify(h.slice(0, 50)));
  } catch(e) {}
}
// Pricing UI (plans + feature chart) lives in pricing-ui.js now —
// it was extracted so this file stays under the ~500-line ceiling.
// It runs at load right after this file (same globals: cfg, $, showDlg).
// Results rendering (renderRows + finishSearch + the source
// labels) lives in render-rows.js now — extracted so this
// file stays under the ~500-line ceiling. It runs at load
// right after this file (same globals: $, NETWORKS,
// setLastRows, rowSource, archiveLink, recordHistory).
// All-network ("broad") search lives in modes.js (window.WS_MODES),
// loaded after this file — same for the preset picker and the
// search-failure UI. If modes.js fails to load, search() falls back
// to a single-network search and says so.
async function searchBroad(id, limit, from, to){
  if (window.WS_MODES) { await window.WS_MODES.searchBroad(id, limit, from, to); return; }
  $("status").textContent = "All-network search is unavailable right now — try one network at a time.";
}
// fetchPattern / fetchSingle live in console-fetch.js now (see the
// note at the top of this file). search() below calls them as
// before; modes.js fetchPatternTimed wraps fetchPattern the same way.
async function search(demo){
  let net = demo?"x":sel.value, id=(demo?"jack":$("handle").value.trim().replace(/^@/,""))||"jack";
  const caps = currentCaps();
  const limit = Math.min(parseInt($("limit").value)||20, caps.archive_limit); // tier cap
  const from=$("from").value.trim(), to=$("to").value.trim();
  // Date inputs must be YYYYMMDD (the date picker writes that format;
  // a hand-typed value is checked here so a bad date never reaches CDX).
  if ((from && !/^\d{8}$/.test(from)) || (to && !/^\d{8}$/.test(to))) {
    $("status").textContent = "From/To dates must be YYYYMMDD (e.g. 20200101) — pick a date from the calendar or clear the field. No search was run.";
    return;
  }
  // Archive source (web/arquivo.js). Default: Wayback CDX — unchanged
  // behaviour when the selector or arquivo.js is absent. The demo
  // search is always Wayback (jack's first post, 2006).
  const AQ = (typeof window !== "undefined") ? window.WS_ARQUIVO : null;
  if (AQ) AQ.syncSourceUI(); // presets toggle broad programmatically — re-sync the note
  const source = demo ? "wayback" : ((AQ && $("source")) ? ($("source").value || "wayback") : "wayback");
  const keywordEl = $("keyword");
  const keyword = (!demo && AQ && keywordEl && !keywordEl.disabled) ? keywordEl.value.trim() : "";
  if (keyword && !caps.keyword_search) {
    showDlg("Keyword search needs Pro",
      "Arquivo.pt keyword search — full-text search filtered to this handle — is a Pro Pack feature ($19 launch, once). CDX mode (no keyword) works on every plan, and the Wayback Machine search is free.");
    return;
  }
  // Single-post-URL mode (Track K item 2, web/url-mode.js): a pasted
  // post URL searches that one post instead of a whole handle — the
  // network is detected from the link, exactly like the CLI's --url.
  // No feature gate (plans.py has no url flag — verified); only the
  // captures-per-search cap applies. A bad URL is an honest error
  // and NO fetch runs. A URL and a keyword can't be searched
  // together (one is an exact-post search, the other is full-text);
  // broad search doesn't combine with a URL either (it is a handle
  // search) — the URL wins and broad is ignored.
  const urlEl = $("post-url");
  const postUrlRaw = (!demo && urlEl) ? urlEl.value.trim() : "";
  let postUrl = "", urlNet = null;
  if (postUrlRaw) {
    const UM = (typeof window !== "undefined") ? window.WS_URL_MODE : null;
    const parsed = UM ? UM.parsePostUrl(postUrlRaw)
      : { error: "Single-post-URL search isn't available — the page didn't finish loading. Reload and try again." };
    if (parsed.error) { $("status").textContent = parsed.error + " No search was run."; return; }
    if (keyword) { $("status").textContent = "A post URL and a keyword can't be searched together — clear one of them. No search was run."; return; }
    postUrl = parsed.url; urlNet = parsed.net;
    net = urlNet; id = postUrl;
  }
  if (!await ensureSearchToken()) return; // bot check first (no-op when unconfigured)
  if ($("broad") && $("broad").checked && !demo && !postUrl) { await searchBroad(id, limit, from, to); return; }
  // Which sources run. Arquivo.pt CDX mode only lists X, Bluesky and
  // Mastodon per handle; other networks need a keyword (Pro) or fall
  // back to Wayback-only for Both. Keyword mode is network-agnostic.
  // Ghostarchive (web/ghostarchive.js) lists X and Bluesky only;
  // Common Crawl (web/commoncrawl.js) lists every supported network.
  const GH = (typeof window !== "undefined") ? window.WS_GHOSTARCHIVE : null;
  const CC = (typeof window !== "undefined") ? window.WS_COMMONCRAWL : null;
  let runWayback = source === "wayback" || source === "both";
  let runArquivo = source === "arquivo" || source === "both";
  let runGhostarchive = source === "ghostarchive" || source === "both";
  let runCommoncrawl = source === "commoncrawl" || source === "both";
  const arquivoPatterns = AQ ? AQ.patternsFor(net) : null;
  let arquivoNote = "";
  // URL mode skips the per-handle-listing gate: Arquivo.pt CDX
  // answers any exact URL, so the X/Bluesky/Mastodon-only listing
  // limit does not apply (same as the CLI's --url).
  if (runArquivo && !keyword && !arquivoPatterns && !postUrl) {
    if (source === "arquivo") {
      $("status").textContent = "Arquivo.pt can't list " + NETWORKS[net].name + " posts by handle — its per-handle index covers X, Bluesky and Mastodon only. Type a keyword to search its full text (Pro), or search the Wayback Machine instead.";
      return;
    }
    runArquivo = false;
    arquivoNote = "Arquivo.pt has no per-handle listing for " + NETWORKS[net].name + " — Wayback results only.";
  }
  // Ghostarchive: X and Bluesky only (same gate shape as Arquivo.pt).
  // URL mode skips the gate: Ghostarchive search answers any exact URL.
  const ghostarchivePatterns = GH ? GH.patternsFor(net) : null;
  let ghostarchiveNote = "";
  if (runGhostarchive && !ghostarchivePatterns && !postUrl) {
    if (source === "ghostarchive") {
      $("status").textContent = "Ghostarchive can't list " + NETWORKS[net].name + " posts by handle — its per-handle index covers X and Bluesky only. Search the Wayback Machine instead.";
      return;
    }
    runGhostarchive = false;
    ghostarchiveNote = "Ghostarchive has no per-handle listing for " + NETWORKS[net].name + " — its captures are missing from these results.";
  }
  // Common Crawl: every supported network has a prefix, so the gate
  // only fires when the module failed to load. URL mode skips it:
  // the index answers any exact URL (or an honest empty).
  const commoncrawlPatterns = CC ? CC.patternsFor(net) : null;
  let commoncrawlNote = "";
  if (runCommoncrawl && !commoncrawlPatterns && !postUrl) {
    if (source === "commoncrawl") {
      $("status").textContent = "Common Crawl isn't available — the page didn't finish loading. Reload and try again.";
      return;
    }
    runCommoncrawl = false;
    commoncrawlNote = "Common Crawl isn't available — its captures are missing from these results.";
  }
  $("go").disabled=true; $("status").textContent="Searching the archives — this can take 20–60s…"; $("notice").textContent="";
  const fa = $("fail-actions"); if (fa) fa.hidden = true;
  const seen=new Set(); let rows=[]; let rowSources=[];
  const counts = {wayback: 0, arquivo: 0, ghostarchive: 0, commoncrawl: 0};
  // Dedup is by (timestamp, canonical URL) across BOTH archives:
  // the same capture in both archives renders once (Wayback steps
  // run first, so Wayback wins the tie) but counts per source still
  // show what each archive returned. The URL is canonicalised by
  // web/url-alias.js (twitter.com <-> x.com, www. stripped) so one
  // capture stored under two hostnames is still one row; different
  // timestamps stay separate captures. If that script failed to
  // load, the exact (timestamp, URL) key is the fallback.
  function addRow(r, src){
    const alias = window.WS_URL_ALIAS;
    const k = alias ? alias.dedupKey(r[1], r[2]) : r[1]+"|"+r[2];
    if (seen.has(k)) return false;
    seen.add(k); rows.push(r); rowSources.push(src); counts[src] += 1;
    return true;
  }
  // A failed search shows NOTHING as a result — no demo rows, no
  // command to run elsewhere. modes.js renders the retry / sample /
  // direct-CDX options; without it, a plain honest message.
  const fail = (q) => {
    if (window.WS_MODES) window.WS_MODES.showFailure(q);
    else $("status").textContent = "Live search didn't complete — the archive didn't answer in time. No results are shown, because none were returned.";
  };
  const failQ = {net, id, limit, from, to, demo, source, url: postUrl || null};
  try{
    const SJ = window.WS_SEARCH_JOB;
    if (!SJ) {
      // search-job.js missing: legacy loop, but a pattern that fails
      // is still counted — all patterns failing is a failed search,
      // not an empty result.
      let failed = 0, failedArquivo = 0, failedWayback = 0, failedGhostarchive = 0, failedCommoncrawl = 0, total = 0;
      if (runWayback) {
        // URL mode: one step, the exact URL — no {id} in it, so
        // fetchSingle's replace is a no-op (same as the CLI).
        for (const pat of (postUrl ? [postUrl] : NETWORKS[net].patterns)) {
          total += 1;
          try {
            for (const r of await fetchSingle(pat, id, limit, from, to)) addRow(r, "wayback");
          } catch (e) { failed += 1; failedWayback += 1; }
          if (rows.length >= limit) break;
        }
      }
      if (runArquivo && AQ) {
        const asteps = AQ.arquivoSteps({net, id, keyword, limit, from, to, addRow, urlPattern: postUrl || null});
        for (const st of asteps) {
          total += 1;
          try { await st.run(); } catch (e) { failed += 1; failedArquivo += 1; }
        }
      }
      if (runGhostarchive && GH) {
        const gsteps = GH.ghostarchiveSteps({net, id, limit, from, to, addRow, urlPattern: postUrl || null});
        for (const st of gsteps) {
          total += 1;
          try { await st.run(); } catch (e) { failed += 1; failedGhostarchive += 1; }
        }
      }
      if (runCommoncrawl && CC) {
        const csteps = CC.commoncrawlSteps({net, id, limit, from, to, addRow, urlPattern: postUrl || null});
        for (const st of csteps) {
          total += 1;
          try { await st.run(); } catch (e) { failed += 1; failedCommoncrawl += 1; }
        }
      }
      if (total && failed === total) { fail(failQ); return; }
      finishSearch(rows, rowSources, limit, {net, id, failed, failedArquivo, failedWayback,
        failedGhostarchive, failedCommoncrawl,
        counts: (runArquivo || runGhostarchive || runCommoncrawl) ? counts : null,
        arquivoNote, ghostarchiveNote, commoncrawlNote, stopped: false, url: postUrl || null});
      return;
    }
    // One SearchJob step per CDX pattern (Wayback) plus the Arquivo.pt
    // steps (CDX patterns or one keyword step) plus the Ghostarchive
    // and Common Crawl steps: the progress bar shows which pattern
    // is being searched and how many captures are in so far, and
    // Pause / Stop / Resume work on the live search. In "All
    // archives" mode the Wayback steps do NOT end the job early at
    // the limit — the other archives still get their turn;
    // finishSearch caps the rendered rows at the limit. Common
    // Crawl runs last (it is the slowest source).
    const ref = {};
    const steps = [];
    if (runWayback) {
      // URL mode: one step for the exact URL instead of one step per
      // handle pattern — the pattern IS the post URL (no {id}).
      const waybackPats = postUrl ? [postUrl] : NETWORKS[net].patterns;
      waybackPats.forEach((pat, i) => {
        steps.push({
          label: postUrl ? NETWORKS[net].name + " — this post"
            : NETWORKS[net].name + " — pattern " + (i+1) + "/" + NETWORKS[net].patterns.length,
          run: async (signal) => {
            const out = [];
            for (const r of await fetchSingle(pat, id, limit, from, to, signal)) {
              if (addRow(r, "wayback")) out.push(r);
            }
            if (!runArquivo && !runGhostarchive && !runCommoncrawl && rows.length >= limit && ref.job) ref.job.complete(); // enough rows, no other source to run: end as done
            return out;
          },
        });
      });
    }
    if (runArquivo && AQ) {
      steps.push(...AQ.arquivoSteps({net, id, keyword, limit, from, to, addRow, urlPattern: postUrl || null}));
    }
    if (runGhostarchive && GH) {
      steps.push(...GH.ghostarchiveSteps({net, id, limit, from, to, addRow, urlPattern: postUrl || null}));
    }
    if (runCommoncrawl && CC) {
      steps.push(...CC.commoncrawlSteps({net, id, limit, from, to, addRow, urlPattern: postUrl || null}));
    }
    const job = new SJ.SearchJob(steps, {
      onProgress: (p) => {
        $("status").textContent = "Searching " + (p.current || NETWORKS[net].name) + "… — " + rows.length + " capture(s) so far (" + p.done + "/" + p.total + " steps).";
      },
      onState: (s) => { if (s === "done" || s === "failed" || s === "stopped") $("go").disabled = false; },
    });
    ref.job = job;
    SJ.bindSearchControls(job, {
      bar: $("job-progress"), barFill: $("job-fill"), barText: $("job-text"),
      pauseBtn: $("job-pause"), stopBtn: $("job-stop"), resumeBtn: $("job-resume"),
    });
    if (activeJob && activeJob !== job) activeJob.abandon();
    activeJob = job;
    job.start();
    // Await the job — resolves on done / stopped / failed. After a
    // stop the user may hit Resume: wait for that and re-render when
    // the resumed run settles, instead of leaving the resumed rows
    // unrendered. A newer search abandons this one.
    for (;;) {
      await job.settled();
      const failedSteps = job.results.filter((r) => !r.ok && !r.aborted);
      const failed = failedSteps.length;
      const failedArquivo = failedSteps.filter((r) => (r.label || "").indexOf("Arquivo.pt") === 0).length;
      const failedGhostarchive = failedSteps.filter((r) => (r.label || "").indexOf("Ghostarchive") === 0).length;
      const failedCommoncrawl = failedSteps.filter((r) => (r.label || "").indexOf("Common Crawl") === 0).length;
      const failedWayback = failed - failedArquivo - failedGhostarchive - failedCommoncrawl;
      if (job.state === "failed") { fail(failQ); return; }
      finishSearch(rows, rowSources, limit, {net, id, failed, failedArquivo, failedWayback,
        failedGhostarchive, failedCommoncrawl,
        counts: (runArquivo || runGhostarchive || runCommoncrawl) ? counts : null,
        arquivoNote, ghostarchiveNote, commoncrawlNote, stopped: job.state === "stopped", url: postUrl || null});
      if (job.state !== "stopped") return;
      if (!(await job.waitForResume())) return; // a newer search started
    }
  }catch(e){
    fail(failQ);
  }finally{ $("go").disabled=false; }
}
$("go").onclick=()=>search(false);
$("demo").onclick=()=>search(true);
function download(name, text, type){
  const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([text],{type})); a.download=name; a.click();
}
$("csv").onclick=()=>{
  // Source is the last column (additive — the archived_post_url
  // column keeps its position). An Arquivo.pt row's snapshot link
  // points to arquivo.pt, never web.archive.org.
  const head="network,identifier,archived_timestamp,original_post_url,archived_post_url,archived_statuscode,archived_mimetype,source\n";
  const body=lastRows.map((r,i)=>[rowNet(i),lastId || $("handle").value,r[1],r[2],archiveLink(rowSource(i),r[1],r[2],r[7]),r[4],r[3],rowSource(i)].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  download("archivecheck-captures.csv", head+body, "text/csv");
};
$("json").onclick=()=>{
  if (!currentCaps().exports.includes("json")) {
    showDlg("JSON export needs Starter",
      "The Free tier exports CSV only. Starter ($9 launch) unlocks JSON — see Pricing below.");
    return;
  }
  download("archivecheck-captures.json", JSON.stringify(lastRows.map((r,i)=>({network:rowNet(i),identifier:lastId || $("handle").value,archived_timestamp:r[1],original_post_url:r[2],archived_post_url:archiveLink(rowSource(i),r[1],r[2],r[7]),archived_statuscode:r[4],archived_mimetype:r[3],source:rowSource(i)})),null,2), "application/json");
};
// Date pickers live in datepickers.js now (extracted so this file
// stays under the ~500-line ceiling). It initialises itself at load,
// right after this file. The plain YYYYMMDD inputs still work if it
// fails to load.
$("licence-verify").onclick=()=>verifyLicence();
$("licence-clear").onclick=()=>clearLicence();
(function(){ try {
  const saved = localStorage.getItem("ws_licence");
  if (saved) $("licence-key").value = saved;
} catch(e) {} applyTier();
  // Dashboard re-run links: ?network=x&handle=jack pre-fills the form.
  // A history entry from a single-post-URL search stores the URL as
  // its handle — a ?handle= that looks like a URL goes into the
  // post-URL field instead, so the re-run is the same URL search.
  const q = new URLSearchParams(location.search);
  const qn = q.get("network"), qh = q.get("handle");
  if (qn && NETWORKS[qn]) sel.value = qn;
  if (qh) {
    if (/^https?:\/\//.test(qh)) { const pu = $("post-url"); if (pu) pu.value = qh; }
    else $("handle").value = qh.replace(/^@/, "");
  }
})();
