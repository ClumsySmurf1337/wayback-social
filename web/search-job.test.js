/* Node test for search-job.js — no dependencies, no browser.
 * Run:  node web/search-job.test.js
 * Exit 0 = the job state machine behaves: sequential steps, pause
 * halts between steps, stop aborts and keeps partial results, resume
 * continues with the remaining steps only, all-failed = failed state,
 * and inRange() respects the From/To date window.
 */
"use strict";
const { SearchJob, inRange } = require("./search-job.js");

let failures = 0;
let checks = 0;
function check(label, actual, expected) {
  checks += 1;
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log((ok ? "PASS" : "FAIL") + "  " + label + "  ->  " + JSON.stringify(actual) +
    (ok ? "" : "  (expected " + JSON.stringify(expected) + ")"));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function step(label, ms, value, fail) {
  return {
    label,
    run: async (signal) => {
      await sleep(ms);
      if (signal && signal.aborted) {
        const e = new Error("aborted");
        e.name = "AbortError";
        throw e;
      }
      if (fail) throw new Error("boom:" + label);
      return value;
    },
  };
}

async function main() {
  // --- inRange: CDX timestamps vs the From/To window -----------------
  check("inRange inside", inRange("20210615120000", "20200101", "20231231"), true);
  check("inRange before from", inRange("20191231235959", "20200101", "20231231"), false);
  check("inRange after to", inRange("20240101000000", "20200101", "20231231"), false);
  check("inRange open from", inRange("20060321212430", "", "20231231"), true);
  check("inRange open to", inRange("20240101000000", "20200101", ""), true);
  check("inRange open both", inRange("20060321212430", "", ""), true);
  check("inRange exact from day", inRange("20200101000000", "20200101", "20231231"), true);
  check("inRange exact to day", inRange("20231231235959", "20200101", "20231231"), true);
  check("inRange unparseable shown", inRange("", "20200101", "20231231"), true);

  // --- Happy path: sequential steps, done state ----------------------
  const job1 = new SearchJob([step("a", 5, 1), step("b", 5, 2), step("c", 5, 3)]);
  const states1 = [];
  job1.onState = (s) => states1.push(s);
  const res1 = await job1.start();
  check("job1 state done", job1.state, "done");
  check("job1 results", res1.map((r) => r.value).join(","), "1,2,3");
  check("job1 all succeeded", job1.succeeded.length, 3);
  check("job1 states seen", states1.join(","), "running,done");

  // --- Pause halts between steps; resume continues with the rest ----
  const job2 = new SearchJob([step("a", 10, 1), step("b", 10, 2), step("c", 10, 3), step("d", 10, 4)]);
  const p2 = job2.start();
  await sleep(15); // step a done, b in flight
  check("job2 pause() accepted", job2.pause(), true);
  check("job2 state paused", job2.state, "paused");
  await sleep(40); // b finishes; c must NOT start while paused
  check("job2 halted at 2 steps", job2.done, 2);
  check("job2 still paused", job2.state, "paused");
  job2.resume();
  await p2;
  check("job2 state done after resume", job2.state, "done");
  check("job2 all 4 ran", job2.done, 4);
  check("job2 values in order", job2.results.map((r) => r.value).join(","), "1,2,3,4");

  // --- Stop aborts the in-flight step and keeps partial results -----
  const job3 = new SearchJob([step("a", 5, 1), step("slow", 500, 2), step("c", 5, 3)]);
  const p3 = job3.start();
  await sleep(12); // a done, slow in flight
  check("job3 stop() accepted", job3.stop(), true);
  await p3;
  check("job3 state stopped", job3.state, "stopped");
  // Only "a" completed: the aborted "slow" attempt is recorded in
  // results[] but does NOT count as done until it finishes.
  check("job3 kept partial results", job3.done, 1);
  check("job3 aborted attempt recorded", job3.results.length, 2);
  check("job3 step c never ran", job3.results.some((r) => r.label === "c"), false);
  check("job3 aborted step recorded", job3.results[1].aborted, true);

  // --- Resume after stop continues with remaining steps only --------
  // The aborted "slow" step never finished, so it is still remaining
  // and is retried; "c" runs after it. results[] keeps the aborted
  // attempt as a record (4 records, 3 completed steps).
  job3.resume();
  await job3._running;
  check("job3 done after resume", job3.state, "done");
  check("job3 step c ran on resume", job3.results.some((r) => r.label === "c" && r.ok), true);
  check("job3 total steps", job3.done, 3);
  check("job3 aborted attempt kept as record", job3.results.filter((r) => r.aborted).length, 1);

  // --- One failing step does not kill the rest -----------------------
  const job4 = new SearchJob([step("a", 5, 1), step("bad", 5, null, true), step("c", 5, 3)]);
  await job4.start();
  check("job4 state done (partial failure ok)", job4.state, "done");
  check("job4 allFailed false", job4.allFailed, false);
  check("job4 failed step recorded", job4.results[1].ok, false);

  // --- Every step failing = failed state ------------------------------
  const job5 = new SearchJob([step("a", 5, null, true), step("b", 5, null, true)]);
  await job5.start();
  check("job5 state failed", job5.state, "failed");
  check("job5 allFailed true", job5.allFailed, true);

  // --- Progress events: done/total/current ---------------------------
  const seen = [];
  const job6 = new SearchJob([step("x", 5, 1), step("y", 5, 2)], {
    onProgress: (p) => seen.push(p.done + "/" + p.total + ":" + p.state),
  });
  await job6.start();
  check("job6 progress ends 2/2 done", seen[seen.length - 1], "2/2:done");
  check("job6 progress saw 1/2", seen.some((s) => s.startsWith("1/2:")), true);

  // --- complete() ends the job early as DONE (limit reached) ---------
  const job7b = new SearchJob([step("a", 5, 1), step("b", 5, 2), step("c", 5, 3)]);
  let job7bRef = null;
  job7b.steps[1] = { label: "b", run: async () => { job7bRef.complete(); return 2; } };
  job7bRef = job7b;
  await job7b.start();
  check("complete() ends as done", job7b.state, "done");
  check("complete() ran 2 steps", job7b.done, 2);
  check("complete() skipped c", job7b.results.some((r) => r.label === "c"), false);

  // --- pause/resume/stop rejected in the wrong state ------------------
  const job7 = new SearchJob([step("a", 5, 1)]);
  check("pause idle rejected", job7.pause(), false);
  check("resume idle rejected", job7.resume(), false);
  check("stop idle rejected", job7.stop(), false);

  // --- settled / waitForResume / abandon (the render loop the -----
  // console page uses after a stop: search() in console.js and
  // searchBroad() in modes.js await settled(), render, then wait for
  // a resume and re-render the resumed run's results).
  {
    let calls = 0;
    const job8 = new SearchJob([
      { label: "a", run: async () => { calls++; return 1; } },
      { label: "b", run: async () => { calls++; return 2; } },
    ]);
    const p8 = job8.start();
    job8.stop(); // synchronous stop before the first step starts
    await p8;
    check("job8 stopped before first step", job8.state, "stopped");
    check("job8 nothing completed yet", job8.done, 0);
    const waiter8 = job8.waitForResume();
    job8.resume();
    check("waitForResume resolves true on resume", await waiter8, true);
    const res8 = await job8.settled();
    check("resumed run completes remaining steps", job8.state, "done");
    check("resumed run ran both steps", res8.map((r) => r.value).join(","), "1,2");
    check("resumed run called each step once", calls, 2);
  }
  {
    // abandon() unblocks a waiter with false (a newer search
    // replaced this job — the old render loop must stop waiting).
    const job9 = new SearchJob([step("a", 5, 1)]);
    const p9 = job9.start();
    job9.stop();
    await p9;
    const waiter9 = job9.waitForResume();
    job9.abandon();
    check("abandon resolves waitForResume with false", await waiter9, false);
  }
  {
    // waitForResume on an idle job waits — it must not resolve true
    // early, or a render loop would think the job had been resumed.
    const job10 = new SearchJob([step("a", 5, 1)]);
    let resolved10 = "pending";
    job10.waitForResume().then((v) => { resolved10 = v; });
    await sleep(20);
    check("waitForResume on idle job does not resolve early", resolved10, "pending");
    job10.abandon();
    await sleep(5);
    check("abandon resolves idle waitForResume with false", resolved10, false);
  }
  {
    // waitForResume resolves true immediately when already running.
    const job11 = new SearchJob([step("a", 50, 1)]);
    job11.start();
    check("waitForResume resolves true when running", await job11.waitForResume(), true);
    await job11.settled();
    check("job11 done after settled", job11.state, "done");
  }

  console.log(failures === 0
    ? `\nAll search-job checks passed (${checks} checks).`
    : `\n${failures} FAILURES out of ${checks} checks.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("FAIL  harness threw:", e); process.exit(1); });
