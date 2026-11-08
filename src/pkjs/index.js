require("./licences-loader.cjs!../../LICENSE");

// SDK webpack 1 needs a build-time adapter; runtime/shared sources stay ESM.
var createCompanion = require("./esm-loader.cjs!./companion.js").createCompanion;
var createJsonRequester = require("./esm-loader.cjs!./rest.js").createJsonRequester;
var Paho = require("paho-mqtt");

// Browser timer methods require their Window receiver on Android WebView.
var timers = {
  setTimeout: function (callback, delay) { return setTimeout(callback, delay); },
  clearTimeout: function (id) { clearTimeout(id); }
};
Pebble.addEventListener("ready", function () {
  console.log("Metro phone companion ready");
  var companion = createCompanion({
    Pebble: Pebble,
    localeRegistry: require("../../locales/index.json"),
    phoneLocales: {
      "en.json": require("./locales/en.json"),
      "pt_PT.json": require("./locales/pt_PT.json")
    },
    timers: timers,
    now: Date.now,
    storage: typeof localStorage !== "undefined" ? localStorage : null,
    request: createJsonRequester({ XMLHttpRequest: XMLHttpRequest, timers: timers, now: Date.now }),
    createClient: function (url) {
      return new Paho.Client(url, "metro-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8));
    }
  });
  companion.wake();
});
