import { validateFavorites } from "../common/metro.js";
import { settingsPage } from "./settings-page.js";

function uint(value, min) { return typeof value === "number" && isFinite(value) && value % 1 === 0 && value >= min && value <= 4294967295; }
function route(value) { return Array.isArray(value) && value.length === 3 && value.every(function (id) { return typeof id === "string" && /^[a-zA-Z0-9_-]{1,48}$/.test(id); }); }
var STATUSES = ["ready", "saved", "conflict", "invalid", "storage", "unknown"];

// The page has no bridge/storage/network of its own. Only the companion talks to the watch.
export function createSettings(options) {
  var pebble = options.Pebble, timers = options.timers, registry = options.localeRegistry;
  function pageLanguage(locale) {
    var file = registry.locales[locale] || registry.locales[registry.fallback];
    return file === "pt_PT.json" ? "pt" : "en";
  }
  var session = null, network = null, catalog = 0, assembly = null, state = null, edit = null;
  var request = 0, pending = null, pendingTimer = null, openingTimer = null, opening = 0, lastStatus = "ready", closed = false;
  function send(message, key) { return session && options.send(message, "settings:" + key); }
  function usable() { return state && state.catalog === catalog && network && state.writable; }
  function open() {
    var visit = ++opening;
    edit = null;
    if (openingTimer) timers.clearTimeout(openingTimer);
    var previous = state && state.snapshot;
    send({ type: "settings-get" }, "get");
    // Require a fresh complete response, not an old mirror after a disconnect.
    var waited = 0;
    function show() {
      if (closed || visit !== opening) return;
      var fresh = state && state.snapshot !== previous;
      if ((!usable() || !fresh || pending) && waited < 5000) {
        waited += 100; openingTimer = timers.setTimeout(show, 100); return;
      }
      openingTimer = null;
      var model = { language: state ? state.language : "en", status: state && !state.writable && lastStatus === "ready" ? "storage" : lastStatus };
      if (usable() && fresh && !pending) {
        edit = { token: Date.now().toString(36) + "-" + visit + "-" + Math.random().toString(36).slice(2, 10),
          session: session, revision: state.revision, catalog: state.catalog, slots: state.slots, network: network };
        model.edit = edit.token; model.network = network;
        model.favorites = state.slots.filter(function (f) { return f !== null; });
      }
      try { pebble.openURL(settingsPage(model)); }
      catch (_) { edit = null; pebble.openURL(settingsPage({ language: model.language })); }
    }
    show();
  }
  function submitted(event) {
    var baseline = edit; edit = null;
    if (!baseline || pending || !event || !event.response) return;
    try {
      var raw = event.response;
      if (typeof raw !== "string" || raw.length > 15000) return;
      if (raw.charAt(0) !== "{") raw = decodeURIComponent(raw);
      if (raw.length > 5000) return;
      var data = JSON.parse(raw);
      if (!data || data.v !== 1 || data.edit !== baseline.token) return;
      if (baseline.session !== session) { lastStatus = "conflict"; return; }
      // Send the original baseline even if a newer snapshot arrived: the watch
      // rejects it with a visible conflict result rather than overwriting edits.
      var favorites = validateFavorites(data.favorites, baseline.network, baseline.slots);
      var message = { type: "settings-save", request: ++request, revision: baseline.revision, catalog: baseline.catalog, favorites: favorites };
      pending = message.request;
      if (!send(message, "save")) { pending = null; lastStatus = "unknown"; return; }
      pendingTimer = timers.setTimeout(function () {
        pending = null; pendingTimer = null; state = null; lastStatus = "unknown";
      }, 15000);
    } catch (_) { lastStatus = "invalid"; }
  }
  pebble.addEventListener("showConfiguration", open);
  pebble.addEventListener("webviewclosed", submitted);
  return {
    catalog: function (value, id) { network = value; catalog = id; },
    reset: function (nextSession) {
      if (session === nextSession) return;
      session = nextSession; assembly = null; state = null; edit = null;
      if (pending) lastStatus = "unknown";
      pending = null;
      if (pendingTimer) timers.clearTimeout(pendingTimer);
      pendingTimer = null;
    },
    receive: function (message) {
      if (!uint(message.snapshot, 1) || !uint(message.revision, 1) || !uint(message.catalog, 0) || !uint(message.part, 0) || message.part > 3
        || !uint(message.request, 0) || STATUSES.indexOf(message.status) === -1 || typeof message.writable !== "boolean"
        || typeof message.locale !== "string" || !/^[a-zA-Z0-9_-]{0,15}$/.test(message.locale) || !Array.isArray(message.favorites) || message.favorites.length !== 4
        || !message.favorites.every(function (f) { return f === null || route(f); })) return;
      if (assembly && message.snapshot < assembly.snapshot) return;
      if (!assembly || assembly.snapshot !== message.snapshot) assembly = { snapshot: message.snapshot, revision: message.revision,
        catalog: message.catalog, request: message.request, status: message.status, writable: message.writable, locale: message.locale, parts: [] };
      if (["revision", "catalog", "request", "status", "writable", "locale"].some(function (key) { return assembly[key] !== message[key]; })) return;
      if (assembly.parts[message.part] && JSON.stringify(assembly.parts[message.part]) !== JSON.stringify(message.favorites)) return;
      assembly.parts[message.part] = message.favorites;
      if (assembly.parts.filter(Boolean).length === 4) {
        var slots = [].concat.apply([], assembly.parts), keys = [];
        if (!slots.every(function (f) { if (!f) return true; var key = f.join("/"); if (keys.indexOf(key) !== -1) return false; keys.push(key); return true; })) return;
        state = { snapshot: assembly.snapshot, revision: assembly.revision, catalog: assembly.catalog, slots: slots, writable: assembly.writable, language: pageLanguage(assembly.locale) };
        if (pending === assembly.request) {
          pending = null; lastStatus = assembly.status;
          if (pendingTimer) timers.clearTimeout(pendingTimer);
          pendingTimer = null;
        } else if (lastStatus === "ready" && assembly.status !== "ready") lastStatus = assembly.status;
      }
      send({ type: "settings-receipt", snapshot: message.snapshot, part: message.part }, "receipt");
    },
    close: function () {
      closed = true; edit = null;
      if (pendingTimer) timers.clearTimeout(pendingTimer);
      if (openingTimer) timers.clearTimeout(openingTimer);
      if (pebble.removeEventListener) {
        pebble.removeEventListener("showConfiguration", open);
        pebble.removeEventListener("webviewclosed", submitted);
      }
    }
  };
}
