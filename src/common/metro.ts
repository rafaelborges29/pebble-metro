// Phone-side validation of UnderLX source data.
import type { Network, Station, Line, Favorite, FavoriteTriple, FavoriteSlot, Prediction } from './types.js';
export var API = "https://api.underlx.com/v1";

export function object(v: unknown): v is Record<string, unknown> { return v !== null && typeof v === "object" && !Array.isArray(v); }
function number(v: unknown): v is number { return typeof v === "number" && isFinite(v) && v >= 0; }
function text(v: unknown, max: number): v is string { return typeof v === "string" && v.length > 0 && v.length <= max; }
function id(v: unknown): v is string { return text(v, 48) && /^[a-zA-Z0-9_-]+$/.test(v); }
function unique<T>(items: T[]) { return items.every(function (v, i) { return items.indexOf(v) === i; }); }
function bytes(value: unknown) { return encodeURIComponent(JSON.stringify(value)).replace(/%[A-F\d]{2}/gi, 'x').length; }

export function parseNetwork(stationData: unknown, lineData: unknown): Network {
  if (!Array.isArray(stationData) || !Array.isArray(lineData) || stationData.length > 200 || lineData.length > 32)
    throw new Error("Invalid network metadata");
  var stations: Station[] = [], lines: Line[] = [];
  stationData.forEach(function (s: unknown) {
    if (!object(s) || s.network !== "pt-ml") return;
    if (!id(s.id) || !text(s.name, 80) || !Array.isArray(s.lines) || !s.lines.length || s.lines.length > 8 || !s.lines.every(id) || !unique(s.lines))
      throw new Error("Invalid station metadata");
    stations.push({ id: s.id, name: s.name, lines: s.lines.slice() });
  });
  var ids = stations.map(function (s) { return s.id; });
  lineData.forEach(function (l: unknown) {
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

function directions(network: Network, station: string, line: string) {
  var route = network.lines.filter(function (l) { return l.id === line; })[0];
  if (!route || route.stations.indexOf(station) === -1) return [];
  return [route.stations[0]!, route.stations[route.stations.length - 1]!].filter(function (s) { return s !== station; });
}
function favoriteKey(f: Favorite) { return f.station + "/" + f.line + "/" + f.direction; }
export function parseFavorites(raw: string | null, network: Network): Favorite[] {
  try {
    if (raw !== null && (typeof raw !== "string" || raw.length > 10000)) return [];
    var items: unknown = JSON.parse(raw || "[]"), result: Favorite[] = [], seen: string[] = [];
    if (!Array.isArray(items)) return [];
    items.slice(0, 100).forEach(function (f: unknown) {
      if (!object(f) || !id(f.station) || !id(f.line) || !id(f.direction) || directions(network, f.station, f.line).indexOf(f.direction) === -1) return;
      var favorite: Favorite = { station: f.station, line: f.line, direction: f.direction };
      var key = favoriteKey(favorite);
      if (seen.indexOf(key) === -1 && result.length < 20) {
        result.push(favorite); seen.push(key);
      }
    });
    return result;
  } catch (_) { return []; }
}
// Strict replacement validation: never filter or truncate a user's whole-list save.
export function validateFavorites(items: unknown, network: Network, baseline: FavoriteSlot[]): FavoriteTriple[] {
  if (!Array.isArray(items) || items.length > 16) throw new Error("Invalid favourites");
  var seen: string[] = [];
  return items.map(function (f: unknown) {
    if (!Array.isArray(f) || f.length !== 3 || !f.every(id)) throw new Error("Invalid route");
    var key = f.join("/");
    if (seen.indexOf(key) !== -1) throw new Error("Duplicate route");
    seen.push(key);
    var existing = baseline.some(function (b) { return b && b.join("/") === key; });
    if (!existing && directions(network, f[0]!, f[1]!).indexOf(f[2]!) === -1) throw new Error("Unavailable route");
    return f.slice() as FavoriteTriple; // Exact length and all three IDs validated above.
  });
}
function validValue(p: Record<string, unknown>, received: number): p is Record<string, unknown> & Prediction {
  if (!id(p.direction) || !number(p.order) || p.order % 1 || p.order < 1 || p.order > 3 ||
      (p.units !== "s" && p.units !== "m") || (typeof p.type !== 'string' || ["e", "t", "l", "m", "i"].indexOf(p.type) === -1) || !number(p.value)) return false;
  if (p.type === "t") return p.units === "s" && p.value <= received / 1000 + 86400;
  var max = p.units === "m" ? 1440 : 86400;
  return p.value <= max && (p.type !== "i" || (number(p.upper) && p.upper >= p.value && p.upper <= max));
}

// UnderLX already ages relative values and validFor. Age only from receipt,
// with made as an independent upstream-staleness guard, never double-subtract.
function expiresAt(item: Record<string, unknown>, received: number) {
  if (!number(item.made) || !number(item.validFor) || !item.validFor ||
      received - item.made * 1000 >= 120000 || item.made * 1000 - received > 30000) return;
  return Math.min(received + Math.min(item.validFor, 120) * 1000, item.made * 1000 + 120000);
}
export function parsePredictions(data: unknown, received?: number): Prediction[] {
  if (received === undefined) received = Date.now();
  if (!number(received) || !Array.isArray(data) || data.length > 64) throw new Error("Invalid arrival message");
  var result: Prediction[] = [];
  data.forEach(function (item: unknown) {
    if (!object(item)) return;
    var expires = expiresAt(item, received);
    if (!expires || !isFinite(expires)) return;
    var p: Record<string, unknown> = { direction: item.direction, order: item.order, type: item.type, units: item.units,
      value: item.type === "i" ? item.lower : item.value, received: received, expires: expires };
    if (item.type === "i") p.upper = item.upper;
    if (!validValue(p, received)) return;
    var key = p.direction + "/" + p.order;
    result = result.filter(function (existing) { return existing.direction + "/" + existing.order !== key; });
    result.push(p);
  });
  return result.sort(function (a, b) { return a.order - b.order; });
}
