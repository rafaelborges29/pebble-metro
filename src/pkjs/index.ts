import { createCompanion } from './companion.js';
import { createJsonRequester } from './rest.js';
import { Client } from 'paho-mqtt';
import localeRegistry from '../../locales/index.json';
import english from './locales/en.json';
import portuguese from './locales/pt_PT.json';
import type { CompanionPebble, Timers } from './platform.js';

declare const Pebble: CompanionPebble;

// Browser timer methods require their Window receiver on Android WebView.
var timers: Timers = {
  setTimeout: function (callback, delay) { return setTimeout(callback, delay); },
  clearTimeout: function (id) { clearTimeout(id as number | undefined); }
};
Pebble.addEventListener('ready', function () {
  console.log('Metro phone companion ready');
  var companion = createCompanion({
    Pebble: Pebble,
    localeRegistry: localeRegistry,
    phoneLocales: { 'en.json': english, 'pt_PT.json': portuguese },
    timers: timers,
    now: Date.now,
    storage: typeof localStorage !== 'undefined' ? localStorage : null,
    request: createJsonRequester({ XMLHttpRequest: XMLHttpRequest, timers: timers, now: Date.now }),
    createClient: function (url) {
      return new Client(url, 'metro-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8));
    }
  });
  companion.wake();
});
