// Phone-side source validation. Small display helpers are shared with the watch.
import { directions, favoriteKey, parseFavorites, validValue, exactSeconds, arrivalLabel } from "./display.js";
export { directions, favoriteKey, parseFavorites, exactSeconds, arrivalLabel };
export var API = "https://api.underlx.com/v1";

function object(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function number(v) { return typeof v === "number" && isFinite(v) && v >= 0; }
function text(v, max) { return typeof v === "string" && v.length > 0 && v.length <= max; }
function id(v) { return text(v, 48) && /^[a-zA-Z0-9_-]+$/.test(v); }
function unique(items) { return items.every(function (v, i) { return items.indexOf(v) === i; }); }
function bytes(value) { return encodeURIComponent(JSON.stringify(value)).replace(/%[A-F\d]{2}/gi, 'x').length; }
function shorten(text, length) {
  var end = Math.max(1, Math.min(length, text.length)), code = text.charCodeAt(end - 1);
  if (code >= 0xD800 && code <= 0xDBFF) end--;
  return text.slice(0, end) + '…';
}

export function parseNetwork(stationData, lineData) {
  if (!Array.isArray(stationData) || !Array.isArray(lineData) || stationData.length > 200 || lineData.length > 32)
    throw new Error("Invalid network metadata");
  var stations = [], lines = [];
  stationData.forEach(function (s) {
    if (!object(s) || s.network !== "pt-ml") return;
    if (!id(s.id) || !text(s.name, 80) || !Array.isArray(s.lines) || !s.lines.length || s.lines.length > 8 || !s.lines.every(id) || !unique(s.lines))
      throw new Error("Invalid station metadata");
    stations.push({ id: s.id, name: s.name, lines: s.lines.slice() });
  });
  var ids = stations.map(function (s) { return s.id; });
  lineData.forEach(function (l) {
    if (!object(l) || l.network !== "pt-ml") return;
    if (!id(l.id) || !text(l.name, 40) || typeof l.color !== "string" || !/^[\da-f]{6}$/i.test(l.color) ||
        !Array.isArray(l.stations) || l.stations.length < 2 || l.stations.length > 80 ||
        !l.stations.every(function (s) { return id(s) && ids.indexOf(s) !== -1; }) || !unique(l.stations))
      throw new Error("Invalid line metadata");
    lines.push({ id: l.id, name: l.name, color: "#" + l.color, stations: l.stations.slice() });
  });
  if (!stations.length || stations.length > 80 || !lines.length || lines.length > 8 || !unique(ids) || !unique(lines.map(function (l) { return l.id; })))
    throw new Error("Incomplete network metadata");
  stations.forEach(function (s) {
    s.lines = s.lines.filter(function (line) {
      return lines.some(function (l) { return l.id === line && l.stations.indexOf(s.id) !== -1; });
    });
    if (!s.lines.length) throw new Error("Unserved station");
  });
  lines.forEach(function (l) {
    if (!l.stations.every(function (station) {
      return stations.some(function (s) { return s.id === station && s.lines.indexOf(l.id) !== -1; });
    })) throw new Error("Inconsistent line metadata");
  });
  // The emulator's older ICU binding throws even for valid station names.
  stations.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
  var network = { stations: stations, lines: lines };
  if (bytes({ type: "catalog", network: network, cached: false }) > 4800)
    throw new Error("Network metadata too large");
  return network;
}

// UnderLX already ages relative values and validFor. Age only from receipt,
// with made as an independent upstream-staleness guard, never double-subtract.
function expiresAt(item, received) {
  if (!number(item.made) || !number(item.validFor) || !item.validFor ||
      received - item.made * 1000 >= 120000 || item.made * 1000 - received > 30000) return;
  return Math.min(received + Math.min(item.validFor, 120) * 1000, item.made * 1000 + 120000);
}
export function parsePredictions(data, received) {
  if (received === undefined) received = Date.now();
  if (!number(received) || !Array.isArray(data) || data.length > 64) throw new Error("Invalid arrival message");
  var result = [];
  data.forEach(function (item) {
    if (!object(item)) return;
    var expires = expiresAt(item, received);
    if (!expires || !isFinite(expires)) return;
    var p = { direction: item.direction, order: item.order, type: item.type, units: item.units,
      value: item.type === "i" ? item.lower : item.value, received: received, expires: expires };
    if (item.type === "i") p.upper = item.upper;
    if (!validValue(p, received)) return;
    var key = p.direction + "/" + p.order;
    result = result.filter(function (existing) { return existing.direction + "/" + existing.order !== key; });
    result.push(p);
  });
  return result.sort(function (a, b) { return a.order - b.order; });
}
export function parseDisturbances(data, network) {
  if (!Array.isArray(data) || data.length > 200) throw new Error("Invalid service updates");
  var result = [];
  data.forEach(function (item) {
    if (!object(item) || !text(item.id, 80) || !id(item.line) || typeof item.ended !== "boolean") throw new Error("Invalid service update");
    if (item.ended || !network.lines.some(function (l) { return l.id === item.line; })) return;
    var description = typeof item.description === "string" ? item.description : "";
    var updated = typeof item.startTime === "string" ? Date.parse(item.startTime) : NaN;
    if (Array.isArray(item.statuses)) item.statuses.forEach(function (status) {
      if (!object(status) || !text(status.status, 65536) || !text(status.time, 80)) return;
      var time = Date.parse(status.time);
      if (isFinite(time) && (!isFinite(updated) || time >= updated)) { updated = time; description = status.status; }
    });
    if (!description.trim() || !number(updated) || result.some(function (d) { return d.id === item.id; })) throw new Error("Incomplete service update");
    if (description.length > 1200) description = shorten(description, 1199);
    while (bytes(description) > 1200) description = shorten(description, description.length - 100);
    result.push({ id: item.id, line: item.line, description: description,
      updated: updated, official: item.official === true });
  });
  if (result.length > 8) throw new Error("Too many service updates");
  // Keep the complete snapshot inside the watch's measured JSON/RAM budget.
  while (bytes({ type: 'service', ok: true, updated: Date.now(), disturbances: result }) > 4800) {
    var longest = result.slice().sort(function (a, b) { return b.description.length - a.description.length; })[0];
    if (!longest || longest.description.length <= 80) throw new Error('Service updates too large');
    longest.description = shorten(longest.description, Math.max(79, longest.description.length - 100));
  }
  return result.sort(function (a, b) { return b.updated - a.updated; });
}
