import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

test('Android entry preserves native browser timer receivers and wakes Alloy', () => {
  let ready, wake = 0, fired = 0;
  const context = createContext({
    console: { log() {} }, Pebble: { addEventListener(name, fn) { if (name === 'ready') ready = fn; } },
    localStorage: {}, XMLHttpRequest: class {},
    require(request) {
      if (request.includes('companion')) return { createCompanion(options) {
        const id = options.timers.setTimeout(() => { fired++; }, 1);
        options.timers.clearTimeout(id);
        return { wake() { wake++; } };
      } };
      if (request.includes('rest')) return { createJsonRequester() { return () => {}; } };
      if (request === 'paho-mqtt') return { Client: class {} };
      throw new Error(request);
    },
  });
  runInContext('function setTimeout(callback) { if (this !== globalThis) throw Error("Illegal invocation"); callback(); return 1; } function clearTimeout() { if (this !== globalThis) throw Error("Illegal invocation"); }', context);
  runInContext(readFileSync(new URL('../src/pkjs/index.js', import.meta.url), 'utf8'), context);
  ready();
  assert.equal(wake, 1); assert.equal(fired, 1);
});
