import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createCompanion } from '../src/pkjs/companion.js';
import { createTransport } from '../src/pkjs/transport.js';
import { createJsonRequester } from '../src/pkjs/rest.js';
import { openFeed, BROKER } from '../src/pkjs/feed.js';
import { parseNetwork } from '../src/common/metro.js';

const stationData = ['a', 'b', 'c'].map(id => ({ network: 'pt-ml', id, name: id, lines: ['red'] }));
const lineData = [{ network: 'pt-ml', id: 'red', name: 'Vermelha', color: 'ff0000', stations: ['a', 'b', 'c'] }];
const favorite = { station: 'b', line: 'red', direction: 'c' };
function clock() {
  let now = 1800000000000, sequence = 0;
  const jobs = new Map();
  return {
    now: () => now,
    setTimeout: (fn, delay) => { const id = ++sequence; jobs.set(id, { fn, at: now + delay }); return id; },
    clearTimeout: id => jobs.delete(id),
    tick(ms) {
      const end = now + ms;
      let count = 0;
      while (true) {
        const next = [...jobs].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > end) break;
        if (++count > 10000) throw new Error('Timer loop');
        now = next[1].at; jobs.delete(next[0]); next[1].fn();
      }
      now = end;
    },
    jobs,
  };
}
function wire() {
  const sent = [], delivered = [], listeners = {};
  let pending = null;
  const pebble = {
    addEventListener: (name, fn) => { listeners[name] = fn; },
    removeEventListener: name => { delete listeners[name]; },
    sendAppMessage(message, success, failure) {
      assert.equal(pending, null, 'only one AppMessage in flight');
      assert.deepEqual(Object.keys(message), ['DATA']);
      assert.ok(Buffer.byteLength(message.DATA) < 4096);
      const envelope = JSON.parse(message.DATA);
      assert.equal(envelope.v, 1);
      assert.ok(envelope.total <= 32);
      assert.ok(envelope.text.length <= 500);
      sent.push(envelope);
      pending = { envelope, success, failure };
    },
  };
  return {
    pebble, sent, delivered, listeners,
    ack(ok = true, application = true) {
      assert.ok(pending);
      const item = pending; pending = null;
      if (ok) {
        delivered.push(item.envelope); item.success();
        if (application) {
          if (listeners.appmessage) listeners.appmessage({ payload: { DATA: JSON.stringify({ v: 1, session: item.envelope.session, type: 'ack', id: item.envelope.id, part: item.envelope.part }) } });
          else if (this.receipt) this.receipt(item.envelope.id, item.envelope.part);
        }
      } else item.failure();
    },
    drain() { let count = 0; while (pending) { if (++count > 1000) throw new Error('Wire loop'); this.ack(); } },
    messages() {
      const batches = new Map();
      for (const part of delivered) {
        const key = `${part.session}/${part.id}`;
        if (!batches.has(key)) batches.set(key, { session: part.session, id: part.id, parts: [], total: part.total });
        batches.get(key).parts[part.part] = part.text;
      }
      return [...batches.values()].filter(b => b.parts.filter(v => v !== undefined).length === b.total).map(b => ({ session: b.session, id: b.id, ...JSON.parse(b.parts.join('')) }));
    },
  };
}
function broker() {
  const clients = [];
  function createClient(url) {
    assert.equal(url, BROKER);
    const client = {
      subscriptions: [], unsubscriptions: [], disconnects: 0,
      connect(options) { this.options = options; },
      subscribe(topic, options) { this.subscriptions.push(topic); this.subOptions = options; },
      unsubscribe(topic, options) { this.unsubscriptions.push(topic); this.unsubOptions = options; },
      disconnect() { this.disconnects++; },
      success() { this.options.onSuccess(); },
      failure() { this.options.onFailure(); },
      message(station, data) { this.onMessageArrived({ destinationName: `json/vehicleeta/pt-ml/${station}/all`, payloadString: typeof data === 'string' ? data : JSON.stringify(data) }); },
    };
    clients.push(client);
    return client;
  }
  return { clients, createClient };
}
function harness(cache) {
  const time = clock(), link = wire(), mqtt = broker(), requests = [], storage = new Map();
  if (cache !== undefined) storage.set('metro.network.v1', cache);
  const companion = createCompanion({ Pebble: link.pebble, timers: time, now: time.now, createClient: mqtt.createClient,
    storage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    request(path, callback) { const req = { path, callback, canceled: false }; requests.push(req); return () => { req.canceled = true; }; },
  });
  function command(type, extra = {}, session = 'one') { companion.receive({ payload: { DATA: JSON.stringify({ v: 1, session, type, ...extra }) } }); }
  function reply(path, data, error = null) {
    const req = requests.find(r => r.path === path && !r.done);
    assert.ok(req, `pending request ${path}`);
    req.done = true; req.callback(error, data);
  }
  function metadata() { reply('stations', stationData); reply('lines', lineData); }
  function hello(session = 'one') { command('hello', { now: time.now() - 500 }, session); }
  return { ...link, ...mqtt, time, requests, companion, command, reply, metadata, hello, storage };
}
function eta(now, extra = {}) { return { direction: 'c', order: 1, type: 'e', units: 's', value: 180, made: now / 1000 - 10, validFor: 30, ...extra }; }

test('handshake precedes catalogue/data; production parsing and exact receipt timestamps reach the watch', () => {
  const h = harness();
  assert.equal(h.requests.length, 0, 'no networking before watch hello');
  h.hello();
  h.metadata();
  h.reply('disturbances?filter=ongoing', []);
  h.command('watch', { favorite, armed: { ...favorite, station: 'a' } });
  const client = h.clients[0];
  assert.equal(client.options.userName, 'ws');
  assert.equal(client.options.password, undefined);
  assert.equal(client.options.reconnect, false);
  client.success();
  assert.deepEqual(client.subscriptions, ['json/vehicleeta/pt-ml/b/all', 'json/vehicleeta/pt-ml/a/all']);
  client.message('b', [eta(h.time.now())]);
  h.drain();
  const messages = h.messages();
  assert.equal(messages[0].type, 'hello');
  assert.equal(messages[0].at, h.time.now());
  assert.equal(messages[0].echo, h.time.now() - 500);
  const catalog = messages.find(m => m.type === 'catalog');
  assert.equal(catalog.cached, false);
  assert.deepEqual(catalog.network, parseNetwork(stationData, lineData));
  const arrivals = messages.find(m => m.type === 'arrivals');
  assert.equal(arrivals.at, h.time.now());
  assert.equal(arrivals.predictions[0].value, 180, 'do not subtract made age');
  assert.equal(arrivals.predictions[0].expires, h.time.now() + 30000);
  assert.equal(messages.find(m => m.type === 'service').ok, true);
  assert.ok(h.storage.has('metro.network.v1'));
  h.companion.close();
});

test('watch/armed subscriptions are bounded, differential and old-session commands ignored', () => {
  const h = harness(); h.hello(); h.metadata();
  h.command('watch', { favorite, armed: { ...favorite, station: 'a' } });
  h.clients[0].success();
  h.command('watch', { favorite: { ...favorite, station: 'c', direction: 'a' }, armed: { ...favorite, station: 'a' } });
  assert.deepEqual(h.clients[0].unsubscriptions, ['json/vehicleeta/pt-ml/b/all']);
  assert.equal(h.clients[0].subscriptions.at(-1), 'json/vehicleeta/pt-ml/c/all');
  h.command('watch', { favorite: null, armed: null }, 'old');
  assert.equal(h.clients[0].unsubscriptions.length, 1);
  h.command('watch', { favorite: { ...favorite, direction: 'b' }, armed: null });
  assert.equal(h.clients[0].unsubscriptions.length, 3, 'invalid favorites cannot subscribe');
  h.companion.close();
});

test('empty, unavailable, stale and malformed MQTT updates explicitly clear previous predictions', () => {
  const h = harness(); h.hello(); h.metadata(); h.command('watch', { favorite }); h.clients[0].success(); h.drain();
  const client = h.clients[0];
  for (const payload of [[], null, 'not json', [eta(h.time.now(), { made: h.time.now() / 1000 - 120 })], [eta(h.time.now(), { type: 'unavailable' })]]) {
    client.message('b', [eta(h.time.now())]); h.drain();
    client.message('b', payload); h.drain();
    assert.deepEqual(h.messages().filter(m => m.type === 'arrivals').at(-1).predictions, []);
  }
  const count = h.sent.length;
  client.message('not-subscribed', []);
  assert.equal(h.sent.length, count);
  h.companion.close();
});

test('an unrepresentable arrivals snapshot explicitly invalidates previous estimates', () => {
  const h = harness(); h.hello(); h.metadata(); h.command('watch', { favorite }); h.clients[0].success(); h.drain();
  h.clients[0].message('b', Array.from({ length: 64 }, (_, i) => eta(h.time.now(), { direction: 'pt-ml-' + 'x'.repeat(35) + i })));
  h.drain();
  const last = h.messages().filter(m => m.type === 'arrivals').at(-1);
  assert.deepEqual(last.predictions, []); assert.ok(last.generation > 0);
  h.companion.close();
});
test('busy companion preserves coalesced invalid/empty gaps in recovered arrivals, including retries', () => {
  for (const payload of [[], null, 'not json', [eta(1800000000000, { type: 'unavailable' })], [eta(1800000000000, { made: 1799999880 })]]) {
    const h = harness(); h.hello(); h.metadata(); h.command('watch', { favorite }); h.clients[0].success(); h.drain();
    const client = h.clients[0];
    client.message('b', [eta(h.time.now(), { value: 130 })]); h.drain();
    const before = h.messages().filter(m => m.type === 'arrivals').at(-1);
    assert.ok(Number.isInteger(before.generation) && before.generation >= 0);
    h.reply('disturbances?filter=ongoing', []); // Hold Bluetooth with a real companion service send.
    client.message('b', payload);
    client.message('b', [eta(h.time.now(), { value: 119 })]);
    h.ack(); // Recovery is now in flight; its retry must retain the generation.
    const recovery = h.sent.at(-1);
    assert.equal(JSON.parse(recovery.text).type, 'arrivals');
    h.ack(false); h.time.tick(500);
    assert.deepEqual(h.sent.at(-1), recovery);
    h.drain();
    const arrivals = h.messages().filter(m => m.type === 'arrivals');
    assert.deepEqual(arrivals.map(m => m.predictions[0].value), [130, 119], 'unavailable was coalesced away');
    assert.equal(arrivals[1].generation, before.generation + 1, 'the hidden gap still resets crossing history');
    assert.equal(arrivals[1].predictions[0].received, before.at, 'retry does not freshen data');
    assert.equal(arrivals[1].predictions[0].expires, before.at + 30000);
    h.companion.close();
  }
});

test('busy companion preserves disconnected/reconnected gaps even when connection and empty records coalesce', () => {
  const h = harness(); h.hello(); h.metadata(); h.command('watch', { favorite }); h.clients[0].success(); h.drain();
  h.clients[0].message('b', [eta(h.time.now(), { value: 130 })]); h.drain();
  const before = h.messages().filter(m => m.type === 'arrivals').at(-1);
  h.reply('disturbances?filter=ongoing', []);
  h.clients[0].onConnectionLost({});
  h.time.tick(1000);
  h.clients[1].success();
  h.clients[1].message('b', [eta(h.time.now(), { value: 119 })]);
  h.drain();
  const arrivals = h.messages().filter(m => m.type === 'arrivals');
  assert.deepEqual(arrivals.map(m => m.predictions[0].value), [130, 119]);
  assert.equal(arrivals[1].generation, before.generation + 3, 'disconnected, empty and connecting each preserve a gap');
  assert.deepEqual(h.messages().filter(m => m.type === 'connection').map(m => m.status), ['connected', 'connected']);
  h.companion.close();
});

test('loss of a direction/order1 survives coalescing even with other valid directions/orders', () => {
  const h = harness(); h.hello(); h.metadata(); h.command('watch', { favorite }); h.clients[0].success(); h.drain();
  const client = h.clients[0];
  client.message('b', [eta(h.time.now(), { value: 130 }), eta(h.time.now(), { direction: 'a' })]); h.drain();
  const before = h.messages().filter(m => m.type === 'arrivals').at(-1);
  h.reply('disturbances?filter=ongoing', []);
  client.message('b', [eta(h.time.now(), { direction: 'a' }), eta(h.time.now(), { order: 2 })]);
  client.message('b', [eta(h.time.now(), { value: 119 }), eta(h.time.now(), { direction: 'a' })]);
  h.drain();
  const arrivals = h.messages().filter(m => m.type === 'arrivals');
  assert.equal(arrivals.length, 2);
  assert.equal(arrivals[1].generation, before.generation + 1);
  h.companion.close();
});

test('generation uses normalized previous expiry at incoming receipt, including the exact boundary', () => {
  for (const elapsed of [999, 1000, 1001]) {
    const h = harness(); h.hello(); h.metadata(); h.command('watch', { favorite }); h.clients[0].success(); h.drain();
    const received = h.time.now();
    h.clients[0].message('b', [eta(received, { value: 130, made: received / 1000 - 119, validFor: 120 })]); h.drain();
    const before = h.messages().filter(m => m.type === 'arrivals').at(-1);
    assert.equal(before.predictions[0].expires, received + 1000, 'made age, not just validFor, limits expiry');
    h.reply('disturbances?filter=ongoing', []);
    h.time.tick(elapsed);
    h.clients[0].message('b', [eta(h.time.now(), { value: 119 })]);
    h.drain();
    const after = h.messages().filter(m => m.type === 'arrivals').at(-1);
    assert.equal(after.generation, before.generation + (elapsed >= 1000 ? 1 : 0));
    assert.equal(after.at, received + elapsed);
    h.companion.close();
  }
});

test('visible and armed stations share generation; fresh continuity is stable and a new session resets it', () => {
  const h = harness(); h.hello(); h.metadata(); h.command('watch', { favorite, armed: { ...favorite, station: 'a' } }); h.clients[0].success(); h.drain();
  const client = h.clients[0];
  client.message('b', [eta(h.time.now(), { value: 130 })]); h.drain();
  const before = h.messages().filter(m => m.type === 'arrivals').at(-1);
  client.message('b', [eta(h.time.now(), { value: 129 })]); h.drain();
  assert.equal(h.messages().filter(m => m.type === 'arrivals').at(-1).generation, before.generation);
  h.reply('disturbances?filter=ongoing', []);
  client.message('a', []);
  client.message('a', [eta(h.time.now())]);
  client.message('b', [eta(h.time.now(), { value: 119 })]);
  h.drain();
  const after = h.messages().filter(m => m.type === 'arrivals').slice(-2);
  assert.deepEqual(after.map(m => [m.station, m.generation]), [['a', before.generation + 1], ['b', before.generation + 1]]);
  h.hello('two'); h.command('watch', { favorite }, 'two');
  client.message('b', [eta(h.time.now())]); h.drain();
  const restarted = h.messages().filter(m => m.session === 'two' && m.type === 'arrivals');
  assert.equal(restarted.length, 1);
  assert.equal(restarted[0].generation, 0);
  h.companion.close();
});

test('MQTT loss without subscriptions still advances the session generation', () => {
  const h = harness(); h.hello(); h.metadata(); h.command('watch', { favorite }); h.clients[0].success(); h.drain();
  h.clients[0].message('b', [eta(h.time.now())]); h.drain();
  const before = h.messages().filter(m => m.type === 'arrivals').at(-1);
  h.command('watch', {});
  h.clients[0].onConnectionLost({}); h.time.tick(1000); h.clients[1].success();
  h.command('watch', { favorite });
  h.clients[1].message('b', [eta(h.time.now())]); h.drain();
  assert.equal(h.messages().filter(m => m.type === 'arrivals').at(-1).generation, before.generation + 2);
  h.companion.close();
});

test('transport retries immutable chunks, coalesces obsolete batches and bounds the queue', () => {
  const time = clock(), link = wire(), transport = createTransport(link.pebble, time);
  link.receipt = transport.receipt;
  transport.reset('session');
  transport.send({ type: 'hello', echo: 1, at: time.now() });
  const received = time.now();
  for (let i = 0; i < 100; i++) transport.send({ type: 'arrivals', station: 'b', predictions: [{ received, expires: received + 30000, value: i }] }, 'arrivals:b');
  transport.send({ type: 'catalog', network: { long: 'Português😀'.repeat(100) } });
  assert.equal(transport.send({ type: 'huge', text: 'x'.repeat(16000) }), false);
  link.ack(false); time.tick(500);
  assert.deepEqual(link.sent[0], link.sent[1], 'retry uses the same ID, time and payload');
  link.drain();
  const messages = link.messages();
  assert.equal(messages[0].type, 'hello');
  assert.equal(messages.filter(m => m.type === 'arrivals').length, 1);
  assert.equal(messages.find(m => m.type === 'arrivals').predictions[0].value, 99);
  assert.equal(messages.find(m => m.type === 'arrivals').predictions[0].received, received);
  assert.equal(messages.find(m => m.type === 'catalog').network.long, 'Português😀'.repeat(100));
  assert.ok(link.sent.length < 30, '100 updates do not produce 100 Bluetooth sends');
  transport.close();
});

test('session replacement discards backlog without overlapping an old in-flight send', () => {
  const time = clock(), link = wire(), transport = createTransport(link.pebble, time);
  link.receipt = transport.receipt;
  transport.reset('old'); transport.send({ type: 'catalog', data: 'x'.repeat(2000) });
  transport.send({ type: 'service', ok: true });
  transport.reset('new'); transport.send({ type: 'hello', echo: 10, at: 20 });
  transport.send({ type: 'arrivals', station: 'b', predictions: [] }, 'arrivals:b');
  assert.equal(link.sent.length, 1);
  link.ack(false); link.drain();
  assert.deepEqual(link.messages().map(m => [m.session, m.type]), [['new', 'hello'], ['new', 'arrivals']]);
  assert.ok(link.sent[1].id > link.sent[0].id);
  time.tick(10000); assert.equal(link.sent.length, 3, 'no stale retry');
  transport.close();
});

test('failed batches are abandoned after three tries and removed stations lose queued arrivals', () => {
  const time = clock(), link = wire(), transport = createTransport(link.pebble, time);
  link.receipt = transport.receipt;
  transport.reset('one');
  transport.send({ type: 'service', ok: false });
  transport.send({ type: 'arrivals', station: 'a', predictions: [] }, 'arrivals:a');
  transport.send({ type: 'arrivals', station: 'b', predictions: [] }, 'arrivals:b');
  transport.setStations(['b']);
  link.ack(false); time.tick(500); link.ack(false); time.tick(1000); link.ack(false); time.tick(2000); link.drain();
  assert.deepEqual(link.messages().map(m => m.type), ['arrivals']);
  assert.equal(link.messages()[0].station, 'b');
  transport.close();
});

test('new hello resets target state and old message retries; metadata failures are explicitly cached', () => {
  const h = harness(JSON.stringify(parseNetwork(stationData, lineData)));
  h.hello(); h.metadata(); h.command('watch', { favorite }); h.clients[0].success(); h.drain();
  h.clients[0].message('b', [eta(h.time.now())]);
  h.hello('two');
  h.reply('stations', null, new Error('offline')); h.reply('lines', null, new Error('offline'));
  h.drain();
  const current = h.messages().filter(m => m.session === 'two');
  assert.equal(current[0].type, 'hello');
  assert.equal(current.find(m => m.type === 'catalog').cached, true);
  assert.equal(current.some(m => m.type === 'arrivals'), false);
  assert.ok(h.clients[0].unsubscriptions.includes('json/vehicleeta/pt-ml/b/all'));
  h.companion.close();
  const invalidCache = parseNetwork(stationData, lineData);
  invalidCache.lines[0].color = 'xff0000';
  const badColor = harness(JSON.stringify(invalidCache)); badColor.hello();
  badColor.reply('stations', null, new Error('offline')); badColor.reply('lines', null, new Error('offline')); badColor.drain();
  assert.equal(badColor.messages().some(m => m.type === 'catalog'), false);
  badColor.companion.close();
  const corrupt = harness('{bad'); corrupt.hello();
  corrupt.reply('stations', null, new Error('offline')); corrupt.reply('lines', null, new Error('offline')); corrupt.drain();
  assert.equal(corrupt.messages().some(m => m.type === 'catalog'), false);
  assert.ok(corrupt.messages().some(m => m.error === 'Station metadata unavailable'));
  corrupt.companion.close();
});

test('service failures preserve old notices but never claim normal/current; poll every 30 seconds and close cancels', () => {
  const h = harness(); h.hello(); h.metadata();
  const notice = { id: 'incident', line: 'red', ended: false, description: 'Interrupção', startTime: '2026-10-19T08:00:00Z' };
  h.reply('disturbances?filter=ongoing', [notice]); h.drain();
  const good = h.messages().filter(m => m.type === 'service').at(-1);
  assert.equal(good.ok, true);
  h.time.tick(30000);
  h.reply('disturbances?filter=ongoing', null, new Error('timeout')); h.drain();
  const failed = h.messages().filter(m => m.type === 'service').at(-1);
  assert.equal(failed.ok, false);
  assert.equal(failed.updated, good.updated);
  assert.deepEqual(failed.disturbances, good.disturbances);
  h.time.tick(30000);
  const pending = h.requests.at(-1);
  h.companion.close();
  assert.equal(pending.canceled, true);
  const count = h.requests.length;
  h.time.tick(60000); assert.equal(h.requests.length, count);
});

test('MQTT reconnect backs off to 30s, refresh cannot duplicate connections and reconnect resubscribes', () => {
  const time = clock(), mqtt = broker(), events = [];
  const feed = openFeed({ timers: time, now: time.now, createClient: mqtt.createClient, onEvent: e => events.push(e) });
  feed.setStations(['b']);
  feed.refresh(); feed.refresh(); assert.equal(mqtt.clients.length, 1);
  for (const delay of [1000, 2000, 4000, 8000, 16000, 30000, 30000]) {
    mqtt.clients.at(-1).failure();
    time.tick(delay - 1); const count = mqtt.clients.length;
    time.tick(1); assert.equal(mqtt.clients.length, count + 1);
  }
  const client = mqtt.clients.at(-1); client.success();
  assert.deepEqual(client.subscriptions, ['json/vehicleeta/pt-ml/b/all']);
  client.onConnectionLost({});
  assert.equal(events.at(-1).type, 'arrivals');
  assert.deepEqual(events.at(-1).predictions, []);
  feed.refresh(); assert.equal(mqtt.clients.length, 9);
  feed.refresh(); assert.equal(mqtt.clients.length, 9);
  feed.close(); time.tick(60000); assert.equal(mqtt.clients.length, 9);
});

test('command input requires version, matching session and a bounded single DATA string', () => {
  const h = harness();
  for (const DATA of ['bad', '{}', 'null', 'x'.repeat(1001), JSON.stringify({ v: 1, session: 'bad/session', type: 'hello', now: 1 })]) h.companion.receive({ payload: { DATA } });
  h.command('watch', { favorite });
  assert.equal(h.requests.length, 0);
  h.hello(); h.metadata();
  h.command('refresh'); h.command('refresh');
  assert.equal(h.clients.length, 1);
  assert.equal(h.requests.filter(r => r.path === 'stations' && !r.done).length, 1);
  h.companion.close();
});

function xhrHarness() {
  const time = clock(), requests = [];
  class XHR {
    constructor() { this.headers = {}; requests.push(this); this.status = 200; this.responseText = '[]'; }
    open(method, url, async) { this.method = method; this.url = url; this.async = async; }
    send() {}
    abort() { this.aborted = true; if (this.onerror) this.onerror(); }
    getResponseHeader(name) { return this.headers[name] ?? null; }
  }
  const request = createJsonRequester({ XMLHttpRequest: XHR, timers: time, now: time.now });
  return { time, requests, request };
}

test('REST requester bounds URL, response bytes, upstream age and timeout; callback runs once', () => {
  const h = xhrHarness(), results = [];
  h.request('stations', (error, data) => results.push({ error, data }));
  const xhr = h.requests[0];
  assert.equal(xhr.url, 'https://api.underlx.com/v1/stations');
  assert.equal(xhr.method, 'GET');
  assert.equal(xhr.timeout, 15000);
  xhr.onload(); h.time.tick(20000); assert.equal(results.length, 1); assert.deepEqual(results[0].data, []);
  for (const setup of [
    x => { x.status = 500; },
    x => { x.responseText = 'bad'; },
    x => { x.responseText = 'x'.repeat(1024 * 1024 + 1); },
    x => { x.headers.Age = '120'; },
    x => { x.headers.Age = '-1'; },
    x => { x.headers.Date = new Date(h.time.now() - 120000).toUTCString(); },
    x => { x.headers.Date = new Date(h.time.now() + 31000).toUTCString(); },
  ]) {
    h.request('disturbances?filter=ongoing', (error, data) => results.push({ error, data }));
    const x = h.requests.at(-1); setup(x); x.onload(); assert.ok(results.at(-1).error);
  }
  const count = results.length;
  h.request('lines', (error, data) => results.push({ error, data })); h.time.tick(15000);
  assert.equal(results.length, count + 1); assert.match(results.at(-1).error.message, /timed out/); assert.equal(h.requests.at(-1).aborted, true);
  h.request('stations', (error, data) => results.push({ error, data }));
  const big = h.requests.at(-1); big.headers['Content-Length'] = String(1024 * 1024 + 1); big.readyState = 2; big.onreadystatechange();
  assert.equal(big.aborted, true); assert.match(results.at(-1).error.message, /too large/);
  const beforeCancel = results.length;
  const cancel = h.request('stations', (error, data) => results.push({ error, data })); cancel(); h.time.tick(15000);
  assert.equal(results.length, beforeCancel);
});

test('SDK-local ESM adapter preserves shared exports without runtime platform APIs', () => {
  const loader = createRequire(import.meta.url)('../src/pkjs/esm-loader.cjs');
  const source = readFileSync(new URL('../src/common/metro.js', import.meta.url), 'utf8');
  let cached = false;
  const output = loader.call({ cacheable() { cached = true; } }, source);
  const context = { exports: {}, require(request) {
    assert.ok(request.endsWith('!./display.js'));
    const dependency = { exports: {} };
    const helperSource = readFileSync(new URL('../src/common/display.js', import.meta.url), 'utf8');
    runInNewContext(loader.call({ cacheable() {} }, helperSource), dependency);
    return dependency.exports;
  } };
  runInNewContext(output, context);
  assert.equal(cached, true);
  assert.deepEqual(JSON.parse(JSON.stringify(context.exports.parseNetwork(stationData, lineData))), parseNetwork(stationData, lineData));
  assert.equal(context.exports.parsePredictions([eta(1800000000000)], 1800000000000)[0].expires, 1800000030000);
  const imports = loader.call({ cacheable() {} }, 'import { API, directions } from "../common/metro.js";\nexport var result = API;');
  const imported = { exports: {}, require: () => ({ API: 'checked', directions() {} }) };
  runInNewContext(imports, imported);
  assert.equal(imported.exports.result, 'checked');
  assert.throws(() => loader.call({ cacheable() {} }, 'export default 42;'), /Unsupported/);
});
