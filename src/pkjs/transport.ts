import type { WatchMessage } from '../common/types.js';
import type { CompanionPebble, Timers, Timer } from './platform.js';

interface Batch {
  session: string; id: number; part: number; total: number; parts: string[];
  key: string; attempts: number; invalidates: boolean; received?: boolean;
}

// One AppMessage in flight; wait for the watch's application receipt before
// advancing. Partial or unconsumed batches must never renew an arrival estimate.
export function createTransport(pebble: CompanionPebble, timers: Timers, onInvalidationLoss: () => void) {
  var session: string | null = null, sequence = 0, queue: Batch[] = [], active: Batch | null | undefined = null;
  var busy = false, retry: Timer | null | undefined, closed = false;
  function clearRetry() { if (retry) timers.clearTimeout(retry); retry = null; }
  function wake() {
    if (busy || session || closed) return;
    busy = true;
    var called = false;
    function done(ok: boolean) {
      if (called) return;
      called = true; busy = false;
      if (!ok && !session && !closed) retry = timers.setTimeout(function () { retry = null; wake(); }, 1000);
      else pump();
    }
    try { pebble.sendAppMessage({ DATA: '{}' }, function () { done(true); }, function () { done(false); }); }
    catch (_) { done(false); }
  }
  function advance(batch: Batch) {
    clearRetry(); batch.part++; batch.attempts = 0; batch.received = false;
    if (batch.part === batch.total) active = null;
    pump();
  }
  function failed(batch: Batch) {
    batch.attempts++;
    var discarded = batch.attempts >= 3 && batch.key !== 'hello';
    if (discarded) active = null;
    retry = timers.setTimeout(function () { retry = null; pump(); }, Math.min(5000, 250 * Math.pow(2, Math.min(batch.attempts, 5))));
    if (discarded && batch.invalidates) onInvalidationLoss();
  }
  function receipt(id: number, part: number) {
    if (!active || active.id !== id || active.part !== part) return;
    active.received = true;
    if (!busy) advance(active);
  }
  function pump() {
    if (busy || retry || !session) return;
    if (!active) active = queue.shift();
    if (!active) return;
    var batch = active, part = batch.part;
    var envelope = { v: 1, session: batch.session, id: batch.id, part: part, total: batch.total,
      text: batch.parts[part] };
    busy = true;
    var called = false;
    function done(ok: boolean) {
      if (called) return;
      called = true; busy = false;
      if (active !== batch || session !== batch.session) { pump(); return; }
      if (batch.received) { advance(batch); return; }
      if (ok) {
        retry = timers.setTimeout(function () { retry = null; failed(batch); }, 2000);
      } else failed(batch);
    }
    try { pebble.sendAppMessage({ DATA: JSON.stringify(envelope) }, function () { done(true); }, function () { done(false); }); }
    catch (_) { done(false); }
  }
  return {
    wake: wake,
    receipt: receipt,
    reset: function (nextSession: string | null) {
      session = nextSession; queue = []; active = null; clearRetry();
      // Keep busy until any old-session send callback releases the wire.
    },
    send: function (message: WatchMessage, key?: string) {
      if (!session) return false;
      var text;
      // Bound the watch's transient UTF-8 JSON allocations, not just characters.
      try {
        text = JSON.stringify(message);
        if (!text || text.length > 5000 || encodeURIComponent(text).replace(/%[A-F\d]{2}/gi, 'x').length > 5000) return false;
      } catch (_) { return false; }
      var parts: string[] = [], start = 0;
      while (start < text.length) {
        var end = Math.min(start + 500, text.length), code = text.charCodeAt(end - 1);
        if (end < text.length && code >= 0xD800 && code <= 0xDBFF) end--;
        parts.push(text.slice(start, end)); start = end;
      }
      key = key || message.type;
      var invalidates = key === 'invalidation' || (message.type === 'arrivals' && Array.isArray(message.predictions) && !message.predictions.length);
      queue = queue.filter(function (batch) {
        if (batch.key !== key) return true;
        // A newer snapshot must reach the watch before it can supersede an invalidation.
        invalidates = invalidates || batch.invalidates;
        return false;
      });
      // Configuration saves/receipts must not be silently evicted by feed traffic.
      var discarded: Batch | null = null;
      if (queue.length >= 8) {
        var victim = -1;
        for (var i = 0; i < queue.length; i++) if (queue[i]!.key !== 'hello' && queue[i]!.key.indexOf('settings:') !== 0) { victim = i; break; }
        if (victim < 0) return false;
        discarded = queue.splice(victim, 1)[0]!;
      }
      queue.push({ session: session, id: ++sequence, part: 0, total: parts.length, parts: parts, key: key, attempts: 0, invalidates: invalidates });
      // Publish the generation barrier AFTER every older queued snapshot.
      if (discarded && discarded.invalidates) onInvalidationLoss();
      pump(); return true;
    },
    setStations: function (stations: string[]) {
      queue = queue.filter(function (batch) { return batch.invalidates || batch.key.indexOf('arrivals:') !== 0 || stations.indexOf(batch.key.slice(9)) !== -1; });
    },
    close: function () { closed = true; this.reset(null); }
  };
}
