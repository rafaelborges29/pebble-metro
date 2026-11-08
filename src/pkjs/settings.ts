import { validateFavorites, object } from "../common/metro.js";
import { settingsPage } from "./settings-page.js";
import type { Network, FavoriteTriple, FavoriteSlot, LocaleRegistry, PhoneLocales, WatchMessage,
  SettingsStatus, SettingsReply, SettingsView, SettingsModel, SettingsSnapshot } from '../common/types.js';
import type { CompanionPebble, Timers, Timer, ConfigEvent } from './platform.js';

interface SettingsOptions {
  Pebble: CompanionPebble; timers: Timers; localeRegistry: LocaleRegistry; phoneLocales: PhoneLocales;
  send(message: WatchMessage, key: string): boolean;
}
interface Baseline { revision: number; catalog: number; slots: FavoriteSlot[]; network: Network }
interface Edit { token: string; session: string | null; baseline?: Baseline }
interface ReplyJob { token: string; respond(reply: SettingsReply): void; timer: Timer | null }
interface Reader extends ReplyJob { previous: number | null }
interface SaveJob extends ReplyJob { request: number }
type Header = Omit<SettingsSnapshot, 'part' | 'favorites'>;
interface Assembly extends Header { parts: (FavoriteSlot[] | undefined)[] }
interface State extends Omit<Header, 'request' | 'status'> { slots: FavoriteSlot[] }

function uint(value: unknown, min: number): value is number { return typeof value === "number" && isFinite(value) && value % 1 === 0 && value >= min && value <= 4294967295; }
function route(value: unknown): value is FavoriteTriple { return Array.isArray(value) && value.length === 3 && value.every(function (id: unknown) { return typeof id === "string" && /^[a-zA-Z0-9_-]{1,48}$/.test(id); }); }
var STATUSES: readonly string[] = ["ready", "saved", "conflict", "invalid", "storage", "unknown"];

function settingsStatus(value: unknown): value is SettingsStatus { return typeof value === 'string' && STATUSES.indexOf(value) !== -1; }

// The page uses Pebble's local live bridge. Only this companion talks to the watch.
export function createSettings(options: SettingsOptions) {
  var pebble = options.Pebble, timers = options.timers, registry = options.localeRegistry;
  var session: string | null = null, network: Network | null = null, catalog = 0;
  var assembly: Assembly | null = null, state: State | null = null, edit: Edit | null = null;
  var request = 0, pending: SaveJob | null = null, reader: Reader | null = null;
  var openingTimer: Timer | null = null, opening = 0, closed = false;
  var live = typeof pebble.sendConfigMessage === "function";
  function send(message: WatchMessage, key: string) { return session && options.send(message, "settings:" + key); }
  function usable() { return state && state.catalog === catalog && network; }
  function view(token: string): SettingsView | null {
    if (!edit || token !== edit.token || edit.session !== session || !state || state.catalog !== catalog || !network) return null;
    edit.baseline = { revision: state.revision, catalog: state.catalog, slots: state.slots, network: network };
    return { editable: state.writable, favorites: state.slots.filter(function (f) { return f !== null; }), network: network };
  }
  function finishRead(status: SettingsReply['status']) {
    var job = reader; reader = null;
    if (!job) return;
    timers.clearTimeout(job.timer);
    job.respond({ status: status, view: status === "ready" ? view(job.token) : null });
  }
  function finishSave(status: SettingsReply['status']) {
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
      var file = (state ? registry.locales[state.locale] : undefined) || registry.locales[registry.fallback]!;
      var model: SettingsModel = { edit: token, language: file === "pt_PT.json" ? "pt" : "en", strings: options.phoneLocales[file] || options.phoneLocales["en.json"],
        view: usable() && fresh && !pending ? view(token) : null };
      pebble.openURL(settingsPage(model));
    }
    show();
  }
  function configMessage(event: ConfigEvent) {
    if (!event || typeof event.respond !== "function") return;
    var data = event.data;
    try {
      if (!object(data) || JSON.stringify(data).length > 5000 || data.v !== 1 || typeof data.edit !== "string") throw new Error("Invalid message");
      if (closed || !edit || data.edit !== edit.token || edit.session !== session) { event.respond({ status: "expired", view: null }); return; }
      if (pending || reader) { event.respond({ status: "busy", view: null }); return; }
      if (data.type === "settings-read") {
        reader = { token: data.edit, respond: event.respond, previous: state && state.snapshot, timer: null };
        reader.timer = timers.setTimeout(function () { finishRead("unavailable"); }, 5000);
        if (!send({ type: "settings-get" }, "get")) finishRead("unavailable");
      } else if (data.type === "settings-save") {
        if (!edit.baseline || !state || !state.writable) { event.respond({ status: state && !state.writable ? "storage" : "unavailable", view: null }); return; }
        var baseline = edit.baseline;
        var favorites = validateFavorites(data.favorites, baseline.network, baseline.slots);
        var message: Extract<WatchMessage, { type: 'settings-save' }> = { type: "settings-save", request: ++request, revision: baseline.revision, catalog: baseline.catalog, favorites: favorites };
        pending = { request: message.request, token: data.edit, respond: event.respond, timer: null };
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
    catalog: function (value: Network, id: number) { network = value; catalog = id; },
    reset: function (nextSession: string) {
      if (session === nextSession) return;
      session = nextSession; assembly = null; state = null; edit = null;
      finishRead("expired"); finishSave("unknown");
    },
    receive: function (message: unknown) {
      if (!object(message) || !uint(message.snapshot, 1) || !uint(message.revision, 1) || !uint(message.catalog, 0) || !uint(message.part, 0) || message.part > 3
        || !uint(message.request, 0) || !settingsStatus(message.status) || typeof message.writable !== "boolean"
        || typeof message.locale !== "string" || !/^[a-zA-Z0-9_-]{0,15}$/.test(message.locale) || !Array.isArray(message.favorites) || message.favorites.length !== 4
        || !message.favorites.every(function (f: unknown): f is FavoriteSlot { return f === null || route(f); })) return;
      if (assembly && message.snapshot < assembly.snapshot) return;
      if (!assembly || assembly.snapshot !== message.snapshot) assembly = { snapshot: message.snapshot, revision: message.revision,
        catalog: message.catalog, request: message.request, status: message.status, writable: message.writable, locale: message.locale, parts: [] };
      if ((["revision", "catalog", "request", "status", "writable", "locale"] as const).some(function (key) { return assembly![key] !== message[key]; })) return;
      if (assembly.parts[message.part] && JSON.stringify(assembly.parts[message.part]) !== JSON.stringify(message.favorites)) return;
      assembly.parts[message.part] = message.favorites;
      if (assembly.parts.filter(Boolean).length === 4) {
        // Four validated parts at indexes 0..3 prove there are no missing slots.
        var slots = ([] as FavoriteSlot[]).concat.apply([], assembly.parts as FavoriteSlot[][]), keys: string[] = [];
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
