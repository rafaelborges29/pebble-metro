import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { directions, favoriteKey, parseFavorites, arrivalLabel } from '../src/common/display.js';
import { WatchModel, createReceiver, validSavedFavorite, paginate, MAX_FAVORITES } from '../src/common/watch-model.js';

const initialTime = 1792390000000;
const favorite = { station: 'pt-ml-sa', line: 'pt-ml-vermelha', direction: 'pt-ml-ap' };
const network = { stations: [
  { id: 'pt-ml-sa', name: 'Saldanha', lines: ['pt-ml-vermelha'] },
  { id: 'pt-ml-ap', name: 'Aeroporto', lines: ['pt-ml-vermelha'] },
], lines: [{ id: 'pt-ml-vermelha', name: 'Vermelha', color: '#ff0000', stations: ['pt-ml-sa', 'pt-ml-ap'] }] };

function watchHarness(saved = { favorites: [favorite] }, bootstrap = true) {
  let now = initialTime, message, buttons, sequence = 0, drawn = [], rectangles = [], frames = 0;
  const events = {}, commands = [], pulses = [], repeats = [], store = new Map([['preferences', JSON.stringify(saved)]]);
  class Poco {
    constructor() {
      this.width = 200; this.height = 228;
      this.Font = class {
        constructor(name, size) {
          if (size === 30) assert.equal(name, 'Bitham-Black');
          if (size === 42) assert.equal(name, 'Bitham-Bold');
          this.height = size;
        }
      };
    }
    begin() { drawn = []; rectangles = []; frames++; }
    end() {}
    makeColor(...rgb) { return rgb; }
    fillRectangle(color, x, y, width, height) { rectangles.push({ color, x, y, width, height }); }
    getTextWidth(text, font) { return text.length * font.height * 0.4; }
    drawText(text) { drawn.push(text); }
  }
  class Message {
    constructor(options) { this.options = options; message = this; }
    read() { return this.incoming; }
    write(map) {
      commands.push(JSON.parse(map.get('DATA')));
      this.options.onSuspend();
      this.options.onWritable();
    }
  }
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const context = createContext({
    console: { log() {} }, Poco, screen: { width: 200, height: 228 }, Message,
    Button: class { constructor(options) { buttons = options; } },
    Timer: { set() { return 1; }, clear() {}, repeat(fn) { repeats.push(fn); } },
    watch: { connected: { app: true, pebblekit: true }, addEventListener(name, fn) { (events[name] ||= []).push(fn); } },
    Natives: { metro_exit() {}, metro_pulse(service) { pulses.push(service); } },
    localStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) },
    Date: ClockDate, WatchModel, createReceiver, validSavedFavorite, paginate, MAX_FAVORITES,
    directions, favoriteKey, parseFavorites, arrivalLabel,
  });
  const source = readFileSync(new URL('../src/embeddedjs/main.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  runInContext(source, context);
  function emit(data) {
    const session = commands.filter(c => c.type === 'hello').at(-1).session;
    const text = JSON.stringify(data), id = ++sequence, total = Math.ceil(text.length / 500);
    for (let part = 0; part < total; part++) {
      message.incoming = new Map([['DATA', JSON.stringify({ v: 1, session, id, part, total, text: text.slice(part * 500, (part + 1) * 500) })]]);
      message.options.onReadable.call(message);
    }
  }
  message.options.onWritable();
  function handshake() {
    const hello = commands.filter(c => c.type === 'hello').at(-1);
    emit({ type: 'hello', echo: hello.now, at: now });
  }
  if (bootstrap) {
    handshake();
    emit({ type: 'catalog', network, cached: false });
    emit({ type: 'connection', status: 'connected' });
  }
  return {
    emit, handshake, pulses, commands, store,
    get frames() { return frames; },
    get timers() { return repeats.length; },
    dots() { return rectangles.filter(r => r.width === 8 && r.height === 8).map(r => r.color); },
    get model() { return runInContext('model', context); },
    get view() { return runInContext('view', context); },
    labels() { return drawn.join('\n'); },
    evaluate(code) { return runInContext(code, context); },
    press(type) { buttons.onPush(true, type); buttons.onPush(false, type); },
    advance(ms) { now += ms; repeats.forEach(fn => fn()); },
    focus(value) { for (const fn of events.didFocus) fn(value); },
    disconnect() { context.watch.connected.app = false; context.watch.connected.pebblekit = false; for (const fn of events.connected) fn(); },
    reconnect() { context.watch.connected.app = true; context.watch.connected.pebblekit = true; for (const fn of events.connected) fn(); },
    feed(value, extras = {}) {
      emit({ type: 'arrivals', station: favorite.station, generation: 0, at: now, predictions: [{
        direction: favorite.direction, order: 1, type: 'e', units: 's', value, received: now, expires: now + 18000, ...extras,
      }] });
    },
  };
}

test('loading stages follow the handshake, metadata and first valid arrivals', () => {
  const h = watchHarness(undefined, false);
  assert.match(h.labels(), /Connecting to phone/); assert.equal(h.dots().length, 3);
  assert.doesNotMatch(h.labels(), /--:--/);
  h.handshake();
  assert.match(h.labels(), /Loading stations/); assert.equal(h.dots().length, 3);
  h.emit({ type: 'catalog', network, cached: false });
  assert.match(h.labels(), /Waiting for arrivals/); assert.equal(h.dots().length, 3);
  h.feed(204);
  assert.match(h.labels(), /LIVE/); assert.match(h.labels(), /3:24/); assert.equal(h.dots().length, 0);
});
test('first-use loading stays on screen during retry and disappears when stations are ready', () => {
  const h = watchHarness({ favorites: [] }, false);
  assert.match(h.labels(), /Connecting to phone/); assert.equal(h.dots().length, 3);
  h.press('select'); assert.equal(h.view, 'empty');
  h.handshake(); assert.match(h.labels(), /Loading stations/);
  h.emit({ type: 'catalog', network, cached: false });
  assert.match(h.labels(), /Save a station/); assert.equal(h.dots().length, 0);
});
test('three dots advance at one hertz without new timers or redraws within a phase', () => {
  const h = watchHarness();
  const active = () => h.dots().findIndex(rgb => rgb.every(c => c === 0));
  assert.equal(active(), 0); assert.equal(h.timers, 1);
  const frames = h.frames;
  h.advance(500); assert.equal(h.frames, frames);
  h.advance(500); assert.equal(active(), 1); assert.equal(h.frames, frames + 1);
  h.emit({ type: 'connection', status: 'connected' }); assert.equal(h.frames, frames + 1);
  h.advance(1000); assert.equal(active(), 2);
  h.advance(1000); assert.equal(active(), 0);
});
test('offline, source failure, stale and unavailable states never animate a loader', () => {
  const offline = watchHarness(); offline.disconnect();
  assert.match(offline.labels(), /Phone disconnected/); assert.equal(offline.dots().length, 0);
  const failure = watchHarness(); failure.emit({ type: 'connection', status: 'disconnected', error: 'Feed unavailable' });
  assert.match(failure.labels(), /Feed unavailable/); assert.equal(failure.dots().length, 0);
  const stale = watchHarness(); stale.feed(204);
  for (let i = 0; i < 18; i++) stale.advance(1000);
  assert.match(stale.labels(), /STALE/); assert.equal(stale.dots().length, 0);
  const unavailable = watchHarness(); unavailable.emit({ type: 'arrivals', station: favorite.station, at: initialTime, predictions: [] });
  assert.match(unavailable.labels(), /No live estimate/); assert.equal(unavailable.dots().length, 0);
});
test('a source error also stops the first-use loader', () => {
  const h = watchHarness({ favorites: [] }, false); h.handshake();
  h.emit({ type: 'connection', status: 'disconnected', error: 'Station metadata unavailable' });
  assert.match(h.labels(), /Station metadata/); assert.equal(h.dots().length, 0);
});
test('each pending stage stops after fifteen seconds rather than spinning forever', () => {
  const h = watchHarness(undefined, false);
  for (let i = 0; i < 15; i++) h.advance(1000);
  assert.match(h.labels(), /Phone not responding/); assert.equal(h.dots().length, 0);
  h.handshake(); assert.match(h.labels(), /Loading stations/);
  for (let i = 0; i < 15; i++) h.advance(1000);
  assert.match(h.labels(), /Station data unavailable/); assert.equal(h.dots().length, 0);
  h.emit({ type: 'catalog', network, cached: false });
  for (let i = 0; i < 15; i++) h.advance(1000);
  assert.match(h.labels(), /No arrivals received/); assert.equal(h.dots().length, 0);
  h.feed(204); assert.match(h.labels(), /LIVE/); assert.equal(h.dots().length, 0);
});
test('manual retry restarts a timed-out loader without a blocking notice', () => {
  const h = watchHarness({ favorites: [] }, false);
  for (let i = 0; i < 15; i++) h.advance(1000);
  h.press('select');
  assert.equal(h.view, 'empty'); assert.match(h.labels(), /Connecting to phone/); assert.equal(h.dots().length, 3);
});
test('switching favourites starts a new loading window for the selected target', () => {
  const h = watchHarness();
  for (let i = 0; i < 14; i++) h.advance(1000);
  h.model.favorites.push({ station: 'pt-ml-ap', line: favorite.line, direction: favorite.station });
  h.press('down'); h.advance(1000);
  assert.match(h.labels(), /Aeroporto/); assert.match(h.labels(), /Waiting for arrivals/); assert.equal(h.dots().length, 3);
  const at = initialTime + 15000;
  h.emit({ type: 'arrivals', station: 'pt-ml-ap', at, predictions: [{ direction: favorite.station, order: 1, type: 'e', units: 's', value: 100, received: at, expires: at + 18000 }] });
  assert.match(h.labels(), /1:40/); assert.equal(h.dots().length, 0);
});
test('loading animation pauses while unfocused and resumes without a fast timer', () => {
  const h = watchHarness(); h.advance(1000); h.focus(false); h.advance(1000);
  const frames = h.frames;
  h.advance(1000); assert.equal(h.frames, frames);
  h.focus(true); h.advance(1000); assert.equal(h.frames, frames + 1);
});
test('production watch UI handshakes, renders live data, and selects supported fonts for bounds', () => {
  const h = watchHarness();
  h.feed(204);
  assert.match(h.labels(), /LIVE/); assert.match(h.labels(), /3:24/);
  h.feed(6000);
  assert.match(h.labels(), /100:00/);
  h.feed(6000, { type: 'i', upper: 6600 });
  assert.match(h.labels(), /100–110/);
});
test('seconds remain labelled even when two later trains occupy the secondary row', () => {
  const h = watchHarness();
  h.emit({ type: 'arrivals', station: favorite.station, at: initialTime, generation: 0,
    predictions: [26, 120, 240].map((value, i) => ({ direction: favorite.direction, order: i + 1, type: 'e', units: 's', value, received: initialTime, expires: initialTime + 18000 })) });
  assert.match(h.labels(), /sec/); assert.match(h.labels(), /2:00/);
});
test('an arrival alert screen invalidates its captured estimate immediately on disconnect', () => {
  const h = watchHarness(); h.feed(125); h.evaluate('model.arm(Date.now())'); h.advance(5000);
  assert.equal(h.view, 'alert'); assert.match(h.labels(), /2:00/);
  h.disconnect();
  assert.match(h.labels(), /OFFLINE/); assert.match(h.labels(), /Phone disconnected/);
  assert.doesNotMatch(h.labels(), /2:00/);
});
test('alert estimates are not resurrected by an empty feed or reconnect', () => {
  const h = watchHarness(); h.feed(125); h.evaluate('model.arm(Date.now())'); h.advance(5000);
  h.emit({ type: 'arrivals', station: favorite.station, generation: 1, at: initialTime + 5000, predictions: [] });
  assert.doesNotMatch(h.labels(), /2:00/); assert.match(h.labels(), /Estimate unavailable/);
  h.disconnect(); h.reconnect();
  assert.doesNotMatch(h.labels(), /2:00/);
});
test('open service pages stop claiming normal service after a failed refresh', () => {
  const h = watchHarness(); h.emit({ type: 'service', ok: true, updated: initialTime, disturbances: [] });
  h.press('select'); h.press('down'); h.press('select');
  assert.equal(h.view, 'service'); assert.match(h.labels(), /No ongoing/);
  h.emit({ type: 'service', ok: false });
  assert.match(h.labels(), /Status unavailable/); assert.doesNotMatch(h.labels(), /No ongoing/);
});
test('service paging reaches every incident without concatenating all source text', () => {
  const h = watchHarness();
  h.emit({ type: 'service', ok: true, updated: initialTime, disturbances: ['First report.', 'Second report.'].map((description, i) => ({ id: String(i), line: favorite.line, description, updated: initialTime, official: true })) });
  h.press('select'); h.press('down'); h.press('select');
  assert.match(h.labels(), /First report/);
  h.press('down'); assert.match(h.labels(), /Second report/); assert.match(h.labels(), /Issue 2\/2/);
  h.press('up'); assert.match(h.labels(), /First report/);
});
test('unchanged screens redraw their clock at the next minute', () => {
  const h = watchHarness({ favorites: [] });
  const clock = h.labels().split('\n')[1];
  h.advance(60000);
  assert.notEqual(h.labels().split('\n')[1], clock);
});
test('incoming messages cannot consume or buzz a threshold while the watch has lost focus', () => {
  const h = watchHarness({ favorites: [favorite], haptics: true });
  h.feed(130); h.evaluate('model.arm(Date.now())'); h.focus(false);
  h.feed(129); h.feed(119);
  assert.notEqual(h.view, 'alert'); assert.equal(h.pulses.length, 0); assert.equal(h.model.armed.previous, undefined);
  h.focus(true); h.advance(1000);
  assert.equal(h.pulses.length, 0);
});
test('an older metadata cache does not erase a newer saved station', () => {
  const h = watchHarness(); h.model.favorites = [{ ...favorite, station: 'pt-ml-new' }];
  h.emit({ type: 'catalog', network, cached: true });
  assert.equal(h.model.favorites[0].station, 'pt-ml-new');
});
test('optional service buzz also respects lost watch focus', () => {
  const h = watchHarness({ favorites: [favorite], serviceHaptics: true });
  h.emit({ type: 'service', ok: true, updated: initialTime, disturbances: [] });
  h.focus(false);
  h.emit({ type: 'service', ok: true, updated: initialTime, disturbances: [{ id: 'incident', line: favorite.line, description: 'Atrasos', updated: initialTime, official: true }] });
  assert.equal(h.pulses.length, 0);
});
test('production buttons add a valid favourite and expose removal confirmation', () => {
  const h = watchHarness({ favorites: [] });
  h.press('select'); assert.equal(h.view, 'stations');
  h.press('select'); assert.equal(h.view, 'directions');
  h.press('select'); assert.equal(h.view, 'arrivals');
  assert.equal(h.model.favorites.length, 1);
  const saved = JSON.parse(h.store.get('preferences'));
  assert.equal(saved.favorites[0].station, network.stations[0].id);
  h.press('select'); h.press('down'); h.press('down'); h.press('down'); h.press('select');
  assert.equal(h.view, 'remove');
  h.press('select'); assert.equal(h.model.favorites.length, 1);
});
