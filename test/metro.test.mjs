import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNetwork, directions, favoriteKey, parseFavorites, parsePredictions, arrivalLabel, exactSeconds, parseDisturbances } from '../src/common/metro.js';

const stations = [
  { network: 'pt-ml', id: 'a', name: 'Aeroporto', lines: ['red'] },
  { network: 'pt-ml', id: 'b', name: 'Alameda', lines: ['red', 'green'] },
  { network: 'pt-ml', id: 'c', name: 'Cais do Sodré', lines: ['red', 'green'] },
];
const lines = [
  { network: 'pt-ml', id: 'red', name: 'Vermelha', color: 'FF0000', stations: ['a', 'b', 'c'] },
  { network: 'pt-ml', id: 'green', name: 'Verde', color: '008800', stations: ['b', 'c'] },
];
const network = parseNetwork(stations, lines);
const now = 1800000000000;
const raw = (extra = {}) => ({ direction: 'c', order: 1, type: 'e', units: 's', value: 150, made: now / 1000 - 10, validFor: 30, ...extra });
const parsed = (extra = {}) => parsePredictions([raw(extra)], now)[0];

test('network is compact, validated and directions exclude the current terminus', () => {
  assert.equal(network.lines[0].color, '#FF0000');
  assert.equal(network.stations[0].name, 'Aeroporto');
  assert.deepEqual(directions(network, 'b', 'red'), ['a', 'c']);
  assert.deepEqual(directions(network, 'a', 'red'), ['c']);
  assert.deepEqual(directions(network, 'a', 'green'), []);
  assert.deepEqual(directions(network, 'unknown', 'unknown'), []);
  assert.throws(() => parseNetwork([], []));
  assert.throws(() => parseNetwork([...stations, stations[0]], lines));
  assert.throws(() => parseNetwork(stations, [{ ...lines[0], stations: ['a', 'missing'] }]));
  assert.throws(() => parseNetwork(stations, [{ ...lines[0], color: '#FF0000' }, lines[1]]));
  assert.throws(() => parseNetwork(stations, [{ ...lines[0], stations: ['a', 'a'] }, lines[1]]));
  assert.throws(() => parseNetwork(stations, [...lines, lines[0]]));
  assert.throws(() => parseNetwork([{ ...stations[0], name: 'x'.repeat(81) }, ...stations.slice(1)], lines));
});

test('favorites contain only valid ID triples, deduplicate and fail closed', () => {
  const f = { station: 'b', line: 'red', direction: 'c' };
  assert.equal(favoriteKey(f), 'b/red/c');
  assert.deepEqual(parseFavorites(JSON.stringify([f, f, { ...f, direction: 'b' }, { station: 'a', line: 'green', direction: 'c' }, null]), network), [f]);
  for (const raw of [null, '', 'bad', '{}', 'null', 42, 'x'.repeat(10001)]) assert.deepEqual(parseFavorites(raw, network), []);
});

test('receipt-based aging never subtracts upstream age twice', () => {
  const p = parsed();
  assert.equal(p.received, now);
  assert.equal(p.expires, now + 30000);
  assert.equal(exactSeconds(p, now), 150);
  assert.equal(exactSeconds(p, now + 5000), 145);
  assert.deepEqual(arrivalLabel(p, now + 5000), { value: '2:25', unit: 'min' });
  assert.equal(arrivalLabel(p, now + 30000), undefined);
  assert.equal(exactSeconds(p, now + 30000), undefined);
  assert.equal(parsePredictions([raw({ made: now / 1000 - 110, validFor: 100 })], now)[0].expires, now + 10000);
  assert.equal(parsed({ validFor: 9999 }).expires, now + 110000);
});

test('timestamp, expiry, units, numeric and size trust boundaries', () => {
  const invalid = [
    { made: now / 1000 - 120 }, { made: now / 1000 + 30.001 }, { made: -1 }, { made: Infinity },
    { validFor: 0 }, { validFor: -1 }, { validFor: NaN }, { validFor: '10' }, { order: 0 }, { order: 4 }, { order: 1.5 },
    { direction: '' }, { direction: 'bad/topic' }, { units: 'hours' }, { value: -1 }, { value: Infinity },
    { value: 86401 }, { type: 'unknown' }, { type: 't', units: 'm' }, { type: 't', value: now / 1000 + 86401 },
    { type: 'i', lower: 100, upper: 99 }, { type: 'i', lower: 100 }, { type: 'i', lower: 0, upper: Infinity },
  ];
  for (const extra of invalid) assert.deepEqual(parsePredictions([raw(extra)], now), [], JSON.stringify(extra));
  assert.equal(parsed({ made: now / 1000 + 30 }).expires, now + 30000);
  assert.throws(() => parsePredictions({}));
  assert.throws(() => parsePredictions(Array(65).fill(raw()), now));
  assert.throws(() => parsePredictions([], NaN));
  assert.deepEqual(parsePredictions([null, {}, raw({ type: 'unavailable' })], now), []);
  assert.equal(arrivalLabel({ ...parsed(), expires: now + 120001 }, now), undefined);
  assert.equal(exactSeconds({ ...parsed(), received: now + 30001 }, now), undefined);
});

test('uncertainty is preserved and only exact relative seconds may arm alerts', () => {
  const p = parsed({ value: 0 });
  assert.deepEqual(arrivalLabel(p, now), { value: 'Due', unit: 'at platform' });
  assert.equal(exactSeconds(p, now), 0);
  const cases = [
    [{ value: 61 }, { value: '1:01', unit: 'min' }],
    [{ value: 59 }, { value: '59', unit: 'sec' }],
    [{ units: 'm', value: 3 }, { value: '~3', unit: 'min' }],
    [{ type: 'l', value: 90 }, { value: '<2', unit: 'min' }],
    [{ type: 'm', value: 90 }, { value: '>1', unit: 'min' }],
    [{ type: 'i', lower: 90, upper: 181 }, { value: '1–4', unit: 'min' }],
    [{ type: 't', value: now / 1000 + 90 }, { value: '1:30', unit: 'min' }],
    [{ type: 't', value: now / 1000 - 1 }, { value: 'Due', unit: 'at platform' }],
  ];
  for (const [extra, label] of cases) {
    const p = parsed(extra);
    assert.deepEqual(arrivalLabel(p, now), label);
    if (p.type !== 'e' || p.units !== 's') assert.equal(exactSeconds(p, now), undefined);
  }
  assert.deepEqual(arrivalLabel(parsed({ type: 'i', units: 'm', lower: 2, upper: 4 }), now + 10000), { value: '1–4', unit: 'min' });
  assert.equal(exactSeconds(parsed({ value: 1 }), now + 2000), 0);
});

test('prediction messages replace old observations, deduplicate and sort', () => {
  const ps = parsePredictions([raw({ order: 3 }), raw(), raw({ value: 99 }), raw({ direction: 'a', order: 2 })], now);
  assert.equal(ps.length, 3);
  assert.deepEqual(ps.map(p => p.order), [1, 2, 3]);
  assert.equal(ps[0].value, 99);
  assert.deepEqual(parsePredictions([], now), []);
});

test('service parser takes the newest valid text, preserves source and caps pages', () => {
  const incident = { id: 'incident', line: 'red', ended: false, official: true, description: 'Original', startTime: '2026-10-19T08:00:00Z', statuses: [
    { status: 'Novo aviso', time: '2026-10-19T09:00:00Z' },
    { status: 'Older', time: '2026-10-19T08:30:00Z' },
    { status: 'Invalid', time: 'nonsense' },
  ] };
  const result = parseDisturbances([incident, { ...incident, id: 'ended', ended: true }, { ...incident, id: 'other', line: 'unknown' }], network);
  assert.deepEqual(result, [{ id: 'incident', line: 'red', description: 'Novo aviso', updated: Date.parse('2026-10-19T09:00:00Z'), official: true }]);
  assert.deepEqual(parseDisturbances([], network), []);
  assert.throws(() => parseDisturbances({}, network));
  assert.throws(() => parseDisturbances([{}], network));
  assert.throws(() => parseDisturbances([incident, incident], network));
  assert.throws(() => parseDisturbances([{ ...incident, statuses: [], startTime: 'bad' }], network));
  assert.throws(() => parseDisturbances([{ ...incident, statuses: [], description: ' ' }], network));
  const long = parseDisturbances([{ ...incident, statuses: [{ status: 'x'.repeat(5000), time: '2026-10-19T10:00:00Z' }] }], network)[0];
  assert.ok(Buffer.byteLength(JSON.stringify(long.description)) <= 1200);
  assert.ok(long.description.endsWith('…'));
  assert.throws(() => parseDisturbances(Array.from({ length: 9 }, (_, i) => ({ ...incident, id: String(i) })), network));
});
