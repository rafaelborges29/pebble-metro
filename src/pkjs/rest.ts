import { API } from "../common/metro.js";
import type { Timers, Timer, JsonRequester, JsonCallback } from './platform.js';

// XHR is available in Android PebbleKit JS; no fetch/AbortController polyfills.
export function createJsonRequester(options: { XMLHttpRequest: typeof XMLHttpRequest; timers: Timers; now(): number }): JsonRequester {
  return function request(path: string, callback: JsonCallback) {
    var xhr = new options.XMLHttpRequest(), finished = false, timeout: Timer | undefined;
    function finish(error: unknown, data?: unknown) {
      if (finished) return;
      finished = true;
      options.timers.clearTimeout(timeout);
      callback(error, data);
    }
    function fail(message: string) {
      finish(new Error(message));
      try { xhr.abort(); } catch (_) {}
    }
    timeout = options.timers.setTimeout(function () { fail("UnderLX timed out"); }, 15000);
    try {
      xhr.open("GET", API + "/" + path, true);
      xhr.timeout = 15000;
      xhr.onreadystatechange = function () {
        if (finished || xhr.readyState !== 2) return;
        var length = Number(xhr.getResponseHeader("Content-Length"));
        if (length > 1024 * 1024) fail("UnderLX response too large");
      };
      xhr.onprogress = function (event) { if (event.loaded > 1024 * 1024) fail("UnderLX response too large"); };
      xhr.onerror = function () { finish(new Error("UnderLX network error")); };
      xhr.ontimeout = function () { fail("UnderLX timed out"); };
      xhr.onload = function () {
        if (finished) return;
        try {
          if (xhr.status !== 200) throw new Error("UnderLX HTTP " + xhr.status);
          if (xhr.responseText.length > 1024 * 1024) throw new Error("UnderLX response too large");
          var age = xhr.getResponseHeader("Age"), date = xhr.getResponseHeader("Date");
          var now = options.now(), stamp = Date.parse(date || "");
          if ((age !== null && age !== "" && (!isFinite(Number(age)) || Number(age) < 0 || Number(age) >= 120)) ||
              (date && (!isFinite(stamp) || now - stamp >= 120000 || stamp - now > 30000)))
            throw new Error("Stale UnderLX response");
          finish(null, JSON.parse(xhr.responseText));
        } catch (error) { finish(error); }
      };
      xhr.send();
    } catch (error) { finish(error); }
    return function () { finished = true; options.timers.clearTimeout(timeout); try { xhr.abort(); } catch (_) {} };
  };
}
