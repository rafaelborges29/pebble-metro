// Phone-side validation of UnderLX source data.
export var API = "https://api.underlx.com/v1";

function object(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function number(v) { return typeof v === "number" && isFinite(v) && v >= 0; }
function text(v, max) { return typeof v === "string" && v.length > 0 && v.length <= max; }
function id(v) { return text(v, 48) && /^[a-zA-Z0-9_-]+$/.test(v); }
function unique(items) { return items.every(function (v, i) { return items.indexOf(v) === i; }); }
function bytes(value) { return encodeURIComponent(JSON.stringify(value)).replace(/%[A-F\d]{2}/gi, 'x').length; }

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

function directions(network, station, line) {
  var route = network.lines.filter(function (l) { return l.id === line; })[0];
  if (!route || route.stations.indexOf(station) === -1) return [];
  return [route.stations[0], route.stations[route.stations.length - 1]].filter(function (s) { return s !== station; });
}
function favoriteKey(f) { return f.station + "/" + f.line + "/" + f.direction; }
export function parseFavorites(raw, network) {
  try {
    if (raw !== null && (typeof raw !== "string" || raw.length > 10000)) return [];
    var items = JSON.parse(raw || "[]"), result = [], seen = [];
    if (!Array.isArray(items)) return [];
    items.slice(0, 100).forEach(function (f) {
      if (!object(f) || !id(f.station) || !id(f.line) || !id(f.direction) || directions(network, f.station, f.line).indexOf(f.direction) === -1) return;
      var key = favoriteKey(f);
      if (seen.indexOf(key) === -1 && result.length < 20) {
        result.push({ station: f.station, line: f.line, direction: f.direction }); seen.push(key);
      }
    });
    return result;
  } catch (_) { return []; }
}
function validValue(p, received) {
  if (!id(p.direction) || !number(p.order) || p.order % 1 || p.order < 1 || p.order > 3 ||
      (p.units !== "s" && p.units !== "m") || ["e", "t", "l", "m", "i"].indexOf(p.type) === -1 || !number(p.value)) return false;
  if (p.type === "t") return p.units === "s" && p.value <= received / 1000 + 86400;
  var max = p.units === "m" ? 1440 : 86400;
  return p.value <= max && (p.type !== "i" || (number(p.upper) && p.upper >= p.value && p.upper <= max));
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
