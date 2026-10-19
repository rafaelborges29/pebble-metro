import test from 'node:test';
import assert from 'node:assert/strict';
import { WatchModel, createReceiver, paginate, validSavedFavorite, SERVICE_TTL } from '../src/common/watch-model.js';

const favorite = { station: 'pt-ml-sa', line: 'pt-ml-vermelha', direction: 'pt-ml-ap' };
const now = 1792390000000;
function setup() {
  const model = new WatchModel();
  model.favorites = [favorite];
  model.setLink(true);
  model.connection = 'connected';
  return model;
}
function feed(model, seconds = 125, at = now, validity = 18000, extras = {}) {
  model.receive({ type: 'arrivals', station: favorite.station, at,
    predictions: [{ direction: favorite.direction, order: 1, type: 'e', units: 's', value: seconds,
      received: at, expires: at + validity, ...extras }] }, 0, at);
}

test('countdowns expire on the watch even if the phone freezes', () => {
  const model = setup(); feed(model);
  assert.equal(model.status(now), 'LIVE');
  assert.equal(model.predictions(favorite, now + 18000).length, 0);
  assert.equal(model.status(now + 18000), 'STALE');
});
test('unavailable payload replaces old predictions, not their expiry', () => {
  const model = setup(); feed(model);
  model.receive({ type: 'arrivals', station: favorite.station, at: now + 1000, predictions: [] }, 0, now + 1000);
  assert.equal(model.predictions(favorite, now + 1000).length, 0);
  assert.equal(model.status(now + 1000), 'NO ESTIMATE');
});
test('offline immediately invalidates estimates and pauses an armed alert', () => {
  const model = setup(); feed(model); assert.equal(model.arm(now), null);
  model.setLink(false);
  assert.equal(model.status(now + 1000), 'OFFLINE');
  assert.equal(model.tick(now + 6000), false);
  assert.equal(model.armed.previous, undefined);
});
test('fresh threshold crossing is one-shot and can occur between feed updates', () => {
  const model = setup(); feed(model); assert.equal(model.arm(now), null);
  assert.equal(model.tick(now + 4000), false);
  assert.equal(model.tick(now + 5000), true);
  assert.equal(model.armed, null);
  assert.equal(model.tick(now + 6000), false);
});
test('arming below threshold or on an uncertain estimate is rejected', () => {
  const model = setup(); feed(model, 119);
  assert.match(model.arm(now), /Already/);
  feed(model, 121, now, 18000, { type: 'l' });
  assert.match(model.arm(now), /exact/);
  feed(model, 3, now, 18000, { units: 'm' });
  assert.match(model.arm(now), /exact/);
});
test('no retroactive alert after an expired-data gap', () => {
  const model = setup(); feed(model, 130, now, 2000); model.arm(now);
  assert.equal(model.tick(now + 3000), false);
  feed(model, 110, now + 4000);
  assert.equal(model.tick(now + 4000), false);
  feed(model, 123, now + 5000);
  assert.equal(model.tick(now + 5000), false);
  assert.equal(model.tick(now + 8000), true);
});
test('gap between ticks is detected before a replacement message could trigger', () => {
  const model = setup(); feed(model, 130, now, 2000); model.arm(now);
  feed(model, 110, now + 3000);
  assert.equal(model.tick(now + 3000), false);
});
test('feed disconnect pauses crossing even while last data is valid', () => {
  const model = setup(); feed(model); model.arm(now);
  model.receive({ type: 'connection', status: 'disconnected' }, 0, now + 1000);
  assert.equal(model.tick(now + 5000), false);
  model.receive({ type: 'connection', status: 'connected' }, 0, now + 6000);
  assert.equal(model.tick(now + 6000), false);
});
test('browsing preserves the armed target and prunes unrelated stations', () => {
  const model = setup(); feed(model); model.arm(now);
  model.favorites.push({ ...favorite, station: 'pt-ml-am' }); model.index = 1;
  model.arrivals['pt-ml-ap'] = { predictions: [] };
  model.prune();
  assert.ok(model.arrivals['pt-ml-sa']);
  assert.equal(model.arrivals['pt-ml-ap'], undefined);
  assert.equal(model.tick(now + 5000), true);
  assert.equal(model.alert.favorite.station, favorite.station);
});
test('out-of-order arrival records cannot replace newer data', () => {
  const model = setup(); feed(model, 130, now + 1000); feed(model, 200, now);
  assert.equal(model.predictions(favorite, now + 1000)[0].value, 130);
});
test('conservative clock offset shortens, never extends, expiry', () => {
  const model = setup();
  model.receive({ type: 'arrivals', station: favorite.station, at: now,
    predictions: [{ direction: favorite.direction, order: 1, type: 'e', units: 's', value: 130, received: now, expires: now + 10000 }] }, -2000, now);
  assert.equal(model.predictions(favorite, now + 8000).length, 0);
});
test('absolute timestamps are translated along with receipt and expiry clocks', () => {
  const model = setup();
  model.receive({ type: 'arrivals', station: favorite.station, at: now,
    predictions: [{ direction: favorite.direction, order: 1, type: 't', units: 's', value: now / 1000 + 125, received: now, expires: now + 10000 }] }, -2000, now);
  const prediction = model.predictions(favorite, now)[0];
  assert.equal(prediction.value, now / 1000 + 123);
});
test('a coalesced feed generation change pauses crossing even if no empty packet arrived', () => {
  const model = setup(); feed(model, 130); model.arm(now);
  model.receive({ type: 'arrivals', station: favorite.station, at: now + 1000, generation: 1,
    predictions: [{ direction: favorite.direction, order: 1, type: 'e', units: 's', value: 119, received: now + 1000, expires: now + 19000 }] }, 0, now + 1000);
  assert.equal(model.tick(now + 1000), false);
  assert.ok(model.armed);
});
test('old-session predictions and unsubscribed stations do not renew data', () => {
  const model = setup();
  model.receive({ type: 'arrivals', station: 'pt-ml-xx', at: now, predictions: [] }, 0, now);
  assert.equal(model.arrivals['pt-ml-xx'], undefined);
  model.receive({ type: 'arrivals', station: favorite.station, at: now - 121000, predictions: [] }, 0, now);
  assert.equal(model.arrivals[favorite.station], undefined);
});

test('service failure and expiry are unknown, not a normal-service result', () => {
  const model = setup();
  model.receive({ type: 'service', ok: true, updated: now, disturbances: [] }, 0, now);
  assert.equal(model.serviceCurrent(now), true);
  model.receive({ type: 'service', ok: false }, 0, now + 1000);
  assert.equal(model.serviceCurrent(now + 1000), false);
  model.receive({ type: 'service', ok: true, updated: now + 2000, disturbances: [] }, 0, now + 2000);
  assert.equal(model.serviceCurrent(now + 2000 + SERVICE_TTL), false);
});
test('service haptic events deduplicate text, ignore poll timestamps and first load', () => {
  const model = setup();
  const report = { id: 'incident', line: favorite.line, description: 'Atrasos', updated: now, official: true };
  const receive = (d, at) => model.receive({ type: 'service', ok: true, updated: at, disturbances: d }, 0, at);
  assert.equal(receive([report], now), undefined);
  assert.equal(receive([{ ...report, updated: now + 1000 }], now + 1000), undefined);
  assert.equal(receive([{ ...report, description: 'Circulação interrompida' }], now + 2000), 'service');
  assert.equal(receive([{ ...report, line: 'pt-ml-azul', id: 'different' }], now + 3000), undefined);
  model.setLink(false); model.setLink(true);
  assert.equal(receive([report], now + 4000), undefined);
});

test('reassembly accepts only complete ordered batches in the current session', () => {
  const received = [], receive = createReceiver('current', x => received.push(x));
  const send = (id, part, total, text, session = 'current', at = now) => receive(JSON.stringify({ v: 1, session, id, part, total, text }), at);
  send(1, 0, 2, '{"a":'); send(1, 0, 2, '{"a":'); send(1, 1, 2, '1}');
  assert.deepEqual(received, [{ a: 1 }]);
  send(1, 0, 1, '{}'); send(2, 0, 1, '{}', 'old'); send(3, 1, 2, '}');
  assert.equal(received.length, 1);
  send(4, 0, 1, '{"a":2}');
  assert.deepEqual(received[1], { a: 2 });
});
test('reassembly rejects oversized, malformed, missing and timed-out batches', () => {
  const received = [], receive = createReceiver('s', x => received.push(x));
  const send = (id, part, total, text, at = now) => receive(JSON.stringify({ v: 1, session: 's', id, part, total, text }), at);
  receive('invalid json', now); send(1, 0, 33, '{}'); send(2, 0, 1, 'x'.repeat(501));
  send(3, 0, 2, '{'); send(3, 1, 2, '}', now + 21000);
  send(4, 0, 3, '{'); send(4, 2, 3, '}');
  assert.equal(received.length, 0);
  send(5, 0, 1, '{}'); assert.equal(received.length, 1);
});
test('pagination preserves source words and bounds every line and page', () => {
  const source = 'Circulação com atrasos. Conte com um tempo de espera superior ao habitual. São Sebastião. ' + 'a'.repeat(50);
  const pages = paginate(source);
  assert.ok(pages.length > 1);
  assert.equal(pages.join('').replace(/\s/g, ''), source.replace(/\s/g, ''));
  for (const page of pages) {
    assert.ok(page.split('\n').length <= 5);
    assert.ok(page.split('\n').every(line => line.length <= 23));
  }
});
test('text pagination also obeys measured font width without dropping characters', () => {
  const source = 'WWWWWWWW iii WWWW iiii WWWWWWWWWWWWWWW';
  const width = s => [...s].reduce((n, c) => n + (c === 'W' ? 3 : 1), 0);
  const pages = paginate(source, 23, 5, s => width(s) <= 12);
  assert.ok(pages.every(p => p.split('\n').every(line => width(line) <= 12)));
  assert.equal(pages.join('').replace(/\s/g, ''), source.replace(/\s/g, ''));
});
test('saved favourites have bounded valid source identifiers', () => {
  assert.equal(validSavedFavorite(favorite), true);
  assert.equal(validSavedFavorite({ ...favorite, station: 'https://arbitrary.example' }), false);
  assert.equal(validSavedFavorite({ ...favorite, direction: 'x'.repeat(1000) }), false);
});
