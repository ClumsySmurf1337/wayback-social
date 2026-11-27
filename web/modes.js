/* wayback-social web console — modes: all-network search and the
 * search-failure UI. Loaded after console.js (and presets-ui.js,
 * which owns the presets + honest-limits box); it uses console.js
 * globals ($, NETWORKS, cdxUrl, currentCaps, currentTier,
 * renderRows, setLastRows, recordHistory, recordUsage, search) and
 * the presets-ui.js globals (PRESETS, LIMITS_LINE, activatePreset).
 * No build step. No CLI text anywhere in this file or on the page:
 * a failed search shows nothing as a result — only retry, a direct
 * CDX link, and a clearly-labelled verified sample.
 */

// --- Verified sample (labelled, never presented as a live result) ----
const SAMPLE_ROW = ["com,twitter)/jack/status/20","20060321212430",
  "https://twitter.com/jack/status/20","text/html","200","ABC","1"];
function fmtRangeDate(s){
  return (s && s.length === 8) ? s.slice(0,4) + "-" + s.slice(4,6) + "-" + s.slice(6,8) : s;
}
function rangePhrase(from, to){
  if (from && to) return "your " + fmtRangeDate(from) + " – " + fmtRangeDate(to) + " range";
  if (from) return "your range starting " + fmtRangeDate(from);
  if (to) return "your range ending " + fmtRangeDate(to);
  return "";
}
// The sample is ONE fixed capture (2006-03-21). It must respect the
// From/To range like a real result: if 2006 falls outside the user's
// range, say so instead of showing the row — showing it would repeat
// the "date stuck at 2006" bug (a 2006 row under a 2020–2023 query).
function loadSample(){
  const fa = $("fail-actions"); if (fa) fa.hidden = true;
  const from = $("from") ? $("from").value.trim() : "";
  const to = $("to") ? $("to").value.trim() : "";
  const inR = (window.WS_SEARCH_JOB && window.WS_SEARCH_JOB.inRange)
    || function (ts, f, t) {
      if (!ts || ts.length < 8) return true;
      const d = ts.slice(0, 8);
      return !(f && d < f) && !(t && d > t);
    };
  if (!inR(SAMPLE_ROW[1], from, to)) {
    $("status").textContent = "The verified sample is from 2006-03-21, outside " + rangePhrase(from, to) + " — so it isn't shown as a result. Clear the dates or widen the range to see it.";
    $("notice").textContent = "No rows are shown, because the only sample we have predates your range.";
    return;
  }
  $("status").textContent = "Verified sample — NOT a live result: 1 capture, 2006-03-21, twitter.com/jack/status/20 (jack's first post). Run a search above for live results.";
  $("notice").textContent = "";
  renderRows([SAMPLE_ROW]);
}

// --- Search failure: retry, direct CDX link, labelled sample --------
let lastDemo = false;
function showFailure(q){
  $("status").textContent = "Live search didn't complete — the archive didn't answer in time. No results are shown, because none were returned.";
  const arquivoOnly = q.source === "arquivo";
  $("notice").textContent = "The archive is slow or unreachable right now. Your search was not run — try again, or open the same query directly on " + (arquivoOnly ? "arquivo.pt." : "web.archive.org.");
  const fa = $("fail-actions");
  if (fa) fa.hidden = false;
  const link = $("cdx-link");
  if (link) {
    if (arquivoOnly) {
      // Arquivo.pt-only search: the direct link goes to arquivo.pt's
      // CDX, not web.archive.org — a Wayback link would answer a
      // query the user never asked. In single-post-URL mode the link
      // is the exact post URL, not a handle pattern.
      const AQ = (typeof window !== "undefined") ? window.WS_ARQUIVO : null;
      const pats = AQ ? AQ.patternsFor(q.net) : null;
      const pat = q.url || ((pats && pats[0]) || "");
      const u = new URL("https://arquivo.pt/wayback/cdx");
      u.searchParams.set("url", pat.replace("{id}", q.id));
      u.searchParams.set("output", "json");
      u.searchParams.set("limit", String(q.limit));
      if (q.from) u.searchParams.set("from", q.from);
      if (q.to) u.searchParams.set("to", q.to);
      link.href = u.toString();
      link.textContent = "Open this query on arquivo.pt";
    } else {
      // In single-post-URL mode the link is the exact post URL.
      const pat = q.url || ((NETWORKS[q.net] && NETWORKS[q.net].patterns[0]) || "");
      const u = new URL("https://web.archive.org/cdx/search/cdx");
      u.searchParams.set("url", pat.replace("{id}", q.id));
      u.searchParams.set("output", "json");
      u.searchParams.set("limit", String(q.limit));
      if (q.from) u.searchParams.set("from", q.from);
      if (q.to) u.searchParams.set("to", q.to);
      link.href = u.toString();
      link.textContent = "Open this query on web.archive.org";
    }
  }
  lastDemo = !!q.demo;
}

// --- All-network search: one handle, every network, grouped ---------
const SAMPLES_PER_NETWORK = 3;
// A stalled archive.org fetch used to hang broad search indefinitely:
// fetchPattern() has no timeout, the CDX proxy has none, and the dev
// server has none — the E2E agent waited 240s on a stalled broad
// search and got nothing. Normal CDX fetches take 30–90s, so 120s is
// above the healthy range with headroom and bounds every stall.
// A timed-out pattern counts as a failed pattern (the network is
// recorded, the job continues with the next network) — it must NOT
// look like a user Stop, so the timeout error is a distinct
// TimeoutError, not an AbortError (see fetchPatternTimed).
const FETCH_TIMEOUT_MS = 120_000;
// One CDX pattern fetch with a timeout. The job's own signal (Stop)
// still aborts: a real Stop rejects with AbortError, a timeout
// rejects with TimeoutError — the caller must tell them apart, or a
// slow archive would stop the whole job as if the user hit Stop.
// timeoutMs is injectable for tests (production default 120s).
async function fetchPatternTimed(pat, id, limit, from, to, signal, timeoutMs) {
  const ms = typeof timeoutMs === "number" ? timeoutMs : FETCH_TIMEOUT_MS;
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, ms);
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    return await fetchPattern(pat, id, limit, from, to, ctrl.signal);
  } catch (e) {
    if (timedOut && e && e.name === "AbortError") {
      const err = new Error("archive fetch timed out after " + Math.round(ms / 1000) + "s");
      err.name = "TimeoutError";
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}
// One network's check: all its CDX patterns, first 3 rows kept as
// samples. A pattern that fails is counted, not silently skipped —
// a network is "failed" only when it produced no rows AND at least
// one of its patterns failed (a slow archive, not an empty archive).
// A timed-out pattern is a failed pattern (TimeoutError, not
// AbortError), so the check continues with the next pattern instead
// of stopping the whole job.
async function checkNetwork(net, id, limit, from, to, signal, timeoutMs){
  let count = 0, failedPatterns = 0;
  const samples = [];
  for (const pat of NETWORKS[net].patterns) {
    let rows;
    try { rows = await fetchPatternTimed(pat, id, limit, from, to, signal, timeoutMs); }
    catch (e) { if (e && e.name === "AbortError") throw e; failedPatterns += 1; continue; }
    count += rows.length;
    for (const r of rows) if (samples.length < SAMPLES_PER_NETWORK) samples.push(r);
    if (count >= limit) break;
  }
  return { net, count, samples, failed: count === 0 && failedPatterns > 0, failedPatterns };
}
async function searchBroad(id, limit, from, to){
  const caps = currentCaps();
  const nets = Object.keys(NETWORKS).slice(0, caps.find_networks);
  const perNet = [];
  const br = $("broad-results");
  if (br) br.innerHTML = "";
  $("results").hidden = true; $("actions").hidden = true;
  $("go").disabled = true;
  const fa = $("fail-actions"); if (fa) fa.hidden = true;
  let job = null;
  const SJ = window.WS_SEARCH_JOB;
  function renderBroad(){
    const found = perNet.filter(p => p.count);
    const failedNets = perNet.filter(p => p.failed);
    const failedPatterns = perNet.reduce((a, p) => a + (p.failedPatterns || 0), 0);
    const stopped = job && job.state === "stopped";
    const bits = [`Handle @${id} found on ${found.length}/${nets.length} networks (${currentTier()} tier — ${caps.find_networks} networks max).`];
    if (stopped) bits.push("Search stopped early — partial results.");
    if (failedNets.length) bits.push(failedNets.length + " network(s) didn't answer (" + failedNets.map(p => NETWORKS[p.net].name).join(", ") + ") — results may be incomplete.");
    else if (failedPatterns) bits.push(failedPatterns + " request(s) to the archive didn't answer — results may be incomplete.");
    $("status").textContent = bits.join(" ");
    $("stats").innerHTML = perNet.map(p =>
      `<div><b>${p.failed ? "—" : p.count}</b>${NETWORKS[p.net].name}${p.failed ? " (failed)" : ""}</div>`).join("");
    // Grouped results: per network, up to 3 sample rows with links.
    const flat = [], flatNets = [];
    if (br) {
      br.innerHTML = found.map(p => {
        const rowsHtml = p.samples.map(r => {
          const ts = r[1], orig = r[2];
          return `<tr><td>${ts.slice(0,4)}-${ts.slice(4,6)}-${ts.slice(6,8)} ${ts.slice(8,10)}:${ts.slice(10,12)}</td>` +
            `<td><a href="${orig}" target="_blank" rel="noopener">${orig}</a></td>` +
            `<td><a href="https://web.archive.org/web/${ts}/${orig}" target="_blank" rel="noopener">web.archive.org/web/${ts}/…</a></td>` +
            `<td>${r[4] || ""} · ${r[3] || ""}</td></tr>`;
        }).join("");
        return `<h3>${NETWORKS[p.net].name} — ${p.count} capture${p.count === 1 ? "" : "s"}${p.count > SAMPLES_PER_NETWORK ? ` (showing ${p.samples.length})` : ""}</h3>` +
          `<div style="overflow-x:auto"><table><thead><tr><th>Archived</th><th>Post</th><th>Archived snapshot</th><th>Status</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
      }).join("") ||
      `<p class="muted">No captures found for @${id} on any of these ${nets.length} networks. Try a wider date range, or check the spelling — some networks are barely archived.</p>`;
    }
    for (const p of found) for (const r of p.samples) { flat.push(r); flatNets.push(p.net); }
    setLastRows(flat, flatNets);
    $("actions").hidden = !flat.length;
    recordHistory("broad", id, found.reduce((a, p) => a + p.count, 0));
    recordUsage();
  }
  try {
    if (!SJ) {
      // search-job.js missing: sequential loop, same failure rules.
      for (const net of nets) {
        try { perNet.push(await checkNetwork(net, id, limit, from, to)); }
        catch (e) { perNet.push({ net, count: 0, samples: [], failed: true, failedPatterns: 1 }); }
        $("status").textContent = `All-network search: checked ${perNet.length}/${nets.length} networks…`;
      }
    } else {
      // One SearchJob step per network: progress names the network,
      // Pause / Stop / Resume work, and a failed network is a
      // recorded result — not a thrown error that kills the rest.
      job = new SJ.SearchJob(nets.map((net) => ({
        label: net,
        run: async (signal) => checkNetwork(net, id, limit, from, to, signal),
      })), {
        onProgress: (p) => {
          const name = (p.current && NETWORKS[p.current]) ? NETWORKS[p.current].name : "…";
          $("status").textContent = `All-network search: checking ${name} — ${p.done}/${p.total} networks done.`;
        },
        onState: (s) => { if (s === "done" || s === "failed" || s === "stopped") $("go").disabled = false; },
      });
      SJ.bindSearchControls(job, {
        bar: $("job-progress"), barFill: $("job-fill"), barText: $("job-text"),
        pauseBtn: $("job-pause"), stopBtn: $("job-stop"), resumeBtn: $("job-resume"),
      });
      if (activeJob && activeJob !== job) activeJob.abandon();
      activeJob = job;
      job.start();
      // After a stop the user may hit Resume: wait for that and
      // re-render when the resumed run settles, instead of leaving
      // the resumed networks unrendered. A newer search abandons
      // this one. perNet is rebuilt each pass from job.results.
      for (;;) {
        await job.settled();
        perNet.length = 0;
        for (const r of job.results) {
          perNet.push(r.ok ? r.value : { net: r.label, count: 0, samples: [], failed: true, failedPatterns: 1 });
        }
        // All networks failed = a failed search (retry / direct CDX),
        // not an empty result: "found on 0 networks" would be a lie.
        // A stopped job with nothing found yet is partial, not failed.
        if (perNet.length && perNet.every((p) => p.failed)) {
          if (job.state === "stopped") { renderBroad(); }
          else { showFailure({net: nets[0], id, limit, from, to, demo: false}); return; }
        } else {
          renderBroad();
        }
        if (job.state !== "stopped") break;
        if (!(await job.waitForResume())) return;
      }
    }
  } finally {
    $("go").disabled = false;
  }
}

(function initModes(){
  // initPresets() lives in presets-ui.js now and self-initialises at
  // load (it runs before this file).
  const retry = $("retry");
  if (retry) retry.addEventListener("click", () => {
    const fa = $("fail-actions"); if (fa) fa.hidden = true;
    search(lastDemo);
  });
  const sample = $("sample");
  if (sample) sample.addEventListener("click", loadSample);
  const go = $("go");
  if (go) go.addEventListener("click", () => { lastDemo = false; });
  const demo = $("demo");
  if (demo) demo.addEventListener("click", () => { lastDemo = true; });
})();

// fetchPatternTimed is shared: console.js reuses it for single search
// (fetchSingle) so both search paths have the same 120s stall bound.
window.WS_MODES = { searchBroad, showFailure, loadSample, activatePreset, PRESETS, LIMITS_LINE, fetchPatternTimed };

if (typeof module !== "undefined" && module.exports) {
  module.exports = { fetchPatternTimed, checkNetwork, FETCH_TIMEOUT_MS, searchBroad, SAMPLES_PER_NETWORK };
}
