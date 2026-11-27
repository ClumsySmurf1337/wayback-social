/* Search results rendering — extracted from console.js so that
 * file stays under the ~500-line ceiling (Track L, 2026-11-27).
 * Loaded right after console.js in index.html; it uses that
 * file's globals (setLastRows, rowSource, archiveLink, $,
 * NETWORKS, lastId, recordHistory, recordUsage) and the SearchJob
 * machinery only through finishSearch's caller. No build step.
 *
 * One job: turn rows + their sources into the results table, the
 * stats, and the honest status line (found / none / stopped-early
 * / some requests failed). The source label and the snapshot link
 * for a row always come from the row's own source — a row is
 * never presented as coming from another archive.
 */
// Per-row source label — named rowSourceLabel, NOT sourceLabel:
// evidence-pack.js already defines a global sourceLabel(records)
// (the pack-level label for a LIST of records), and it loads after
// this file, so a second global sourceLabel here would be
// overwritten by it and this call would throw
// "(records || []).forEach is not a function" on a string.
// (Track K fix, 2026-11-27 — the collision broke every search
// render; see TEST-REPORT.md Track K §2.)
function rowSourceLabel(src){
  if (src === "arquivo") return "Arquivo.pt";
  if (src === "ghostarchive") return "Ghostarchive";
  if (src === "commoncrawl") return "Common Crawl";
  return "Wayback";
}
function snapLabelFor(src, ts, extra){
  if (src === "arquivo") return "arquivo.pt/wayback/" + ts + "/…";
  if (src === "ghostarchive") return extra ? "ghostarchive.org/archive/" + extra : "ghostarchive.org/search?…";
  if (src === "commoncrawl") return "index.commoncrawl.org/" + (extra || "CC-MAIN-2026-47") + "-index";
  return "web.archive.org/web/" + ts + "/…";
}
function renderRows(rows, sources){
  setLastRows(rows, null, sources);
  const br = $("broad-results"); if (br) br.innerHTML = "";
  const tb = document.querySelector("#results tbody"); tb.innerHTML="";
  rows.forEach((r, i)=>{
    const tr=document.createElement("tr");
    const ts=r[1], orig=r[2], src = rowSource(i);
    const snap = archiveLink(src, ts, orig, r[7]);
    const snapLabel = snapLabelFor(src, ts, r[7]);
    // A row with no parsable date (Ghostarchive) shows "no date"
    // instead of a broken "--  :" — the timestamp is empty, never
    // faked (see web/ghostarchive.js).
    const dateCell = ts
      ? `${ts.slice(0,4)}-${ts.slice(4,6)}-${ts.slice(6,8)} ${ts.slice(8,10)}:${ts.slice(10,12)}`
      : "no date";
    tr.innerHTML=`<td>${dateCell}</td>
    <td><a href="${orig}" target="_blank" rel="noopener">${orig}</a></td>
    <td><a href="${snap}" target="_blank" rel="noopener">${snapLabel}</a></td>
    <td>${r[4]||""} · ${r[3]||""}</td>
    <td>${rowSourceLabel(src)}</td>`;
    tb.appendChild(tr);
  });
  $("results").hidden = !rows.length;
  $("actions").hidden = !rows.length;
  // Undated rows (Ghostarchive) are excluded from the range: the
  // earliest/latest years come from dated captures only.
  const dates = rows.map(r=>r[1]).filter(Boolean).sort();
  const counts = {wayback: 0, arquivo: 0, ghostarchive: 0, commoncrawl: 0};
  lastRowsSource.forEach(s => { if (counts[s] !== undefined) counts[s] += 1; });
  const multi = counts.arquivo + counts.ghostarchive + counts.commoncrawl > 0;
  $("stats").innerHTML = rows.length
    ? `<div><b>${rows.length}</b>captures</div>`
      + (dates.length
        ? `<div><b>${dates[0].slice(0,4)}</b>earliest</div><div><b>${dates[dates.length-1].slice(0,4)}</b>latest</div>`
        : `<div><b>—</b>no dated captures</div>`)
      + (multi
        ? `<div><b>${counts.wayback}</b>Wayback</div>`
          + (counts.arquivo ? `<div><b>${counts.arquivo}</b>Arquivo.pt</div>` : "")
          + (counts.ghostarchive ? `<div><b>${counts.ghostarchive}</b>Ghostarchive</div>` : "")
          + (counts.commoncrawl ? `<div><b>${counts.commoncrawl}</b>Common Crawl</div>` : "")
        : "")
    : "";
}
// Shared tail of a single-network search: sort, label the outcome
// honestly (found / none / stopped-early / some requests failed),
// render, and record history only for real results. meta.counts is
// the per-source row count ({wayback, arquivo, ghostarchive,
// commoncrawl}) for the sources that ran; meta.failedArquivo /
// meta.failedWayback / meta.failedGhostarchive /
// meta.failedCommoncrawl name the sources that didn't answer, so a
// one-source failure never looks like a total failure;
// meta.arquivoNote / meta.ghostarchiveNote / meta.commoncrawlNote
// carry the honest "no per-handle listing for this network" lines
// for All-archives searches on unsupported networks.
function finishSearch(rows, rowSources, limit, meta){
  lastId = meta.id;
  const order = rows.map((r, i) => i).sort((a, b) => rows[a][1].localeCompare(rows[b][1]));
  rows = order.map(i => rows[i]);
  rowSources = order.map(i => rowSources[i]);
  if (!rows.length) {
    $("status").textContent = meta.stopped
      ? "Search stopped before any captures were found — no results yet. Resume to continue with the remaining patterns."
      : (meta.url
        ? "No captures found for that post URL. The post may never have been archived, or the URL may be wrong — check it opens in a browser first."
        : "No captures found for that handle on this network. Try a wider date range, or check the spelling — some networks are barely archived.")
      + (meta.failed ? " (" + meta.failed + " request(s) to the archive didn't answer — the archive may be slow; retry.)" : "")
      + (meta.arquivoNote ? " " + meta.arquivoNote : "")
      + (meta.ghostarchiveNote ? " " + meta.ghostarchiveNote : "")
      + (meta.commoncrawlNote ? " " + meta.commoncrawlNote : "");
  } else {
    const bits = [meta.url
      ? `Found ${rows.length} capture(s) of this post on ${NETWORKS[meta.net].name}.`
      : `Found ${rows.length} capture(s) for @${meta.id} on ${NETWORKS[meta.net].name}.`];
    if (meta.counts && (meta.counts.wayback || meta.counts.arquivo || meta.counts.ghostarchive || meta.counts.commoncrawl)) {
      const parts = [];
      if (meta.counts.wayback || meta.counts.arquivo || meta.counts.ghostarchive || meta.counts.commoncrawl) parts.push(`Wayback: ${meta.counts.wayback || 0}`);
      if (meta.counts.arquivo) parts.push(`Arquivo.pt: ${meta.counts.arquivo}`);
      if (meta.counts.ghostarchive) parts.push(`Ghostarchive: ${meta.counts.ghostarchive}`);
      if (meta.counts.commoncrawl) parts.push(`Common Crawl: ${meta.counts.commoncrawl}`);
      bits.push(parts.join(" · ") + ".");
    }
    if (meta.stopped) bits.push("Search stopped early — partial results.");
    if (meta.failed) bits.push(meta.failed + " request(s) didn't answer — results may be incomplete.");
    if (meta.failedArquivo && !meta.failedWayback) bits.push("Arquivo.pt didn't answer — showing Wayback results only.");
    if (meta.failedWayback && !meta.failedArquivo) bits.push("The Wayback Machine didn't answer — showing Arquivo.pt results only.");
    if (meta.failedGhostarchive) bits.push("Ghostarchive didn't answer — its captures are missing from these results.");
    if (meta.failedCommoncrawl) bits.push("Common Crawl index didn't answer — its captures are missing from these results.");
    if (meta.arquivoNote) bits.push(meta.arquivoNote);
    if (meta.ghostarchiveNote) bits.push(meta.ghostarchiveNote);
    if (meta.commoncrawlNote) bits.push(meta.commoncrawlNote);
    $("status").textContent = bits.join(" ");
  }
  renderRows(rows.slice(0, limit), rowSources.slice(0, limit));
  if (rows.length) { recordHistory(meta.net, meta.id, rows.length); recordUsage(); }
}
