/* wayback-social web console — date pickers (flatpickr).
 * Extracted from console.js so that file stays under the ~500-line
 * ceiling. Loaded right after console.js; it uses that file's
 * globals ($). It initialises itself at load (scripts load at end
 * of body, so the DOM is ready) and sets window.WS_DATEPICKERS.
 * No build step.
 */
// Date pickers — flatpickr 4.6.13 (MIT), vendored in
// web/vendor/flatpickr/ (no CDN, no tracker). FROM/TO feed the CDX
// from/to params as YYYYMMDD; the picker shows a human-readable date
// (alt input) while the real input keeps YYYYMMDD for the query.
// Manual typing still works (allowInput) and is validated in
// search(). If the vendored file fails to load, the plain inputs stay.
//
// parsePickerDate: flatpickr's built-in string parser reads a string
// with dateFormat "Ymd", so an ISO string like "2023-12-31" is
// mis-parsed as 2023-01-01 (the dashes break its token scan —
// verified in the browser 2026-11-26; a Date object parses fine).
// This custom parser handles ISO ("2023-12-31"), compact
// ("20231231") and long ("December 31, 2023") input, so a typed date
// or a setDate() string can never silently land on the wrong day.
function parsePickerDate(datestr) {
  if (datestr instanceof Date) return datestr;
  if (typeof datestr !== "string") return undefined;
  const s = datestr.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) || /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(s); // "December 31, 2023", "Dec 31, 2023", ...
  return isNaN(d.getTime()) ? undefined : d;
}
function initDatePickers() {
  const fromEl = $("from"), toEl = $("to");
  if (!fromEl || !toEl) return false;
  // No flatpickr (vendored file failed to load): the plain YYYYMMDD
  // inputs still work, and the clear buttons still clear them.
  if (!window.flatpickr) {
    const fc = $("from-clear");
    if (fc) fc.onclick = () => { fromEl.value = ""; };
    const tc = $("to-clear");
    if (tc) tc.onclick = () => { toEl.value = ""; };
    return false;
  }
  const common = { dateFormat: "Ymd", altInput: true, altFormat: "F j, Y", allowInput: true, parseDate: parsePickerDate };
  const fromPicker = window.flatpickr(fromEl, Object.assign({}, common, {
    onChange: (dates) => { if (dates[0] && toPicker) toPicker.set("minDate", dates[0]); },
  }));
  const toPicker = window.flatpickr(toEl, Object.assign({}, common, {
    onChange: (dates) => { if (dates[0] && fromPicker) fromPicker.set("maxDate", dates[0]); },
  }));
  window.WS_DATEPICKERS = { from: fromPicker, to: toPicker };
  const fc = $("from-clear");
  if (fc) fc.onclick = () => { fromPicker.clear(); if (toPicker) toPicker.set("minDate", undefined); };
  const tc = $("to-clear");
  if (tc) tc.onclick = () => { toPicker.clear(); if (fromPicker) fromPicker.set("maxDate", undefined); };
  return true;
}
initDatePickers();

if (typeof window !== "undefined") {
  window.WS_DATEPICKERS_INIT = { parsePickerDate: parsePickerDate, initDatePickers: initDatePickers };
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { parsePickerDate: parsePickerDate, initDatePickers: initDatePickers };
}
