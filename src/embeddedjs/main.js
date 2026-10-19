import Poco from 'commodetto/Poco';
import Button from 'pebble/button';
import Message from 'pebble/message';
import Timer from 'timer';
import { directions, favoriteKey, parseFavorites, arrivalLabel } from 'display';
import { WatchModel, createReceiver, validSavedFavorite, paginate, MAX_FAVORITES } from 'watch-model';

console.log('Metro Alloy watch started');
const model = new WatchModel();
let preferences = { haptics: false, serviceHaptics: false };
let storageError = false;
try {
  const saved = JSON.parse(localStorage.getItem('preferences') || '{}');
  if (Array.isArray(saved.favorites)) model.favorites = saved.favorites.filter(validSavedFavorite).slice(0, MAX_FAVORITES).map(f => {
    const result = { station: f.station, line: f.line, direction: f.direction };
    for (const key of ['stationName', 'lineName', 'directionName', 'color']) {
      if (typeof f[key] === 'string' && f[key].length <= 80) result[key] = f[key];
    }
    return result;
  });
  model.index = Number.isInteger(saved.index) && saved.index >= 0 && saved.index < model.favorites.length ? saved.index : 0;
  preferences.haptics = saved.haptics === true;
  preferences.serviceHaptics = saved.serviceHaptics === true;
} catch (_) { storageError = true; }

let view = model.favorite ? 'arrivals' : 'empty';
let row = 0, page = 0, history = [], draft = {}, notice = '', pages = [], detailTitle = '', serviceLine = '', serviceIncident = 0;
let session, receiver, offset, ready = false, writable = false, pending = [], helloAt = 0, lastSync = 0;
let lastNow = Date.now(), signature = '', repeatTimer, focused = true;
let phoneDisconnected = false, loadingStage = '', loadingSince = lastNow;
// Poco avoids a tree of native UI objects: important inside the watch's 128 KiB budget.
const render = new Poco(screen);
const colors = { black: render.makeColor(0, 0, 0), white: render.makeColor(255, 255, 255),
  yellow: render.makeColor(255, 255, 0), gray: render.makeColor(238, 238, 238), muted: render.makeColor(170, 170, 170) };
const fonts = {};
function font(size, bold) {
  const name = size === 30 ? 'Bitham-Black' : size === 42 ? 'Bitham-Bold' : bold ? 'Gothic-Bold' : 'Gothic-Regular';
  const key = name + size;
  if (!fonts[key]) fonts[key] = new render.Font(name, size);
  return fonts[key];
}
function fitsBody(text) { return render.getTextWidth(text, font(18, false)) <= 182; }
function pagesFor(text) { return paginate(text, 23, 5, fitsBody); }
function label(text, x, y, width, height, size = 18, bold = false, color = 'black') {
  const face = font(size, bold);
  let value = String(text);
  if (render.getTextWidth(value, face) > width) {
    while (value.length && render.getTextWidth(value + '…', face) > width) {
      let end = value.length - 1;
      if (value.charCodeAt(end - 1) >= 0xD800 && value.charCodeAt(end - 1) <= 0xDBFF
        && value.charCodeAt(end) >= 0xDC00 && value.charCodeAt(end) <= 0xDFFF) end--;
      value = value.slice(0, end);
    }
    value += '…';
  }
  render.drawText(value, face, colors[color], x, y + Math.max(0, Math.floor((height - face.height) / 2)));
}
function rectangle(color, x, y, width, height) { render.fillRectangle(colors[color], x, y, width, height); }
function loader(x, y, phase) {
  for (let i = 0; i < 3; i++) rectangle(i === phase ? 'black' : 'muted', x + i * 20, y, 8, 8);
}
function loadingState(now, status) {
  let stage = '';
  if ((view === 'empty' || view === 'arrivals') && !phoneDisconnected && !model.error
    && status !== 'STALE' && status !== 'NO ESTIMATE' && status !== 'LIVE') {
    if (!ready) stage = 'Connecting to phone';
    else if (!model.network) stage = 'Loading stations';
    else if (view === 'arrivals' && model.connection !== 'disconnected') stage = 'Waiting for arrivals';
  }
  const key = stage ? stage + '/' + (model.favorite ? favoriteKey(model.favorite) : '') : '';
  if (key !== loadingStage) { loadingStage = key; loadingSince = now; }
  if (!stage) return null;
  const elapsed = Math.max(0, now - loadingSince), active = elapsed < 15000;
  return { stage, active, phase: active ? focused ? Math.floor(elapsed / 1000) % 3 : 0 : undefined,
    failure: stage === 'Connecting to phone' ? 'Phone not responding' : stage === 'Loading stations' ? 'Station data unavailable' : 'No arrivals received' };
}
function save() {
  try {
    localStorage.setItem('preferences', JSON.stringify({ favorites: model.favorites, index: model.index, ...preferences }));
    storageError = false;
    return true;
  } catch (_) { storageError = true; return false; }
}
function favoriteInfo(favorite) {
  if (!favorite) return { station: 'Metro Lisboa', direction: '', line: '', color: '#000000' };
  const network = model.network;
  const station = network && network.stations.find(s => s.id === favorite.station);
  const destination = network && network.stations.find(s => s.id === favorite.direction);
  const line = network && network.lines.find(l => l.id === favorite.line);
  return {
    station: station ? station.name : favorite.stationName || favorite.station,
    direction: destination ? destination.name : favorite.directionName || favorite.direction,
    line: line ? line.name : favorite.lineName || favorite.line,
    color: line ? line.color : /^#[\da-f]{6}$/i.test(favorite.color || '') ? favorite.color : '#000000',
  };
}
function enrich(favorite) {
  const info = favoriteInfo(favorite);
  return { station: favorite.station, line: favorite.line, direction: favorite.direction,
    stationName: info.station, lineName: info.line, directionName: info.direction, color: info.color };
}
function go(next, push = true) {
  if (push) history.push({ view, row, page, pages, detailTitle, serviceIncident });
  view = next; row = 0; page = 0;
  draw();
}
function back() {
  const dismissedAlert = view === 'alert';
  if (dismissedAlert) model.alert = null;
  if (view === 'favorites' || view === 'empty') { Natives.metro_exit(); return; }
  const previous = history.pop();
  if (previous) ({ view, row, page, pages, detailTitle, serviceIncident } = previous);
  else { view = 'favorites'; row = 0; }
  if (dismissedAlert) sync();
  draw();
}
function showNotice(text) { notice = text; go('notice'); }
function showText(title, text) {
  const nextPages = pagesFor(text);
  go('text'); detailTitle = title; pages = nextPages; draw();
}
function bare(f) { return f ? { station: f.station, line: f.line, direction: f.direction } : null; }
function queue(command) {
  pending = pending.filter(p => p.type !== command.type);
  pending.push(command);
  drain();
}
function drain() {
  if (!writable || !pending.length) return;
  const command = pending.shift();
  if (command.type === 'hello') { command.now = Date.now(); helloAt = command.now; }
  writable = false;
  try { message.write(new Map([['DATA', JSON.stringify({ v: 1, session, ...command })]])); }
  catch (error) {
    console.log('Watch send failed: ' + error.message);
    pending.unshift(command);
    Timer.set(() => { writable = true; drain(); }, 1000);
  }
}
function sync() {
  model.prune();
  if (ready) {
    queue({ type: 'watch', favorite: bare(view === 'alert' && model.alert ? model.alert.favorite : model.favorite), armed: bare(model.armed && model.armed.favorite) });
    if (!model.network) queue({ type: 'catalog' });
  }
  lastSync = Date.now();
}
function newSession() {
  session = Date.now().toString(36) + '-' + Math.floor(Math.random() * 100000).toString(36);
  console.log('Metro session: ' + session);
  receiver = createReceiver(session, receive);
  offset = undefined; ready = false; pending = []; loadingStage = '';
  model.arrivals = Object.create(null); model.connection = 'connecting'; model.error = '';
  if (model.armed) model.armed.previous = undefined;
  queue({ type: 'hello' });
  draw();
}
function validCatalog(network) {
  return network && Array.isArray(network.stations) && network.stations.length > 0 && network.stations.length <= 100
    && Array.isArray(network.lines) && network.lines.length > 0 && network.lines.length <= 10
    && network.stations.every(s => s && typeof s.id === 'string' && typeof s.name === 'string' && s.name.length <= 80 && Array.isArray(s.lines))
    && network.lines.every(l => l && typeof l.id === 'string' && typeof l.name === 'string' && typeof l.color === 'string' && Array.isArray(l.stations));
}
function receive(data) {
  const now = Date.now();
  if (data && data.type === 'hello') {
    if (data.echo !== helloAt || !Number.isFinite(data.at)) return;
    // Earliest possible clock offset: expiry can be early by outbound latency, never late.
    offset = helloAt - data.at;
    ready = true; phoneDisconnected = false; model.setLink(true); sync();
  } else if (ready && data && data.type === 'catalog') {
    if (!validCatalog(data.network)) { model.error = 'Invalid station metadata'; draw(); return; }
    model.network = data.network; model.cached = data.cached === true;
    const selected = model.favorite && favoriteKey(model.favorite);
    // An older phone cache must not erase a favourite from a newer network.
    const valid = model.cached ? model.favorites : parseFavorites(JSON.stringify(model.favorites), model.network);
    const removed = model.favorites.length - valid.length;
    model.favorites = valid.map(enrich);
    model.index = Math.max(0, model.favorites.findIndex(f => favoriteKey(f) === selected));
    if (view === 'empty' && model.favorite) view = 'arrivals';
    if (!model.favorite && view === 'arrivals') view = 'empty';
    if (row >= menu().length) row = 0;
    save(); sync();
    if (removed) showNotice('Some saved directions changed in the network. Please add them again.');
  } else if (ready && Number.isFinite(offset)) {
    const event = model.receive(data, offset, now);
    if (event === 'service' && preferences.serviceHaptics && focused) pulse(true);
  }
  if (focused) tickAlert(now);
  else if (model.armed) model.armed.previous = undefined;
  draw();
}
function pulse(service) {
  try { Natives.metro_pulse(service ? 1 : 0); }
  catch (error) { console.log('Vibration unavailable: ' + error.message); }
}
function tickAlert(now) {
  if (model.tick(now)) {
    if (preferences.haptics) pulse(false);
    go('alert'); sync();
  }
}
function refresh() {
  model.setLink(false);
  newSession();
}
function menu() {
  if (view === 'favorites') return [
    ...model.favorites.map(f => ({ text: favoriteInfo(f).station, detail: favoriteInfo(f).direction, run: () => {
      model.index = model.favorites.indexOf(f); save(); history = []; go('arrivals'); sync();
    } })),
    { text: '+ Add favourite', run: () => {
      if (!model.network) { refresh(); showNotice('Waiting for station data. Check the Android Pebble app and retry.'); }
      else if (model.favorites.length >= MAX_FAVORITES) showNotice('Limit: 16 favourites. Remove one first.');
      else go('stations');
    } },
    { text: 'Network status', run: () => showText('Network status', 'Phone: ' + (model.link ? 'connected' : 'disconnected')
      + '. Feed: ' + model.connection + '. Stations: ' + (model.network ? model.cached ? 'cached' : 'current' : 'waiting')
      + '. Service: ' + (model.serviceCurrent(Date.now()) ? 'current' : 'unavailable') + '. ' + (model.error || '')
      + (storageError ? ' Storage unavailable; changes are in memory only.' : '')) },
    { text: 'Settings', run: () => go('settings') },
    { text: 'About / data', run: () => showText('About Metro', 'Metro Lisboa 0.1.0. Independent watch app. Data: UnderLX (underlx.com), ODbL 1.0, opendatacommons.org/licenses/odbl/1-0/. Live estimates, not guarantees. Direct source through Android; no homeserver. Alerts only while Metro runs.') },
  ];
  if (view === 'stations') return model.network.stations.map(s => ({ text: s.name, run: () => {
    draft.station = s.id;
    const lines = model.network.lines.filter(l => s.lines.includes(l.id));
    if (lines.length === 1) { draft.line = lines[0].id; go('directions'); }
    else go('lines');
  } }));
  if (view === 'lines') return model.network.lines.filter(l => l.stations.includes(draft.station)).map(l => ({ text: l.name, run: () => {
    draft.line = l.id; go('directions');
  } }));
  if (view === 'directions') return directions(model.network, draft.station, draft.line).map(id => ({
    text: model.network.stations.find(s => s.id === id).name,
    run: () => {
      const f = { station: draft.station, line: draft.line, direction: id };
      let index = model.favorites.findIndex(x => favoriteKey(x) === favoriteKey(f));
      if (index < 0) { index = model.favorites.length; model.favorites.push(enrich(f)); }
      model.index = index; history = []; view = 'arrivals'; row = 0;
      const saved = save(); sync(); draw();
      if (!saved) showNotice('Storage unavailable. Favourite saved for this run only.');
    },
  }));
  if (view === 'actions') return [
    { text: model.armed ? 'Cancel arrival alert' : 'Alert at 2 min', run: () => {
      if (model.armed) { model.armed = null; back(); sync(); }
      else {
        const error = model.arm(Date.now());
        if (error) showNotice(error);
        else { sync(); showNotice('Alert armed. Keep Metro open. Closing the app cancels it. Stale data pauses it.'); }
      }
    } },
    { text: 'Line status', run: () => {
      serviceLine = model.favorite.line; serviceIncident = 0;
      go('service');
    } },
    { text: 'Retry live data', run: () => { refresh(); back(); } },
    { text: 'Remove favourite', run: () => go('remove') },
  ];
  if (view === 'remove') return [
    { text: 'Keep favourite', run: back },
    { text: 'Remove it', run: () => {
      const key = favoriteKey(model.favorite);
      if (model.armed && favoriteKey(model.armed.favorite) === key) model.armed = null;
      model.favorites.splice(model.index, 1); model.index = Math.max(0, model.index - 1);
      save(); history = []; view = 'favorites'; row = 0; sync(); draw();
    } },
  ];
  if (view === 'settings') return [
    { text: 'Arrival buzz: ' + (preferences.haptics ? 'on' : 'off'), run: () => { preferences.haptics = !preferences.haptics; save(); draw(); } },
    { text: 'Service buzz: ' + (preferences.serviceHaptics ? 'on' : 'off'), run: () => {
      preferences.serviceHaptics = !preferences.serviceHaptics; model.serviceBaseline = false; save(); draw();
    } },
    { text: 'Alert information', run: () => showText('Quiet alerts', 'Visual alerts are always available. Buzz is optional and respects watch Quiet Time. Only while Metro is running. A fresh two-minute crossing is needed. Already under two minutes? No surprise buzz. An interrupted feed pauses the alert.') },
  ];
  return [];
}
function lisbonClock(time) {
  const date = new Date(time), year = date.getUTCFullYear();
  const lastSunday = month => { const last = new Date(Date.UTC(year, month + 1, 0, 1)); return last.getTime() - last.getUTCDay() * 86400000; };
  const daylight = time >= lastSunday(2) && time < lastSunday(9);
  const local = new Date(time + (daylight ? 3600000 : 0));
  return String(local.getUTCHours()).padStart(2, '0') + ':' + String(local.getUTCMinutes()).padStart(2, '0');
}
function press(type) {
  if (type === 'back') { back(); return; }
  if (type === 'select') {
    if (view === 'arrivals') go('actions');
    else if (view === 'empty') {
      if (model.network) { history = []; go('favorites'); const add = menu().find(item => item.text === '+ Add favourite'); add.run(); }
      else refresh();
    } else if (view === 'notice') back();
    else if (view === 'alert') { model.alert = null; back(); }
    else if (view === 'text' || view === 'service') back();
    else { const items = menu(); if (items[row]) items[row].run(); }
  } else if (type === 'up' || type === 'down') {
    const delta = type === 'down' ? 1 : -1;
    if (view === 'arrivals' && model.favorites.length) {
      model.index = (model.index + delta + model.favorites.length) % model.favorites.length;
      save(); sync();
    } else if (view === 'service') {
      const count = model.incidents(serviceLine, Date.now()).length;
      if (delta > 0 && page === pages.length - 1 && serviceIncident < count - 1) { serviceIncident++; page = 0; }
      else if (delta < 0 && page === 0 && serviceIncident > 0) { serviceIncident--; page = 999; }
      else page = Math.max(0, Math.min(pages.length - 1, page + delta));
    } else if (view === 'text') page = Math.max(0, Math.min(pages.length - 1, page + delta));
    else if (view === 'notice') { const count = pagesFor(notice).length; page = Math.max(0, Math.min(count - 1, page + delta)); }
    else { const count = menu().length; if (count) row = (row + delta + count) % count; }
  }
  draw();
}
function draw() {
  const now = Date.now(), favorite = model.favorite;
  const status = model.status(now);
  let content;
  if (view === 'arrivals' && !favorite) view = 'empty';
  const loading = loadingState(now, status);
  const loadingStatus = loading && (loading.active ? loading.stage === 'Connecting to phone' ? 'CONNECTING' : 'LOADING' : 'UNAVAILABLE');
  if (view === 'arrivals' || view === 'alert') {
    const target = view === 'alert' ? model.alert && model.alert.favorite : favorite;
    const info = favoriteInfo(target);
    const predictions = model.predictions(target, now);
    const labels = model.link ? predictions.map(p => arrivalLabel(p, now)).filter(Boolean) : [];
    const first = labels[0];
    let footer = 'Select: actions  ' + (model.index + 1) + '/' + model.favorites.length;
    let warning = false;
    if (model.incidents(target && target.line, now).length) { footer = '! Service issue: Select'; warning = true; }
    if (model.armed) footer = 'Armed: ' + favoriteInfo(model.armed.favorite).station;
    if (view === 'alert') { footer = 'Select: dismiss'; warning = true; }
    if (storageError) footer = 'Storage unavailable';
    content = { type: 'arrivals', status: loadingStatus || (view === 'alert' && model.link ? labels.length ? 'ARRIVAL ALERT' : 'NO ESTIMATE' : status), info,
      loading: loading && loading.phase,
      title: view === 'alert' ? 'Arrival soon' : info.station,
      eta: first ? first.value : '--:--', unit: first ? first.unit : '',
      next: labels.slice(1, 3).map(l => l.value + (l.unit === 'min' && l.value.includes(':') ? '' : ' ' + l.unit)).join('   /   '),
      message: loading ? loading.active ? loading.stage : loading.failure : labels.length ? '' : status === 'OFFLINE' ? 'Phone disconnected' : view === 'alert' ? 'Estimate unavailable' : status === 'STALE' ? 'Waiting for fresh data' : status === 'NO ESTIMATE' ? 'No live estimate' : model.error || 'Waiting for UnderLX',
      footer, warning };
  } else if (view === 'empty') content = { type: loading && loading.active ? 'loading' : 'text',
    status: loadingStatus || (model.link ? model.error ? 'UNAVAILABLE' : 'METRO LISBOA' : 'OFFLINE'), title: 'Your Metro.',
    loading: loading && loading.phase,
    text: loading ? loading.active ? loading.stage : loading.failure : model.network ? 'Save a station and direction. No GPS needed.'
      : phoneDisconnected ? 'Phone disconnected. Open the Pebble app and retry.' : model.error || 'Open the Pebble app on your phone and retry.',
    footer: 'Select: add / retry' };
  else if (view === 'notice') {
    const noticePages = pagesFor(notice);
    content = { type: 'text', status: 'METRO LISBOA', title: 'Metro', text: noticePages[page] || '', footer: 'Select: back  ' + (page + 1) + '/' + noticePages.length };
  } else if (view === 'service') {
    const current = model.serviceCurrent(now), incidents = model.incidents(serviceLine, now);
    // Page one incident at a time; concatenating eight notices exhausts XS RAM.
    serviceIncident = Math.min(serviceIncident, Math.max(0, incidents.length - 1));
    const incident = incidents[serviceIncident];
    const text = !current ? 'Status unavailable. Last known information is not current. Retry from actions.'
      : !incident ? 'No ongoing disturbances reported for this line. UnderLX checked ' + lisbonClock(model.service.updated) + ' Lisbon time.'
        : incident.description + ' Updated ' + lisbonClock(incident.updated) + ' Lisbon time. '
          + (incident.official ? 'Official report via UnderLX.' : 'Community report via UnderLX.');
    pages = pagesFor(text);
    page = Math.min(page, pages.length - 1);
    const line = model.network && model.network.lines.find(l => l.id === serviceLine);
    content = { type: 'text', status: current ? 'SERVICE STATUS' : 'STATUS UNAVAILABLE', title: line ? line.name : 'Line status',
      text: pages[page], footer: (incidents.length > 1 ? 'Issue ' + (serviceIncident + 1) + '/' + incidents.length + '  ' : 'Up/Down: page  ') + (page + 1) + '/' + pages.length };
  } else if (view === 'text') content = { type: 'text', status: 'METRO LISBOA', title: detailTitle, text: pages[page] || '', footer: 'Up/Down: page  ' + (page + 1) + '/' + pages.length };
  else {
    const items = menu();
    const start = Math.floor(row / 4) * 4;
    content = { type: 'menu', status: 'METRO LISBOA', title: ({ favorites: 'Favourites', stations: 'Station', lines: 'Line', directions: 'Direction', actions: 'Actions', remove: 'Remove it?', settings: 'Settings' })[view],
      items: items.slice(start, start + 4).map((item, i) => ({ text: item.text, detail: item.detail, selected: start + i === row })),
      footer: 'Up/Down: choose  ' + (row + 1) + '/' + items.length };
  }
  const nextSignature = JSON.stringify([lisbonClock(now), content]);
  if (signature === nextSignature) return;
  signature = nextSignature;
  render.begin();
  rectangle('white', 0, 0, render.width, render.height);
  rectangle(content.warning ? 'yellow' : 'black', 0, 0, render.width, 24);
  const headerColor = content.warning ? 'black' : 'white';
  label(content.status, 8, 0, 144, 23, 14, true, headerColor);
  label(lisbonClock(now), 155, 0, 43, 23, 14, false, headerColor);
  if (content.type === 'arrivals') {
    label(content.title, 10, 28, 182, 31, content.title.length > 21 ? 18 : 24, true);
    const rgb = parseInt(content.info.color.slice(1), 16);
    render.fillRectangle(render.makeColor(rgb >> 16, (rgb >> 8) & 255, rgb & 255), 10, 65, 4, 14);
    label(content.info.line, 19, 59, 174, 25, 18, true);
    label('→ ' + content.info.direction, 10, 82, 184, 26, 18);
    if (typeof content.loading === 'number') loader(10, 130, content.loading);
    else {
      const numeric = /^\d+(?::\d+)?$/.test(content.eta);
      const showUnit = content.unit && !content.eta.includes(':') && content.eta !== 'Due';
      label(content.eta, 10, 108, showUnit ? 126 : 182, 52, numeric ? content.eta.length > 5 ? 30 : 42 : 24, true);
      if (showUnit) label(content.unit, 142, 120, 50, 35, 18);
    }
    label(content.next || content.message || (content.eta === 'Due' ? 'at platform' : ''), 10, 163, 182, 29, 18);
  } else {
    label(content.title || '', 10, 27, 182, 31, (content.title || '').length > 18 ? 18 : 24, true);
    if (content.type === 'loading') {
      loader(10, 85, content.loading);
      label(content.text, 10, 113, 182, 28, 18);
    }
    else if (content.type === 'menu') content.items.forEach((item, i) => {
      const y = 61 + i * 34;
      if (item.selected) rectangle('black', 0, y, render.width, 34);
      label(item.text, 10, y, 182, item.detail ? 20 : 32, 18, false, item.selected ? 'white' : 'black');
      if (item.detail) label(item.detail, 10, y + 17, 182, 17, 14, false, item.selected ? 'white' : 'black');
    });
    else String(content.text).split('\n').forEach((line, i) => {
      // Empty-state text uses the same bounded wrapping as notices.
      if (String(content.text).includes('\n')) label(line, 10, 65 + i * 24, 182, 25, 18);
    });
    if (content.type === 'text' && !String(content.text).includes('\n')) {
      pagesFor(content.text)[0].split('\n').forEach((line, i) => label(line, 10, 65 + i * 24, 182, 25, 18));
    }
  }
  rectangle(content.warning ? 'yellow' : 'gray', 0, 202, render.width, 26);
  label(content.footer, 8, 202, 190, 25, 14, true);
  render.end();
}

const message = new Message({
  keys: ['DATA'], input: 4096, output: 1024,
  onReadable() {
    try {
      const raw = this.read().get('DATA');
      if (!receiver || !receiver(raw, Date.now())) return;
      const packet = JSON.parse(raw);
      if (packet.v === 1 && packet.session === session && Number.isSafeInteger(packet.id) && packet.id > 0
        && Number.isInteger(packet.part) && packet.part >= 0 && packet.part < 32)
        queue({ type: 'ack', id: packet.id, part: packet.part });
    }
    catch (error) { console.log('Invalid phone message: ' + error.message); }
  },
  onWritable() {
    writable = true;
    if (!session) newSession();
    drain();
  },
  // Also called during a normal outgoing send; it is not a disconnect notification.
  onSuspend() { writable = false; },
});
new Button({ types: ['up', 'down', 'select', 'back'], onPush(down, type) {
  if (!down) { if (repeatTimer) { Timer.clear(repeatTimer); repeatTimer = undefined; } return; }
  press(type);
  if (type === 'up' || type === 'down') {
    if (repeatTimer) Timer.clear(repeatTimer);
    repeatTimer = Timer.set(() => press(type), 500, 160);
  }
} });
watch.addEventListener('connected', () => {
  const connected = !!(watch.connected.app && watch.connected.pebblekit);
  const wasConnected = model.link;
  phoneDisconnected = !watch.connected.app;
  model.setLink(connected);
  if (!connected) { ready = false; pending = []; }
  else if (!wasConnected) newSession();
  draw();
});
watch.addEventListener('didFocus', inFocus => {
  if (!inFocus) {
    // Never deliver a delayed threshold buzz when a system overlay had focus.
    if (model.armed) model.armed.previous = undefined;
  }
});
watch.addEventListener('didFocus', inFocus => { focused = inFocus; });
Timer.repeat(() => {
  const now = Date.now();
  if (now < lastNow || now - lastNow > 5000) { model.setLink(false); newSession(); }
  lastNow = now;
  if (!ready && now - helloAt > 10000 && writable) queue({ type: 'hello' });
  if (ready && now - lastSync > 15000) sync();
  if (focused) tickAlert(now);
  else if (model.armed) model.armed.previous = undefined;
  draw();
}, 1000);
draw();
