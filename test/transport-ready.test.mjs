import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransport } from '../src/pkjs/transport.js';

test('Alloy wake probe breaks startup deadlock without overlapping the session hello', () => {
  let pending;
  const sent = [];
  const pebble = { sendAppMessage(data, ok, fail) {
    assert.equal(pending, undefined);
    sent.push(JSON.parse(data.DATA)); pending = { ok, fail };
  } };
  const transport = createTransport(pebble, { setTimeout() {}, clearTimeout() {} });
  transport.wake();
  assert.deepEqual(sent, [{}]);
  transport.reset('session'); transport.send({ type: 'hello', echo: 1, at: 1 });
  assert.equal(sent.length, 1);
  const probe = pending; pending = undefined; probe.ok();
  assert.equal(sent.length, 2); assert.equal(sent[1].session, 'session');
  assert.equal(JSON.parse(sent[1].text).type, 'hello');
  const hello = pending; pending = undefined; hello.ok();
  transport.wake(); assert.equal(sent.length, 2);
});
test('closing the transport prevents a failed wake from scheduling more work', () => {
  let fail, schedules = 0;
  const transport = createTransport({ sendAppMessage(_, ok, onFail) { fail = onFail; } }, {
    setTimeout() { schedules++; }, clearTimeout() {},
  });
  transport.wake(); transport.close(); fail();
  assert.equal(schedules, 0);
});
