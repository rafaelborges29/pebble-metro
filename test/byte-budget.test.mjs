import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDisturbances, parseNetwork } from '../src/common/metro.js';
import { createReceiver } from '../src/common/watch-model.js';
import { createTransport } from '../src/pkjs/transport.js';

test('transport bounds UTF-8 bytes and does not split surrogate pairs', () => {
  const packets = []; let transport;
  transport = createTransport({ sendAppMessage(value, ok) {
    const p = JSON.parse(value.DATA); packets.push(p);
    assert.doesNotThrow(() => encodeURIComponent(p.text));
    ok(); transport.receipt(p.id, p.part);
  } }, { setTimeout() { return 1; }, clearTimeout() {} });
  transport.reset('s');
  const payload = 'Português😀'.repeat(100);
  assert.equal(transport.send({ type: 'catalog', payload }), true);
  assert.equal(JSON.parse(packets.map(p => p.text).join('')).payload, payload);
  assert.equal(transport.send({ type: 'catalog', payload: '界'.repeat(2000) }), false);
  transport.close();
});
test('watch rejects a multi-chunk UTF-8 payload over its measured RAM budget', () => {
  const delivered = [], receive = createReceiver('s', value => delivered.push(value));
  let accepted;
  for (let part = 0; part < 4; part++) accepted = receive(JSON.stringify({ v: 1, session: 's', id: 1, part, total: 4, text: '界'.repeat(500) }), part * 100);
  assert.ok(!accepted); assert.equal(delivered.length, 0);
});
test('eight long service notices are visibly truncated to a safe whole-snapshot budget', () => {
  const network = { lines: [{ id: 'pt-ml-vermelha' }] };
  const data = Array.from({ length: 8 }, (_, id) => ({ id: String(id), line: 'pt-ml-vermelha', ended: false,
    description: 'Circulação 界 '.repeat(200), startTime: '2026-10-19T08:00:00Z', official: true }));
  const disturbances = parseDisturbances(data, network);
  const payload = { type: 'service', ok: true, updated: Date.now(), disturbances };
  assert.equal(disturbances.length, 8);
  assert.ok(Buffer.byteLength(JSON.stringify(payload)) <= 4800);
  assert.ok(disturbances.every(d => d.description.endsWith('…')));
});
test('oversized Unicode metadata fails closed instead of overrunning the watch', () => {
  const stations = Array.from({ length: 50 }, (_, i) => ({ id: 's' + i, network: 'pt-ml', name: '界'.repeat(70), lines: ['red'] }));
  const lines = [{ id: 'red', network: 'pt-ml', name: 'Red', color: 'ff0000', stations: stations.map(s => s.id) }];
  assert.throws(() => parseNetwork(stations, lines), /too large/);
});
