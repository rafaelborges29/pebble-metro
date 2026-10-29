// Phone-side route and prediction validation helpers.
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
