// One AppMessage in flight. Also wait until Alloy has READ each chunk:
// its native inbox ACK can otherwise precede JS delivery and overwrite unread data.
export function createTransport(pebble, timers) {
  var session = null, sequence = 0, queue = [], active = null, busy = false, retry, closed = false;
  function clearRetry() { if (retry) timers.clearTimeout(retry); retry = null; }
  function wake() {
    if (busy || session || closed) return;
    busy = true;
    var called = false;
    function done(ok) {
      if (called) return;
      called = true; busy = false;
      if (!ok && !session && !closed) retry = timers.setTimeout(function () { retry = null; wake(); }, 1000);
      else pump();
    }
    try { pebble.sendAppMessage({ DATA: '{}' }, function () { done(true); }, function () { done(false); }); }
    catch (_) { done(false); }
  }
  function advance(batch) {
    clearRetry(); batch.part++; batch.attempts = 0; batch.received = false;
    if (batch.part === batch.total) active = null;
    pump();
  }
  function failed(batch) {
    batch.attempts++;
    if (batch.attempts >= 3 && batch.key !== 'hello') active = null;
    retry = timers.setTimeout(function () { retry = null; pump(); }, Math.min(5000, 250 * Math.pow(2, Math.min(batch.attempts, 5))));
  }
  function receipt(id, part) {
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
    function done(ok) {
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
    reset: function (nextSession) {
      session = nextSession; queue = []; active = null; clearRetry();
      // Keep busy until any old-session send callback releases the wire.
    },
    send: function (message, key) {
      if (!session) return false;
      var text;
      // Bound the watch's transient UTF-8 JSON allocations, not just characters.
      try {
        text = JSON.stringify(message);
        if (!text || text.length > 5000 || encodeURIComponent(text).replace(/%[A-F\d]{2}/gi, 'x').length > 5000) return false;
      } catch (_) { return false; }
      var parts = [], start = 0;
      while (start < text.length) {
        var end = Math.min(start + 500, text.length), code = text.charCodeAt(end - 1);
        if (end < text.length && code >= 0xD800 && code <= 0xDBFF) end--;
        parts.push(text.slice(start, end)); start = end;
      }
      key = key || message.type;
      queue = queue.filter(function (batch) { return batch.key !== key; });
      if (queue.length >= 8) queue.splice(queue[0].key === 'hello' ? 1 : 0, 1);
      queue.push({ session: session, id: ++sequence, part: 0, total: parts.length, parts: parts, key: key, attempts: 0 });
      pump(); return true;
    },
    setStations: function (stations) {
      queue = queue.filter(function (batch) { return batch.key.indexOf('arrivals:') !== 0 || stations.indexOf(batch.key.slice(9)) !== -1; });
    },
    close: function () { closed = true; this.reset(null); }
  };
}
