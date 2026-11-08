import { validateFavorites } from "../common/metro.js";
import { settingsPage } from "./settings-page.js";

function uint(value, min) { return typeof value === "number" && isFinite(value) && value % 1 === 0 && value >= min && value <= 4294967295; }
function route(value) { return Array.isArray(value) && value.length === 3 && value.every(function (id) { return typeof id === "string" && /^[a-zA-Z0-9_-]{1,48}$/.test(id); }); }
var STATUSES = ["ready", "saved", "conflict", "invalid", "storage", "unknown"];

// The page uses Pebble's local live bridge. Only this companion talks to the watch.
export function createSettings(options) {
  var pebble = options.Pebble, timers = options.timers, registry = options.localeRegistry;
  var session = null, network = null, catalog = 0, assembly = null, state = null, edit = null;
  var request = 0, pending = null, reader = null, openingTimer = null, opening = 0, closed = false;
  var live = typeof pebble.sendConfigMessage === "function";
  function send(message, key) { return session && options.send(message, "settings:" + key); }
  function usable() { return state && state.catalog === catalog && network; }
  function view(token) {
    if (!edit || token !== edit.token || edit.session !== session || !usable()) return null;
    edit.revision = state.revision; edit.catalog = state.catalog; edit.slots = state.slots; edit.network = network;
    return { editable: state.writable, favorites: state.slots.filter(function (f) { return f !== null; }), network: network };
  }
  function finishRead(status) {
    var job = reader; reader = null;
    if (!job) return;
    timers.clearTimeout(job.timer);
    job.respond({ status: status, view: status === "ready" ? view(job.token) : null });
  }
  function finishSave(status) {
    var job = pending; pending = null;
    if (!job) return;
    timers.clearTimeout(job.timer);
    job.respond({ status: status, view: view(job.token) });
  }
  function open() {
    var visit = ++opening;
    edit = null; finishRead("expired");
    if (openingTimer) timers.clearTimeout(openingTimer);
    var previous = state && state.snapshot;
    send({ type: "settings-get" }, "get");
    var waited = 0;
    function show() {
      if (closed || visit !== opening) return;
      var fresh = state && state.snapshot !== previous;
      if ((!usable() || !fresh || pending) && waited < 5000) {
        waited += 100; openingTimer = timers.setTimeout(show, 100); return;
      }
      openingTimer = null;
      // An unavailable watch is not an editable empty list. Keep an edit session
      // so the page's Refresh can recover without closing once the watch responds.
      var token = Date.now().toString(36) + "-" + visit + "-" + Math.random().toString(36).slice(2, 10);
      edit = { token: token, session: session };
      var file = registry.locales[state && state.locale] || registry.locales[registry.fallback];
      var model = { edit: token, language: file === "pt_PT.json" ? "pt" : "en", strings: options.phoneLocales[file] || options.phoneLocales["en.json"],
        view: usable() && fresh && !pending ? view(token) : null };
      pebble.openURL(settingsPage(model));
    }
    show();
  }
  function configMessage(event) {
    if (!event || typeof event.respond !== "function") return;
    var data = event.data;
    try {
      if (!data || JSON.stringify(data).length > 5000 || data.v !== 1 || typeof data.edit !== "string") throw new Error("Invalid message");
      if (closed || !edit || data.edit !== edit.token || edit.session !== session) { event.respond({ status: "expired", view: null }); return; }
      if (pending || reader) { event.respond({ status: "busy", view: null }); return; }
      if (data.type === "settings-read") {
        reader = { token: data.edit, respond: event.respond, previous: state && state.snapshot };
        reader.timer = timers.setTimeout(function () { finishRead("unavailable"); }, 5000);
        if (!send({ type: "settings-get" }, "get")) finishRead("unavailable");
      } else if (data.type === "settings-save") {
        if (!edit.slots || !state || !state.writable) { event.respond({ status: state && !state.writable ? "storage" : "unavailable", view: null }); return; }
        var favorites = validateFavorites(data.favorites, edit.network, edit.slots);
        var message = { type: "settings-save", request: ++request, revision: edit.revision, catalog: edit.catalog, favorites: favorites };
        pending = { request: message.request, token: data.edit, respond: event.respond };
        pending.timer = timers.setTimeout(function () { state = null; finishSave("unknown"); }, 15000);
        if (!send(message, "save")) { state = null; finishSave("unknown"); }
      } else event.respond({ status: "invalid", view: null });
    } catch (_) { event.respond({ status: "invalid", view: null }); }
  }
  function pageClosed() { edit = null; finishRead("expired"); }
  pebble.addEventListener("showConfiguration", open);
  pebble.addEventListener("webviewclosed", pageClosed);
  // Older mobile apps must retain arrivals instead of throwing on an unknown event.
  if (live) pebble.addEventListener("configmessage", configMessage);
  return {
    catalog: function (value, id) { network = value; catalog = id; },
    reset: function (nextSession) {
      if (session === nextSession) return;
      session = nextSession; assembly = null; state = null; edit = null;
      finishRead("expired"); finishSave("unknown");
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
        state = { snapshot: assembly.snapshot, revision: assembly.revision, catalog: assembly.catalog, slots: slots, writable: assembly.writable, locale: assembly.locale };
        if (pending && pending.request === assembly.request) finishSave(assembly.status);
        if (reader && reader.previous !== state.snapshot && usable()) finishRead("ready");
      }
      send({ type: "settings-receipt", snapshot: message.snapshot, part: message.part }, "receipt");
    },
    close: function () {
      closed = true; edit = null;
      finishRead("expired"); finishSave("unknown");
      if (openingTimer) timers.clearTimeout(openingTimer);
      if (pebble.removeEventListener) {
        pebble.removeEventListener("showConfiguration", open);
        pebble.removeEventListener("webviewclosed", pageClosed);
        if (live) pebble.removeEventListener("configmessage", configMessage);
      }
    }
  };
}
