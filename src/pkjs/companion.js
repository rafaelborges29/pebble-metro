import { parseNetwork, parseFavorites } from "../common/metro.js";
import { createTransport } from "./transport.js";
import { openFeed } from "./feed.js";
import { createSettings } from "./settings.js";

var CACHE_KEY = "metro.network.v1";
function bytes(s) { return encodeURIComponent(s).replace(/%[A-F\d]{2}/gi, "x").length; }
function cachedNetwork(value) {
  var data = JSON.parse(value);
  if (!data || !Array.isArray(data.stations) || !Array.isArray(data.lines)) throw new Error("Invalid cache");
  return parseNetwork(data.stations.map(function (s) { return { network: "pt-ml", id: s.id, name: s.name, lines: s.lines }; }),
    data.lines.map(function (l) { return { network: "pt-ml", id: l.id, name: l.name, color: typeof l.color === "string" && /^#[\da-f]{6}$/i.test(l.color) ? l.color.slice(1) : "", stations: l.stations }; }));
}

// Platform edges are supplied by the Android bridge.
export function createCompanion(options) {
  var pebble = options.Pebble, timers = options.timers, now = options.now;
  var transport = createTransport(pebble, timers, function () {
    // Queue eviction or exhausted retries lost a required station invalidation.
    feedGeneration = (feedGeneration + 1) >>> 0;
    send(connection, "invalidation");
  }), network = null, cached = false;
  var session = null, favorite = null, stations = [], feed = null;
  var metadataBusy = false, metadataRetry = null, closed = false;
  var metadataGeneration = 0, cancels = [];
  var connection = { type: "connection", status: "disconnected" };
  var feedGeneration = 0, announcedConnection = null, catalogId = 0;
  var settings = createSettings({ Pebble: pebble, timers: timers, localeRegistry: options.localeRegistry, phoneLocales: options.phoneLocales,
    send: function (message, key) { return transport.send(message, key); } });
  function send(message, key) {
    if (!session || closed) return;
    if (message.type === "connection") {
      if ((message.status === "disconnected" && announcedConnection !== "disconnected") ||
          (message.status === "connecting" && announcedConnection === "connected")) feedGeneration = (feedGeneration + 1) >>> 0;
      announcedConnection = message.status;
    }
    // Connection gaps and lost station invalidations must still clear cached routes.
    if (message.type === "connection" || message.type === "arrivals") message.generation = feedGeneration;
    if (!transport.send(message, key) && message.type === "arrivals")
      transport.send({ type: "arrivals", station: message.station, predictions: [], at: now(), generation: feedGeneration }, key);
  }
  function catalog() {
    if (!network) return;
    var ids = network.stations.map(function (s) { return s.id; });
    settings.catalog(network, catalogId);
    send({ type: "catalog", cached: cached, catalogId: catalogId,
      stations: network.stations.map(function (s) {
        var mask = network.lines.reduce(function (value, line, index) {
          return s.lines.indexOf(line.id) === -1 ? value : value | (1 << index);
        }, 0);
        return [s.id, s.name, mask];
      }),
      lines: network.lines.map(function (l) {
        return [l.id, l.name, l.color, l.stations.map(function (station) { return ids.indexOf(station); })];
      })
    });
  }
  function selection() {
    var valid = network && parseFavorites(JSON.stringify([favorite]), network)[0];
    stations = valid ? [valid.station] : [];
    transport.setStations(stations);
    if (feed) feed.setStations(stations);
  }
  function loadCache() {
    if (!options.storage) return;
    try {
      var raw = options.storage.getItem(CACHE_KEY);
      if (typeof raw !== "string" || raw.length > 16000) return;
      network = cachedNetwork(raw);
      catalogId++;
      cached = true;
    } catch (_) {}
  }
  function scheduleMetadataRetry() {
    if (metadataRetry) timers.clearTimeout(metadataRetry);
    metadataRetry = null;
    if (closed || !session || (network && !cached)) return;
    metadataRetry = timers.setTimeout(function () {
      metadataRetry = null;
      loadMetadata();
    }, 30000);
  }
  function loadMetadata() {
    if (metadataBusy || closed) return;
    if (metadataRetry) timers.clearTimeout(metadataRetry);
    metadataRetry = null;
    metadataBusy = true;
    var generation = ++metadataGeneration, stationData, lineData, count = 0, failed = false;
    function result(kind, error, data) {
      if (closed || generation !== metadataGeneration) return;
      if (error) { failed = true; console.log("UnderLX " + kind + ": " + error.message); }
      if (kind === "stations") stationData = data; else lineData = data;
      count++;
      if (count !== 2) return;
      metadataBusy = false;
      if (!failed) {
        try {
          var parsed = parseNetwork(stationData, lineData);
          network = parsed;
          catalogId = (catalogId + 1) >>> 0 || 1;
          cached = false;
          if (options.storage) { try { options.storage.setItem(CACHE_KEY, JSON.stringify(parsed)); } catch (_) {} }
        } catch (error) { failed = true; console.log("UnderLX metadata: " + error.message); }
      }
      if (failed && network) cached = true;
      if (failed && !network) send({ type: "connection", status: "disconnected", error: "Station metadata unavailable" });
      catalog();
      if (!failed) send(connection);
      selection();
      scheduleMetadataRetry();
    }
    ["stations", "lines"].forEach(function (path) { request(path, function (error, data) { result(path, error, data); }); });
  }
  function request(path, callback) {
    var cancel, complete = false;
    function done(error, data) {
      if (complete) return;
      complete = true;
      if (cancel) cancels = cancels.filter(function (c) { return c !== cancel; });
      if (!closed) callback(error, data);
    }
    try { cancel = options.request(path, done); } catch (error) { if (!complete) done(error); }
    if (!complete && typeof cancel === "function") cancels.push(cancel);
  }
  function startFeed() {
    if (feed || closed) return;
    feed = openFeed({ createClient: options.createClient, timers: timers, now: now, onEvent: function (event) {
      if (event.type === "connection") connection = event;
      send(event, event.type === "arrivals" ? "arrivals:" + event.station : undefined);
    } });
    feed.setStations(stations);
  }
  function receive(event) {
    if (closed) return;
    var command;
    try {
      var raw = event.payload && event.payload.DATA;
      if (typeof raw !== "string" || raw.length > 1000 || bytes(raw) > 1000) return;
      command = JSON.parse(raw);
      if (!command || command.v !== 1 || typeof command.session !== "string" || !/^[a-zA-Z0-9_-]{1,48}$/.test(command.session)) return;
    } catch (_) { return; }
    if (command.type === "hello") {
      if (typeof command.now !== "number" || !isFinite(command.now) || command.now < 0) return;
      session = command.session;
      settings.reset(session);
      favorite = null;
      transport.reset(session);
      // Must be the first logical response, even when metadata is synchronous.
      send({ type: "hello", echo: command.now, at: now() });
      selection();
      catalog();
      startFeed();
      feed.refresh();
      send(connection);
      loadMetadata();
      return;
    }
    if (!session || command.session !== session) return;
    if (command.type === "settings-state") {
      settings.receive(command);
    } else if (command.type === "ack") {
      if (typeof command.id === "number" && command.id > 0 && command.id % 1 === 0 && typeof command.part === "number" && command.part >= 0 && command.part < 32 && command.part % 1 === 0)
        transport.receipt(command.id, command.part);
    } else if (command.type === "watch") {
      favorite = command.favorite || null;
      selection();
    } else if (command.type === "refresh") {
      loadMetadata();
      if (feed) feed.refresh();
    } else if (command.type === "catalog") {
      catalog();
      loadMetadata();
    }
  }
  loadCache();
  pebble.addEventListener("appmessage", receive);
  return {
    wake: transport.wake,
    receive: receive,
    close: function () {
      closed = true;
      metadataGeneration++;
      if (metadataRetry) timers.clearTimeout(metadataRetry);
      cancels.forEach(function (cancel) { cancel(); });
      cancels = [];
      if (feed) feed.close();
      settings.close();
      transport.close();
      if (pebble.removeEventListener) pebble.removeEventListener("appmessage", receive);
    }
  };
}
