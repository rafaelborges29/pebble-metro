import { parsePredictions } from "../common/metro.js";

export var BROKER = "wss://perturbacoes.pt/websocket/";
function topic(station) { return "json/vehicleeta/pt-ml/" + station + "/all"; }

// Paho owns MQTT framing/keepalive only; this layer owns bounded reconnects.
export function openFeed(options) {
  var timers = options.timers, client = null, connected = false, closed = false;
  var stations = [], retry = null, delay = 1000;
  function emit(event) { if (!closed) options.onEvent(event); }
  function discardClient() {
    var old = client;
    client = null;
    connected = false;
    if (!old) return;
    old.onConnectionLost = function () {};
    old.onMessageArrived = function () {};
    try { old.disconnect(); } catch (_) {}
  }
  function lost(error) {
    if (closed || retry) return;
    discardClient();
    emit({ type: "connection", status: "disconnected", error: error || "Feed unavailable" });
    stations.forEach(function (station) { emit({ type: "arrivals", station: station, predictions: [], at: options.now() }); });
    retry = timers.setTimeout(function () { retry = null; connect(); }, delay);
    delay = Math.min(30000, delay * 2);
  }
  function subscribe(ids) {
    ids.forEach(function (station) {
      var current = client;
      try {
        current.subscribe(topic(station), { qos: 0, timeout: 10,
          onFailure: function () { if (client === current) lost("Subscription failed"); } });
      } catch (_) { lost("Subscription failed"); }
    });
  }
  function connect() {
    if (closed || client) return;
    emit({ type: "connection", status: "connecting" });
    var current;
    try {
      current = options.createClient(BROKER);
      client = current;
      current.onConnectionLost = function () { if (client === current) lost("Feed disconnected"); };
      current.onMessageArrived = function (message) {
        if (client !== current || !connected) return;
        var station = stations.filter(function (s) { return message.destinationName === topic(s); })[0];
        if (!station) return;
        var received = options.now(), predictions = [];
        try {
          var payload = message.payloadString;
          if (payload.length > 65536) throw new Error("Arrival message too large");
          predictions = parsePredictions(JSON.parse(payload), received);
        } catch (_) {
          // Unavailable, malformed and empty updates invalidate previous ETAs.
        }
        emit({ type: "arrivals", station: station, predictions: predictions, at: received });
      };
      current.connect({ userName: "ws", useSSL: true, mqttVersion: 4, cleanSession: true,
        reconnect: false, timeout: 15, keepAliveInterval: 30,
        onSuccess: function () {
          if (client !== current || closed) return;
          connected = true;
          delay = 1000;
          subscribe(stations);
          if (client === current) emit({ type: "connection", status: "connected" });
        },
        onFailure: function () { if (client === current) lost("MQTT connection failed"); }
      });
    } catch (_) { lost("MQTT unavailable"); }
  }
  connect();
  return {
    setStations: function (ids) {
      var next = ids.filter(function (id, i) { return ids.indexOf(id) === i; }).slice(0, 2);
      var previous = stations;
      stations = next;
      if (!connected) return;
      previous.forEach(function (s) {
        if (next.indexOf(s) !== -1 || !client) return;
        var current = client;
        try { current.unsubscribe(topic(s), { timeout: 10, onFailure: function () { if (client === current) lost("Unsubscribe failed"); } }); }
        catch (_) { if (client === current) lost("Unsubscribe failed"); }
      });
      if (connected) subscribe(next.filter(function (s) { return previous.indexOf(s) === -1; }));
    },
    refresh: function () {
      if (closed || client) return; // Never duplicate a connected/connecting client.
      if (retry) timers.clearTimeout(retry);
      retry = null;
      connect();
    },
    close: function () {
      closed = true;
      if (retry) timers.clearTimeout(retry);
      retry = null;
      discardClient();
    }
  };
}
