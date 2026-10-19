import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceiver } from '../src/common/watch-model.js';
import { createTransport } from '../src/pkjs/transport.js';

test('a slow complete catalog remains valid while each chunk makes progress', () => {
  const delivered = [], receive = createReceiver('session', m => delivered.push(m));
  const text = JSON.stringify({ type: 'catalog', payload: 'x'.repeat(4000) });
  const total = Math.ceil(text.length / 150);
  for (let part = 0; part < total; part++) {
    assert.equal(receive(JSON.stringify({ v: 1, session: 'session', id: 1, part, total, text: text.slice(part * 150, (part + 1) * 150) }), part * 1900), true);
  }
  assert.equal(delivered.length, 1);
});
test('an abandoned batch is not ACKed after its progress timeout', () => {
  const receive = createReceiver('s', () => assert.fail('incomplete data'));
  const packet = part => JSON.stringify({ v: 1, session: 's', id: 1, part, total: 2, text: part ? '}' : '{' });
  assert.equal(receive(packet(0), 0), true);
  assert.ok(!receive(packet(1), 21000));
});
test('physical ACK does not advance unread data; application ACK and retries preserve chunk identity', () => {
  const sent = [], jobs = new Map(); let sequence = 0;
  const timers = { setTimeout(fn) { const id = ++sequence; jobs.set(id, fn); return id; }, clearTimeout(id) { jobs.delete(id); } };
  const transport = createTransport({ sendAppMessage(packet, ok) { sent.push(JSON.parse(packet.DATA)); ok(); } }, timers);
  transport.reset('s'); transport.send({ type: 'catalog', payload: 'x'.repeat(700) });
  assert.equal(sent.length, 1);
  function next() { const [id, fn] = jobs.entries().next().value; jobs.delete(id); fn(); }
  next(); next();
  assert.deepEqual(sent[0], sent[1]);
  transport.receipt(sent[0].id, 0);
  assert.equal(sent.length, 3); assert.equal(sent[2].part, 1);
  transport.receipt(sent[0].id, 0); assert.equal(sent.length, 3);
  transport.receipt(sent[2].id, 1); assert.equal(jobs.size, 0);
  transport.close();
});
