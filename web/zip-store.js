/* wayback-social web console — CRC32 + stored-entry ZIP writer.
 * Pure helpers extracted from evidence-pack.js so that file stays
 * under the ~300-line ceiling. The ZIP is written here (stored
 * entries, no compression library — nothing vendored to fetch).
 * Loaded BEFORE evidence-pack.js (which calls crc32 / zipStore as
 * bare globals); the node tests require it the same way.
 * No build step. No DOM, no network here.
 */
"use strict";

/* --- CRC32 (standard polynomial, table-driven) ----------------------- */
var CRC_TABLE = (function () {
  var table = new Array(256);
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes) {
  var c = 0xFFFFFFFF;
  for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* --- ZIP, stored entries only (no compression) ----------------------- */
function dosDateTime(d) {
  var time = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
  var date = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  return { time: time, date: date };
}
function u16(n) { return [n & 0xFF, (n >> 8) & 0xFF]; }
function u32(n) { return [n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >> 24) & 0xFF]; }
function concat(parts) {
  var len = parts.reduce(function (a, p) { return a + p.length; }, 0);
  var out = new Uint8Array(len), off = 0;
  parts.forEach(function (p) { out.set(p, off); off += p.length; });
  return out;
}
// files: [{name, data: Uint8Array}] -> Uint8Array (a .zip).
function zipStore(files) {
  var now = dosDateTime(new Date());
  var localParts = [], centralParts = [], offset = 0;
  files.forEach(function (f) {
    var name = new TextEncoder().encode(f.name);
    var crc = crc32(f.data);
    var header = concat([
      new Uint8Array([0x50, 0x4B, 0x03, 0x04]),
      new Uint8Array(u16(20)), new Uint8Array(u16(0x0800)), new Uint8Array(u16(0)),
      new Uint8Array(u16(now.time)), new Uint8Array(u16(now.date)),
      new Uint8Array(u32(crc)), new Uint8Array(u32(f.data.length)), new Uint8Array(u32(f.data.length)),
      new Uint8Array(u16(name.length)), new Uint8Array(u16(0)),
      name,
    ]);
    localParts.push(header, f.data);
    centralParts.push(concat([
      new Uint8Array([0x50, 0x4B, 0x01, 0x02]),
      new Uint8Array(u16(20)), new Uint8Array(u16(20)), new Uint8Array(u16(0x0800)), new Uint8Array(u16(0)),
      new Uint8Array(u16(now.time)), new Uint8Array(u16(now.date)),
      new Uint8Array(u32(crc)), new Uint8Array(u32(f.data.length)), new Uint8Array(u32(f.data.length)),
      new Uint8Array(u16(name.length)), new Uint8Array(u16(0)), new Uint8Array(u16(0)),
      new Uint8Array(u16(0)), new Uint8Array(u16(0)), new Uint8Array(u32(0)), new Uint8Array(u32(offset)),
      name,
    ]));
    offset += header.length + f.data.length;
  });
  var central = concat(centralParts);
  var end = concat([
    new Uint8Array([0x50, 0x4B, 0x05, 0x06]),
    new Uint8Array(u16(0)), new Uint8Array(u16(0)),
    new Uint8Array(u16(files.length)), new Uint8Array(u16(files.length)),
    new Uint8Array(u32(central.length)), new Uint8Array(u32(offset)),
    new Uint8Array(u16(0)),
  ]);
  return concat(localParts.concat([central, end]));
}

if (typeof window !== "undefined") {
  window.WS_ZIP_STORE = { crc32: crc32, zipStore: zipStore };
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { crc32: crc32, zipStore: zipStore };
}
