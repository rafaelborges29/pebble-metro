import { parseNetwork, parseFavorites, parseDisturbances } from "../common/metro.js";
import { createTransport } from "./transport.js";
import { openFeed } from "./feed.js";

var CACHE_KEY = "metro.network.v1";
function bytes(s) { return encodeURIComponent(s).replace(/%[A-F\d]{2}/gi, "x").length; }
function cachedNetwork(value) {
  var data = JSON.parse(value);
  if (!data || !Array.isArray(data.stations) || !Array.isArray(data.lines)) throw new Error("Invalid cache");
  return parseNetwork(data.stations.map(function (s) { return { network: "pt-ml", id: s.id, name: s.name, lines: s.lines }; }),
    data.lines.map(function (l) { return { network: "pt-ml", id: l.id, name: l.name, color: typeof l.color === "string" && /^#[\da-f]{6}$/i.test(l.color) ? l.color.slice(1) : "", stations: l.stations }; }));
}

// Inject platform edges so tests execute the production parser/queue/feed path.
export function createCompanion(options) {
  var pebble = options.Pebble, timers = options.timers, now = options.now;
  var transport = createTransport(pebble, timers), network = null, cached = false;
  var session = null, desired = { favorite: null, armed: null }, stations = [], feed = null;
  var metadataBusy = false, serviceBusy = false, poll = null, closed = false;
  var metadataGeneration = 0, serviceGeneration = 0, cancels = [];
  var arrivalGeneration = 0, snapshots = [];
  var service = { type: "service", ok: false, updated: 0, disturbances: [] };
  var connection = { type: "connection", status: "disconnected" };
  function send(message, key) {
    if (!session || closed) return;
    if (!transport.send(message, key) && message.type === 'arrivals') {
      arrivalGeneration++;
      transport.send({ type: 'arrivals', station: message.station, predictions: [], at: now(), generation: arrivalGeneration }, key);
    }
  }
  function catalog() { if (network) send({ type: "catalog", network: network, cached: cached }); }
  function selection() {
    var next = [];
    if (network) [desired.favorite, desired.armed].forEach(function (f) {
      var valid = parseFavorites(JSON.stringify([f]), network)[0];
      if (valid && next.indexOf(valid.station) === -1) next.push(valid.station);
    });
    stations = next;
    snapshots = snapshots.filter(function (snapshot) { return stations.indexOf(snapshot.station) !== -1; });
    transport.setStations(stations);
    if (feed) feed.setStations(stations);
  }
  function loadCache() {
    if (!options.storage) return;
    try {
      var raw = options.storage.getItem(CACHE_KEY);
      if (typeof raw !== "string" || raw.length > 16000) return;
      network = cachedNetwork(raw);
      cached = true;
    } catch (_) {}
  }
  function loadMetadata() {
    if (metadataBusy || closed) return;
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
          cached = false;
          if (options.storage) { try { options.storage.setItem(CACHE_KEY, JSON.stringify(parsed)); } catch (_) {} }
        } catch (error) { failed = true; console.log("UnderLX metadata: " + error.message); }
      }
      if (failed && network) cached = true;
      if (failed && !network) send({ type: "connection", status: "disconnected", error: "Station metadata unavailable" });
      catalog();
      selection();
      refreshService();
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
  function refreshService() {
    if (serviceBusy || !network || closed) return;
    serviceBusy = true;
    var generation = ++serviceGeneration;
    request("disturbances?filter=ongoing", function (error, data) {
      if (generation !== serviceGeneration) return;
      serviceBusy = false;
      if (!error) {
        try { service = { type: "service", ok: true, updated: now(), disturbances: parseDisturbances(data, network) }; }
        catch (parseError) { error = parseError; }
      }
      if (error) service = { type: "service", ok: false, updated: service.updated, disturbances: service.disturbances };
      send(service);
    });
  }
  function startFeed() {
    if (feed || closed) return;
    feed = openFeed({ createClient: options.createClient, timers: timers, now: now, onEvent: function (event) {
      if (event.type === "connection") {
        if (event.status !== "connected" && event.status !== connection.status) arrivalGeneration++;
        connection = event;
      } else if (event.type === "arrivals") {
        var previous = snapshots.filter(function (snapshot) { return snapshot.station === event.station; })[0];
        var gap = !event.predictions.length || (previous && previous.predictions.some(function (prediction) {
          return prediction.expires <= event.at || (prediction.order === 1 && !event.predictions.some(function (next) {
            return next.direction === prediction.direction && next.order === 1;
          }));
        }));
        if (gap) arrivalGeneration++;
        // Stamp before serialization: coalescing/retries must not hide a gap.
        event.generation = arrivalGeneration;
        snapshots = snapshots.filter(function (snapshot) { return snapshot.station !== event.station; });
        snapshots.push({ station: event.station, predictions: event.predictions });
      }
      send(event, event.type === "arrivals" ? "arrivals:" + event.station : undefined);
    } });
    feed.setStations(stations);
  }
  function schedulePoll() {
    if (poll || closed) return;
    poll = timers.setTimeout(function () {
      poll = null;
      if (!network || cached) loadMetadata();
      // A hung request is bounded by the requester's 15-second timeout.
      refreshService();
      schedulePoll();
    }, 30000);
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
      arrivalGeneration = 0;
      snapshots = [];
      desired = { favorite: null, armed: null };
      transport.reset(session);
      // Must be the first logical response, even when metadata is synchronous.
      send({ type: "hello", echo: command.now, at: now() });
      selection();
      catalog();
      send({ type: "service", ok: false, updated: service.updated, disturbances: service.disturbances });
      startFeed();
      send(connection);
      loadMetadata();
      schedulePoll();
      return;
    }
    if (!session || command.session !== session) return;
    if (command.type === "ack") {
      if (typeof command.id === "number" && command.id > 0 && command.id % 1 === 0 && typeof command.part === "number" && command.part >= 0 && command.part < 32 && command.part % 1 === 0)
        transport.receipt(command.id, command.part);
    } else if (command.type === "watch") {
      desired = { favorite: command.favorite || null, armed: command.armed || null };
      selection();
    } else if (command.type === "refresh") {
      loadMetadata();
      refreshService();
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
      serviceGeneration++;
      if (poll) timers.clearTimeout(poll);
      cancels.forEach(function (cancel) { cancel(); });
      cancels = [];
      if (feed) feed.close();
      transport.close();
      if (pebble.removeEventListener) pebble.removeEventListener("appmessage", receive);
    }
  };
}
