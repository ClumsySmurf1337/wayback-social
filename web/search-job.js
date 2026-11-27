/* wayback-social search job — pausable / stoppable / resumable search.
 *
 * A search is a list of steps (one CDX pattern fetch, or one network in
 * all-network mode). SearchJob runs them in order and lets the user
 * pause between steps, stop mid-search (in-flight request aborted,
 * partial results kept and labelled), and resume with the remaining
 * steps only. A step that throws is recorded, not fatal: the job only
 * counts as failed when EVERY attempted step failed — one dead network
 * must not kill the other thirteen.
 *
 * DOM-free core (SearchJob, inRange) — unit-tested in node, no deps.
 * bindSearchControls() is the thin DOM binding for the console page:
 * progress bar + Pause / Stop / Resume buttons + a minimal toast.
 * No build step. Browser + Node (module.exports guard at the bottom).
 */
"use strict";

/* --- Date range: CDX timestamps are YYYYMMDDHHMMSS; from/to are
 * YYYYMMDD (or "" for open-ended). A row is in range when its date
 * sits inside [from, to]. Used for the sample check (modes.js) and
 * for labelling rows that fall outside the user's range. */
function inRange(ts, from, to) {
  if (!ts || ts.length < 8) return true; // unparseable: don't hide it
  const d = ts.slice(0, 8);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

const STATES = ["idle", "running", "paused", "stopped", "done", "failed"];

class SearchJob {
  // steps: [{ label, run(signal) -> Promise<value> }]
  // onProgress: fn({ done, total, current, state, results }) after each step
  // onState: fn(state) on every state change
  constructor(steps, opts) {
    this.steps = steps || [];
    this.onProgress = (opts && opts.onProgress) || function () {};
    this.onState = (opts && opts.onState) || function () {};
    this.state = "idle";
    this.index = 0;          // next step to run
    this.results = [];       // [{ label, ok, value?, error? }]
    this._paused = false;
    this._stopRequested = false;
    this._resumeResolve = null;
    this._controller = null;
    this._running = null;
    this._resumeWaiters = []; // waitForResume() promises
    this._abandoned = false;
  }

  // The promise of the CURRENT run (from the latest start()/resume()).
  // A caller that renders after a stop awaits settled(), then — if the
  // user resumes — awaits it again for the resumed run's results.
  settled() { return this._running || Promise.resolve(this.results); }

  // Resolves true when resume() is called while paused/stopped, false
  // if abandon() is called first (a newer search replaced this job).
  // Resolves true immediately when the job is already running.
  waitForResume() {
    if (this.state === "running") return Promise.resolve(true);
    return new Promise((resolve) => { this._resumeWaiters.push(resolve); });
  }

  // A newer search replaced this job: unblock any waitForResume()
  // caller so it can abandon its rendering. Does not touch the run.
  abandon() {
    this._abandoned = true;
    for (const r of this._resumeWaiters.splice(0)) r(false);
  }

  // Steps completed (a step aborted by Stop does NOT count until it
  // is retried and finishes — results[] can hold one extra record for
  // the aborted attempt, so progress must never count records).
  get done() { return this.index; }
  get total() { return this.steps.length; }
  get remaining() { return this.steps.slice(this.index); }
  get allFailed() {
    return this.results.length > 0 && this.results.every((r) => !r.ok);
  }
  get succeeded() { return this.results.filter((r) => r.ok); }

  _setState(s) {
    this.state = s;
    this.onState(s);
  }

  _emitProgress(current) {
    this.onProgress({
      done: this.index,
      total: this.steps.length,
      current: current || "",
      state: this.state,
      results: this.results.slice(),
    });
  }

  // Wait while paused. Resolves true to continue, false when stopped.
  _waitIfPaused() {
    if (!this._paused) return Promise.resolve(!this._stopRequested);
    return new Promise((resolve) => { this._resumeResolve = resolve; });
  }

  start() {
    if (this.state === "running") return this._running;
    // Starting again from paused/stopped resumes the remaining steps.
    if (this.state === "paused" || this.state === "stopped") {
      this.resume();
      return this._running;
    }
    if (this.state === "done" || this.state === "failed") return this._running;
    this._setState("running");
    this._running = this._run();
    return this._running;
  }

  pause() {
    if (this.state !== "running") return false;
    this._paused = true;
    this._setState("paused");
    this._emitProgress(this.steps[this.index] ? this.steps[this.index].label : "");
    return true;
  }

  resume() {
    // Resume works from paused AND from stopped: it continues with the
    // remaining steps only — partial results are kept either way.
    // From paused the loop is waiting on _resumeResolve; from stopped
    // the loop already exited (_loopExited) and must be restarted.
    if (this.state !== "paused" && this.state !== "stopped") return false;
    this._paused = false;
    this._stopRequested = false;
    const loopWaiting = !this._loopExited;
    this._setState("running");
    for (const r of this._resumeWaiters.splice(0)) r(true);
    if (this._resumeResolve) {
      const r = this._resumeResolve;
      this._resumeResolve = null;
      r(true);
    }
    if (!loopWaiting) { this._loopExited = false; this._running = this._run(); }
    return true;
  }

  // End the job early as DONE (e.g. the caller already has enough
  // rows). Unlike stop(), this is a successful finish, not a partial
  // one — the results so far are complete for the caller's purpose.
  complete() {
    if (this.state !== "running") return false;
    this._completeRequested = true;
    return true;
  }

  stop() {
    if (this.state !== "running" && this.state !== "paused") return false;
    this._stopRequested = true;
    this._paused = false;
    if (this._controller) { try { this._controller.abort(); } catch (e) {} }
    if (this._resumeResolve) {
      const r = this._resumeResolve;
      this._resumeResolve = null;
      r(false);
    }
    this._setState("stopped");
    this._emitProgress("");
    return true;
  }

  async _run() {
    this._loopExited = false;
    while (this.index < this.steps.length) {
      if (this._stopRequested || this._completeRequested) break;
      if (!(await this._waitIfPaused())) break;
      if (this._stopRequested || this._completeRequested) break;
      const step = this.steps[this.index];
      this._emitProgress(step.label);
      this._controller = (typeof AbortController !== "undefined")
        ? new AbortController() : null;
      try {
        const value = await step.run(this._controller ? this._controller.signal : undefined);
        this.results.push({ label: step.label, ok: true, value });
      } catch (e) {
        // Aborted by Stop counts as a stopped step, not a failure.
        if (e && e.name === "AbortError") {
          this.results.push({ label: step.label, ok: false, error: e, aborted: true });
          break;
        }
        this.results.push({ label: step.label, ok: false, error: e });
      }
      this.index += 1;
      this._emitProgress(step.label);
      if (this._stopRequested || this._completeRequested) break;
    }
    this._controller = null;
    this._loopExited = true;
    if (this._stopRequested) {
      this._setState("stopped");
    } else if (this.allFailed) {
      this._setState("failed");
    } else {
      this._setState("done");
    }
    this._emitProgress("");
    return this.results;
  }
}

/* --- Minimal toast (no dependency): errors and job notices go here
 * as well as into #status, so a stopped/paused search is visible
 * even after the user scrolls past the form. */
function showToast(message, kind) {
  if (typeof document === "undefined") return null;
  let box = document.getElementById("toasts");
  if (!box) {
    box = document.createElement("div");
    box.id = "toasts";
    box.setAttribute("aria-live", "polite");
    document.body.appendChild(box);
  }
  const el = document.createElement("div");
  el.className = "toast" + (kind ? " toast-" + kind : "");
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => { try { el.remove(); } catch (e) {} }, 6000);
  return el;
}

/* --- DOM binding: progress bar + Pause / Stop / Resume buttons.
 * els: { bar, barFill, barText, pauseBtn, stopBtn, resumeBtn }
 * All elements are optional — missing ones are skipped, so the job
 * still works on pages that only wire some controls.
 * Re-binding is safe: the page creates a new SearchJob per search,
 * and the buttons are wired once — each click reads the CURRENT job
 * off the button, so a second bind just re-points them.
 * NOTE: a step aborted by Stop is retried on Resume (it never
 * finished, so it is still "remaining"). The aborted attempt stays
 * in job.results as a record, but job.done counts completed steps. */
function bindSearchControls(job, els) {
  els = els || {};
  function currentJob() { return (els.pauseBtn && els.pauseBtn._wsJob) || job; }
  function paint(p) {
    const j = currentJob();
    const total = p.total || j.total || 1;
    const pct = Math.round((100 * p.done) / total);
    if (els.bar) els.bar.hidden = !(j.state === "running" || j.state === "paused" || j.state === "stopped");
    if (els.barFill) els.barFill.style.width = pct + "%";
    if (els.barText) {
      const bits = [];
      if (p.current && j.state === "running") bits.push("Searching " + p.current + "…");
      bits.push(p.done + "/" + total + " done");
      if (j.state === "paused") bits.push("— paused");
      if (j.state === "stopped") bits.push("— stopped, partial results");
      els.barText.textContent = bits.join(" ");
    }
    if (els.pauseBtn) els.pauseBtn.disabled = j.state !== "running";
    if (els.stopBtn) els.stopBtn.disabled = !(j.state === "running" || j.state === "paused");
    if (els.resumeBtn) els.resumeBtn.disabled = !(j.state === "paused" || j.state === "stopped");
  }
  job.onProgress = (function (prev) {
    return function (p) { paint(p); if (prev) prev(p); };
  })(job.onProgress);
  job.onState = (function (prev) {
    return function (s) {
      paint({ done: job.done, total: job.total, current: "", state: s, results: job.results });
      if (prev) prev(s);
    };
  })(job.onState);
  function bindBtn(btn, action, msg, kind) {
    if (!btn) return;
    btn._wsJob = job; // re-pointed on every bind: newest job wins
    if (btn._wsBound) return;
    btn._wsBound = true;
    btn.addEventListener("click", () => {
      const j = btn._wsJob;
      if (j && j[action]()) showToast(msg, kind);
    });
  }
  bindBtn(els.pauseBtn, "pause", "Search paused — no new requests until you resume.", "info");
  bindBtn(els.stopBtn, "stop", "Search stopped — keeping the results found so far.", "warn");
  bindBtn(els.resumeBtn, "resume", "Search resumed — continuing with the remaining networks.", "info");
  paint({ done: 0, total: job.total, current: "", state: job.state, results: [] });
  return { paint, showToast };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { SearchJob, inRange, showToast, bindSearchControls, STATES };
}
if (typeof window !== "undefined") {
  window.WS_SEARCH_JOB = { SearchJob, inRange, showToast, bindSearchControls, STATES };
}
