// Small shared watch/phone helpers. REST/MQTT parsing stays off the watch.
function object(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function number(v) { return typeof v === "number" && isFinite(v) && v >= 0; }
function id(v) { return typeof v === "string" && v.length > 0 && v.length <= 48 && /^[a-zA-Z0-9_-]+$/.test(v); }

export function directions(network, station, line) {
  var route = network.lines.filter(function (l) { return l.id === line; })[0];
  if (!route || route.stations.indexOf(station) === -1) return [];
  return [route.stations[0], route.stations[route.stations.length - 1]].filter(function (s) { return s !== station; });
}
export function favoriteKey(f) { return f.station + "/" + f.line + "/" + f.direction; }
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
export function validValue(p, received) {
  if (!id(p.direction) || !number(p.order) || p.order % 1 || p.order < 1 || p.order > 3 ||
      (p.units !== "s" && p.units !== "m") || ["e", "t", "l", "m", "i"].indexOf(p.type) === -1 || !number(p.value)) return false;
  if (p.type === "t") return p.units === "s" && p.value <= received / 1000 + 86400;
  var max = p.units === "m" ? 1440 : 86400;
  return p.value <= max && (p.type !== "i" || (number(p.upper) && p.upper >= p.value && p.upper <= max));
}
function fresh(p, now) {
  return object(p) && number(now) && number(p.received) && number(p.expires) &&
    p.received - now <= 30000 && p.expires > now && p.expires > p.received && p.expires <= p.received + 120000 && validValue(p, p.received);
}
export function exactSeconds(p, now) {
  if (now === undefined) now = Date.now();
  if (!fresh(p, now) || p.type !== "e" || p.units !== "s") return;
  return Math.max(0, p.value - Math.max(0, now - p.received) / 1000);
}
export function arrivalLabel(p, now) {
  if (!fresh(p, now)) return;
  var elapsed = Math.max(0, now - p.received) / 1000, multiplier = p.units === "m" ? 60 : 1;
  var seconds = Math.max(0, p.type === "t" ? p.value - now / 1000 : p.value * multiplier - elapsed);
  if (!seconds && (p.type === "e" || p.type === "t")) return { value: "Due", unit: "at platform" };
  if (p.type === "i") return { value: Math.floor(seconds / 60) + "–" + Math.ceil(Math.max(0, p.upper * multiplier - elapsed) / 60), unit: "min" };
  if (p.type === "l" || p.type === "m") return { value: p.type === "l" ? "<" + Math.ceil(seconds / 60) : ">" + Math.floor(seconds / 60), unit: "min" };
  if (p.units === "m") return { value: "~" + Math.ceil(seconds / 60), unit: "min" };
  var rounded = Math.ceil(seconds), remainder = rounded % 60;
  return rounded < 60 ? { value: String(rounded), unit: "sec" } :
    { value: Math.floor(rounded / 60) + ":" + (remainder < 10 ? "0" : "") + remainder, unit: "min" };
}
