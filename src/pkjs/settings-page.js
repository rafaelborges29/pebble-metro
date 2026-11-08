// Serialized into a self-contained data: page. Copy comes from keyed JSON files.
function settingsClient(model) {
  function t(key) { return model.strings[key] || key; }
  function node(tag, text, parent, className) {
    var element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    if (parent) parent.appendChild(element);
    return element;
  }
  var main = document.querySelector("main"), busy = false, ready = false, editable = false, known = false;
  var network = { stations: [], lines: [] }, favorites = [], bridge = null, bridgeTimer = null, bridgeWait = 0;
  var header = node("header", undefined, main);
  var heading = node("div", undefined, header);
  node("p", "METRO LISBOA", heading, "eyebrow"); node("h1", t("title"), heading);
  function button(key, parent, action, className) {
    var element = node("button", t(key), parent, className); element.type = "button";
    element.addEventListener("click", action); return element;
  }
  var done = button("close.action", header, function () {
    if (busy) return;
    var link = node("a", "", document.body); link.hidden = true; link.href = "pebblejs://close#{}"; link.click(); link.remove();
  }, "quiet");
  node("p", t("description"), main, "description");
  var status = node("p", "", main, "status"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  function feedback(code) { status.textContent = t("status." + code); status.dataset.state = code; }
  feedback("connecting");
  var picker = node("fieldset", undefined, main, "picker");
  node("legend", t("add.title"), picker);
  var fields = node("div", undefined, picker, "fields");
  function select(key, id) {
    var wrapper = node("div", undefined, fields);
    var label = node("label", t(key), wrapper); label.htmlFor = id;
    var input = node("select", undefined, wrapper); input.id = id; return input;
  }
  var line = select("field.line", "line"), station = select("field.station", "station"), direction = select("field.direction", "direction");
  function name(id, items) {
    var found = items.filter(function (item) { return item.id === id; })[0];
    return found ? found.name : id;
  }
  function route() { return network.lines.filter(function (item) { return item.id === line.value; })[0]; }
  function options(input, items, preferred) {
    input.textContent = "";
    items.forEach(function (item) { var option = node("option", item.name, input); option.value = item.id; });
    if (items.some(function (item) { return item.id === preferred; })) input.value = preferred;
  }
  function directions(preferred) {
    var selected = route();
    options(direction, selected ? [selected.stations[0], selected.stations[selected.stations.length - 1]]
      .filter(function (id) { return id !== station.value; })
      .map(function (id) { return { id: id, name: name(id, network.stations) }; }) : [], preferred);
  }
  function stations(preferred, destination) {
    var selected = route();
    options(station, network.stations.filter(function (item) { return selected && selected.stations.indexOf(item.id) !== -1; }), preferred);
    directions(destination);
  }
  line.addEventListener("change", function () { stations(); });
  station.addEventListener("change", function () { directions(); });
  var add = button("add.action", picker, function () {
    if (busy || !editable || !ready || favorites.length >= 16 || !line.value || !station.value || !direction.value) return;
    var favorite = [station.value, line.value, direction.value];
    if (favorites.some(function (f) { return f.join("/") === favorite.join("/"); })) { feedback("duplicate"); return; }
    save(favorites.concat([favorite]));
  }, "primary");
  var listHeader = node("div", undefined, main, "list-header");
  var listHeading = node("h2", t("list.title"), listHeader); listHeading.id = "routes-title";
  var count = node("span", "", listHeader, "count");
  var refresh = button("refresh.action", listHeader, function () { read(); }, "quiet");
  var list = node("ul", undefined, main, "routes"); list.setAttribute("aria-labelledby", listHeading.id);
  var empty = node("p", "", main, "empty");
  node("small", t("attribution"), main, "attribution");
  function controls() {
    picker.disabled = busy || !ready || !editable;
    add.disabled = busy || !ready || !editable || favorites.length >= 16;
    refresh.disabled = busy || !ready;
    done.disabled = busy;
    list.querySelectorAll("button").forEach(function (button) { button.disabled = busy || !ready || !editable; });
    main.setAttribute("aria-busy", busy ? "true" : "false");
  }
  function render(view) {
    if (view) {
      var selectedLine = line.value, selectedStation = station.value, selectedDirection = direction.value;
      network = view.network; favorites = view.favorites; editable = view.editable; known = true;
      options(line, network.lines, selectedLine); stations(selectedStation, selectedDirection);
    }
    count.textContent = known ? favorites.length + " / 16" : "— / 16";
    list.textContent = "";
    favorites.forEach(function (favorite, index) {
      var service = network.lines.filter(function (item) { return item.id === favorite[1]; })[0];
      var served = service && service.stations.indexOf(favorite[0]) !== -1 && favorite[0] !== favorite[2]
        && (service.stations[0] === favorite[2] || service.stations[service.stations.length - 1] === favorite[2]);
      var row = node("li", undefined, list, "route");
      if (service && /^#[a-fA-F0-9]{6}$/.test(service.color)) row.style.borderLeftColor = service.color;
      var content = node("div", undefined, row, "route-content");
      node("span", name(favorite[1], network.lines), content, "line-name");
      var title = node("h3", name(favorite[0], network.stations), content); title.id = "route-" + index;
      node("p", "→ " + name(favorite[2], network.stations), content, "destination");
      if (!served) node("span", t("route.unavailable"), content, "unavailable");
      var remove = button("remove.action", row, function () {
        if (busy || !editable || !ready) return;
        if (window.confirm(t("remove.confirm") + "\n" + name(favorite[0], network.stations) + " → " + name(favorite[2], network.stations)))
          save(favorites.filter(function (_, i) { return i !== index; }));
      }, "remove");
      remove.setAttribute("aria-describedby", title.id);
    });
    empty.hidden = favorites.length > 0;
    empty.textContent = t(known ? "list.empty" : "list.waiting");
    controls();
  }
  function request(type, items) {
    busy = true; controls(); feedback(type === "settings-save" ? "saving" : "connecting");
    var message = { v: 1, type: type, edit: model.edit };
    if (items) message.favorites = items;
    var finished = false;
    function finish(reply) {
      if (finished) return; finished = true; clearTimeout(timeout);
      busy = false;
      if (!reply || typeof reply.status !== "string" || !model.strings["status." + reply.status]) reply = { status: "unknown" };
      if (!reply.view) editable = false;
      render(reply.view);
      feedback(reply.view && !reply.view.editable && reply.status === "ready" ? "storage" : reply.status);
    }
    // Bound a missing native reply too; do not retry an uncertain mutation.
    var timeout = setTimeout(function () { finish({ status: "unknown" }); }, 20000);
    try { bridge.sendMessage("pkjs", message).then(finish, function () { finish({ status: "expired" }); }); }
    catch (_) { finish({ status: "bridge" }); }
  }
  function read() { if (!busy && ready) request("settings-read"); }
  function save(items) { if (!busy && ready && editable) request("settings-save", items); }
  render(model.view);
  function findBridge() {
    if (window.Pebble && typeof window.Pebble.sendMessage === "function" && typeof window.Pebble.addEventListener === "function") {
      bridge = window.Pebble;
      bridge.addEventListener("ready", function (event) {
        if (event.target !== "pkjs" || ready) return;
        ready = true; clearTimeout(bridgeTimer); controls(); read();
      });
      bridgeTimer = setTimeout(function () { if (!ready) feedback("bridge"); }, 5000);
    } else if (bridgeWait < 5000) { bridgeWait += 100; bridgeTimer = setTimeout(findBridge, 100); }
    else feedback("bridge");
  }
  findBridge();
}
export function settingsPage(model) {
  var json = JSON.stringify(model).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  var css = [
    ':root{color-scheme:light dark;--page:#f5f6f8;--surface:#fff;--ink:#192027;--muted:#5f6872;--border:#cfd5dc;--card-border:#dce1e6;--subtle:#e7ebef;--status:#e9edf2;--success:#e4f2e9;--success-ink:#225d3c;--warning:#fff0d3;--warning-ink:#704b0d;--error:#fae8e6;--error-ink:#862d24;--danger:#9a3027;--focus:#176bd4;--primary:#192027;--primary-ink:#fff;--line:#727b85}',
    '@media(prefers-color-scheme:dark){:root{--page:#111418;--surface:#1b2026;--ink:#edf1f5;--muted:#b4bdc7;--border:#485361;--card-border:#39434f;--subtle:#2b333e;--status:#252e39;--success:#183b2a;--success-ink:#afe8c0;--warning:#453618;--warning-ink:#ffe0a3;--error:#492721;--error-ink:#ffc3ba;--danger:#ffb4a8;--focus:#8bbaff;--primary:#e4ebf3;--primary-ink:#16202a;--line:#748495}}',
    '*{box-sizing:border-box}body{margin:0;background:var(--page);color:var(--ink);font:16px/1.45 system-ui,sans-serif}main{max-width:620px;margin:auto;padding:24px 18px 28px}header,.list-header{display:flex;align-items:center;gap:12px}header{justify-content:space-between}.eyebrow{font-size:11px;letter-spacing:.15em;font-weight:750;color:var(--muted);margin:0 0 4px}h1{font-size:30px;letter-spacing:-.04em;line-height:1.15;margin:0}h2{font-size:18px;margin:0}h3{font-size:18px;line-height:1.25;margin:2px 0}.description{color:var(--muted);margin:14px 0 16px;font-size:14px}',
    'button,select{font:inherit;min-height:44px}button{cursor:pointer;border:1px solid var(--border);border-radius:9px;padding:8px 12px;background:var(--surface);color:var(--ink);font-size:14px;font-weight:650}button:disabled{cursor:default;opacity:.5}button:focus-visible,select:focus-visible{outline:3px solid var(--focus);outline-offset:3px}.quiet{background:transparent;border-color:transparent}.primary{display:block;width:100%;margin-top:16px;background:var(--primary);color:var(--primary-ink);border-color:var(--primary);min-height:48px}.status{font-size:14px;margin:0 0 18px;padding:11px 13px;background:var(--status);border-radius:9px;overflow-wrap:anywhere}.status[data-state=saved],.status[data-state=ready]{background:var(--success);color:var(--success-ink)}.status[data-state=conflict],.status[data-state=duplicate]{background:var(--warning);color:var(--warning-ink)}.status[data-state=unknown],.status[data-state=storage],.status[data-state=invalid],.status[data-state=expired],.status[data-state=bridge],.status[data-state=unavailable]{background:var(--error);color:var(--error-ink)}',
    'fieldset{min-width:0;margin:0;padding:18px;border:1px solid var(--card-border);border-radius:12px;background:var(--surface)}legend{font-size:16px;font-weight:700;padding:0 5px}.fields{display:grid;gap:12px}label{display:block;font-size:13px;font-weight:650;margin-bottom:5px}select{display:block;width:100%;min-width:0;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--ink);padding:8px 10px}fieldset:disabled{opacity:.65}.list-header{margin:26px 0 10px}.list-header .quiet{margin-left:auto}.count{font-size:12px;font-weight:650;color:var(--muted);background:var(--subtle);padding:3px 8px;border-radius:20px;white-space:nowrap}',
    '.routes{list-style:none;margin:0;padding:0;display:grid;gap:10px}.route{display:flex;align-items:center;gap:12px;border:1px solid var(--card-border);border-left:4px solid var(--line);background:var(--surface);border-radius:10px;padding:13px 12px}.route-content{min-width:0;flex:1;overflow-wrap:anywhere}.line-name{font-size:11px;font-weight:700;color:var(--muted)}.destination{font-size:14px;color:var(--muted);margin:3px 0 0}.remove{color:var(--danger);background:transparent;border-color:transparent;font-size:12px;padding:8px;flex-shrink:0}.unavailable{font-size:12px;color:var(--error-ink)}.empty{font-size:14px;color:var(--muted);padding:12px 0}.attribution{display:block;color:var(--muted);font-size:11px;overflow-wrap:anywhere;margin-top:24px}@media(min-width:540px){.fields{grid-template-columns:1fr 1fr}.fields>div:first-child{grid-column:1/-1}}'
  ].join('\n');
  var html = '<!doctype html><html lang="' + (model.language === "pt" ? "pt-PT" : "en") + '"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="referrer" content="no-referrer">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; form-action \'none\'; base-uri \'none\'">' +
    '<title>Metro Lisboa</title><style>' + css + '</style></head><body><main></main><script>(' + settingsClient.toString() + ')(' + json + ');</script></body></html>';
  var url = "data:text/html;charset=utf-8," + encodeURIComponent(html);
  if (url.length > 150000) throw new Error("Configuration page too large");
  return url;
}
