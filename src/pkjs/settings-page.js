// This function is serialized into a self-contained data: page; no external assets.
function settingsClient(model) {
  var pt = model.language === "pt";
  function t(en, portuguese) { return pt ? portuguese : en; }
  function node(tag, text, parent) {
    var element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (parent) parent.appendChild(element);
    return element;
  }
  var main = document.querySelector("main");
  node("h1", t("Metro favourites", "Favoritos do Metro"), main);
  var message = node("p", "", main); message.setAttribute("role", "status");
  var statuses = {
    saved: t("Favourites saved on watch.", "Favoritos guardados no relógio."),
    conflict: t("Changed on watch. Review the current list below.", "Alterados no relógio. Reveja a lista atual abaixo."),
    invalid: t("Invalid changes were not saved.", "As alterações inválidas não foram guardadas."),
    storage: t("Watch storage unavailable. Check favourites before retrying.", "Armazenamento do relógio indisponível. Verifique os favoritos antes de tentar novamente."),
    unknown: t("Previous save result unknown. Check the current watch list below.", "Resultado anterior incerto. Verifique a lista atual abaixo.")
  };
  function close(response) {
    var link = node("a", "", document.body);
    link.hidden = true; link.href = "pebblejs://close#" + (response ? encodeURIComponent(JSON.stringify(response)) : "");
    link.click(); link.remove();
  }
  function button(text, parent, action) {
    var element = node("button", text, parent); element.type = "button";
    element.addEventListener("click", action); return element;
  }
  if (!model.edit) {
    var feedback = model.status === "unknown" ? t("Previous save result unknown.", "Resultado anterior incerto.") : model.status === "storage" ? statuses.storage : "";
    message.textContent = feedback + " " + t("This page cannot send changes. Keep Metro connected, resolve any storage error on the watch, then reopen Settings.",
      "Esta página não pode enviar alterações. Mantenha o Metro ligado, resolva erros de armazenamento no relógio e reabra as definições.");
    button(t("Close", "Fechar"), main, function () { close(); }); return;
  }
  message.textContent = statuses[model.status] || t("Edit the draft below. Keep Metro open on the connected watch.",
    "Edite a lista abaixo. Mantenha o Metro aberto no relógio ligado.");
  var favorites = model.favorites.map(function (f) { return f.slice(); });
  var count = node("p", "", main), list = node("ul", undefined, main);
  var network = model.network;
  function name(id, items) {
    var found = items.filter(function (item) { return item.id === id; })[0];
    return found ? found.name : id;
  }
  function served(f) {
    return network.lines.some(function (line) { return line.id === f[1] && line.stations.indexOf(f[0]) !== -1
      && f[0] !== f[2] && (line.stations[0] === f[2] || line.stations[line.stations.length - 1] === f[2]); });
  }
  var picker = node("fieldset", undefined, main);
  node("legend", t("Add favourite", "Adicionar favorito"), picker);
  function select(labelText, id) {
    var label = node("label", labelText, picker); label.htmlFor = id;
    var input = node("select", undefined, picker); input.id = id; return input;
  }
  var line = select(t("Line", "Linha"), "line"), station = select(t("Station", "Estação"), "station"),
    direction = select(t("Direction", "Sentido"), "direction");
  function options(input, items) {
    input.textContent = "";
    items.forEach(function (item) { var option = node("option", item.name, input); option.value = item.id; });
    input.disabled = !items.length;
  }
  function route() { return network.lines.filter(function (item) { return item.id === line.value; })[0]; }
  function directions() {
    var selected = route();
    options(direction, selected ? [selected.stations[0], selected.stations[selected.stations.length - 1]]
      .filter(function (id) { return id !== station.value; })
      .map(function (id) { return { id: id, name: name(id, network.stations) }; }) : []);
  }
  function stations() {
    var selected = route();
    options(station, network.stations.filter(function (item) { return selected && selected.stations.indexOf(item.id) !== -1; }));
    directions();
  }
  options(line, network.lines); stations();
  line.addEventListener("change", stations); station.addEventListener("change", directions);
  var add = button(t("Add", "Adicionar"), picker, function () {
    if (favorites.length >= 16 || !line.value || !station.value || !direction.value) return;
    var f = [station.value, line.value, direction.value];
    if (favorites.some(function (existing) { return existing.join("/") === f.join("/"); })) {
      message.textContent = t("That favourite already exists.", "Esse favorito já existe."); return;
    }
    favorites.push(f); render();
  });
  function render() {
    count.textContent = favorites.length + " / 16"; list.textContent = "";
    favorites.forEach(function (f, index) {
      var label = name(f[0], network.stations) + " — " + name(f[1], network.lines) + " → " + name(f[2], network.stations);
      var row = node("li", undefined, list);
      node("span", label + (served(f) ? "" : t(" (unavailable)", " (indisponível)")), row);
      button(t("Remove", "Remover"), row, function () {
        if (window.confirm(t("Remove this favourite?", "Remover este favorito?") + "\n" + label)) { favorites.splice(index, 1); render(); }
      });
    });
    add.disabled = favorites.length >= 16;
  }
  render();
  node("p", t("Sending closes this page. Check the watch for confirmation; reopening Settings reads the actual saved list.",
    "O envio fecha esta página. Confirme no relógio; reabrir as definições lê a lista guardada."), main);
  var actions = node("div", undefined, main);
  button(t("Cancel", "Cancelar"), actions, function () { close(); });
  button(t("Send to watch", "Enviar para o relógio"), actions, function () {
    if (!favorites.length && model.favorites.length && !window.confirm(t("Remove all favourites?", "Remover todos os favoritos?"))) return;
    close({ v: 1, edit: model.edit, favorites: favorites });
  });
  node("small", t("Contains information from UnderLX (https://underlx.com/), ODbL 1.0 (https://opendatacommons.org/licenses/odbl/1-0/).",
    "Contém informação do UnderLX (https://underlx.com/), ODbL 1.0 (https://opendatacommons.org/licenses/odbl/1-0/)."), main);
}
export function settingsPage(model) {
  // Escaping '<' also prevents an upstream label from terminating the script tag.
  var json = JSON.stringify(model).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  var html = '<!doctype html><html lang="' + (model.language === "pt" ? "pt-PT" : "en") + '"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; form-action \'none\'; base-uri \'none\'">' +
    '<title>Metro Lisboa</title><style>body{font:18px system-ui,sans-serif;margin:0;background:#fff;color:#111}main{max-width:36rem;margin:auto;padding:1rem}label,select{display:block}select,button{font:inherit;min-height:44px;margin:.4rem 0;max-width:100%}select{width:100%}button{padding:.3rem .8rem}button:focus-visible,select:focus-visible{outline:3px solid #005bbb}fieldset{margin:1rem 0}li{margin:1rem 0}li span{display:block}small{display:block;margin-top:1.5rem;overflow-wrap:anywhere}</style></head><body><main></main><script>(' +
    settingsClient.toString() + ')(' + json + ');</script></body></html>';
  var url = "data:text/html;charset=utf-8," + encodeURIComponent(html);
  if (url.length > 150000) throw new Error("Configuration page too large");
  return url;
}
