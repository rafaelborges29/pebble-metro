import { arrivalLabel, exactSeconds } from './display.js';

export const MAX_FAVORITES = 16;
export const SERVICE_TTL = 90000;

// The watch owns countdown expiry and alerts, even if the phone stops sending.
export class WatchModel {
  constructor() {
    this.network = null;
    this.favorites = [];
    this.index = 0;
    this.link = false;
    this.connection = 'connecting';
    this.arrivals = Object.create(null);
    this.service = { ok: false, updated: 0, disturbances: [] };
    this.armed = null;
    this.alert = null;
    this.serviceBaseline = false;
    this.serviceSignatures = Object.create(null);
  }
  get favorite() { return this.favorites[this.index] || null; }
  setLink(connected) {
    this.link = connected;
    if (!connected) {
      this.arrivals = Object.create(null);
      this.service.ok = false;
      this.serviceBaseline = false;
      if (this.armed) this.armed.previous = undefined;
    }
  }
  receive(data, offset, now) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'connection') {
      if (['connecting', 'connected', 'disconnected'].includes(data.status)) this.connection = data.status;
      this.error = typeof data.error === 'string' ? data.error.slice(0, 100) : '';
      if (data.status !== 'connected' && this.armed) this.armed.previous = undefined;
    } else if (data.type === 'arrivals') {
      if (typeof data.station !== 'string' || !Array.isArray(data.predictions)) return;
      const allowed = [this.favorite, this.armed && this.armed.favorite, this.alert && this.alert.favorite].filter(Boolean);
      if (!allowed.some(f => f.station === data.station)) return;
      if (!Number.isFinite(data.at) || now - (data.at + offset) > 120000 || data.at + offset > now + 30000) return;
      const previous = this.arrivals[data.station];
      if (previous && data.at < previous.at) return;
      const generation = Number.isSafeInteger(data.generation) && data.generation >= 0 ? data.generation : 0;
      if (this.feedGeneration !== undefined && generation !== this.feedGeneration && this.armed) this.armed.previous = undefined;
      this.feedGeneration = generation;
      const predictions = data.predictions.filter(p => p && Number.isFinite(p.received) && Number.isFinite(p.expires)
        && Number.isFinite(p.value) && ['e', 't', 'l', 'm', 'i'].includes(p.type)
        && ['s', 'm'].includes(p.units) && Number.isInteger(p.order) && p.order >= 1 && p.order <= 3
        && typeof p.direction === 'string' && p.expires >= p.received && p.expires - p.received <= 120000
        && (p.type !== 'i' || (Number.isFinite(p.upper) && p.upper >= p.value)))
        .map(p => ({ ...p, value: p.type === 't' ? p.value + offset / 1000 : p.value,
          received: p.received + offset, expires: p.expires + offset }));
      if (this.armed && this.armed.favorite.station === data.station && previous) {
        const old = previous.predictions.find(p => p.direction === this.armed.favorite.direction && p.order === 1);
        if (!old || old.expires <= now) this.armed.previous = undefined;
      }
      this.arrivals[data.station] = { at: data.at, predictions };
    } else if (data.type === 'service') {
      if (data.ok !== true) { this.service.ok = false; return; }
      if (!Number.isFinite(data.updated) || !Array.isArray(data.disturbances)) return;
      if (data.updated + offset > now + 30000 || now - (data.updated + offset) >= SERVICE_TTL) return;
      if (data.updated + offset < this.service.updated) return;
      const disturbances = data.disturbances.filter(d => d && typeof d.id === 'string' && typeof d.line === 'string'
        && typeof d.description === 'string' && Number.isFinite(d.updated));
      if (now - this.service.updated >= SERVICE_TTL) this.serviceBaseline = false;
      const signatures = Object.create(null);
      let changed = false;
      for (const d of disturbances) {
        const signature = d.description;
        signatures[d.id] = signature;
        if (this.serviceBaseline && this.serviceSignatures[d.id] !== signature
          && this.favorites.some(f => f.line === d.line)) changed = true;
      }
      this.serviceSignatures = signatures;
      this.serviceBaseline = true;
      this.service = { ok: true, updated: data.updated + offset, disturbances };
      return changed ? 'service' : undefined;
    }
  }
  predictions(favorite, now) {
    if (!this.link || !favorite) return [];
    const record = this.arrivals[favorite.station];
    return record ? record.predictions.filter(p => p.direction === favorite.direction && arrivalLabel(p, now))
      .sort((a, b) => a.order - b.order) : [];
  }
  status(now) {
    if (!this.link) return 'OFFLINE';
    if (this.predictions(this.favorite, now).length) return 'LIVE';
    if (this.favorite && this.arrivals[this.favorite.station]) {
      return this.arrivals[this.favorite.station].predictions.length ? 'STALE' : 'NO ESTIMATE';
    }
    return this.connection === 'connected' ? 'WAITING' : 'CONNECTING';
  }
  serviceCurrent(now) { return this.link && this.service.ok && now - this.service.updated < SERVICE_TTL; }
  incidents(line, now) { return this.serviceCurrent(now) ? this.service.disturbances.filter(d => d.line === line) : []; }
  arm(now) {
    const favorite = this.favorite;
    const p = this.predictions(favorite, now).find(p => p.order === 1);
    const seconds = p && exactSeconds(p, now);
    if (!Number.isFinite(seconds)) return 'Wait for a fresh exact estimate.';
    if (seconds <= 120) return 'Already under 2 min. No alert armed.';
    this.armed = { favorite: { ...favorite }, previous: seconds };
    return null;
  }
  tick(now) {
    if (!this.armed) return false;
    const prediction = this.predictions(this.armed.favorite, now).find(p => p.order === 1);
    const seconds = prediction && exactSeconds(prediction, now);
    if (!Number.isFinite(seconds) || this.connection !== 'connected') {
      this.armed.previous = undefined;
      return false;
    }
    const crossed = this.armed.previous > 120 && seconds <= 120;
    this.armed.previous = seconds;
    if (!crossed) return false;
    this.alert = { favorite: this.armed.favorite };
    this.armed = null;
    return true;
  }
  prune() {
    const stations = [this.favorite, this.armed && this.armed.favorite, this.alert && this.alert.favorite].filter(Boolean).map(f => f.station);
    for (const id of Object.keys(this.arrivals)) if (!stations.includes(id)) delete this.arrivals[id];
  }
}

export function validSavedFavorite(f) {
  return f && ['station', 'line', 'direction'].every(k => typeof f[k] === 'string' && /^pt-ml-[a-z0-9-]{1,40}$/.test(f[k]));
}

// Bounded, ordered reassembly. A failed/incomplete batch can never renew an ETA.
export function createReceiver(session, deliver) {
  let batch = null, last = 0;
  return (raw, now) => {
    try {
      if (typeof raw !== 'string' || raw.length > 3500) return;
      const packet = JSON.parse(raw);
      if (packet.v !== 1 || packet.session !== session || !Number.isSafeInteger(packet.id) || packet.id <= 0
        || !Number.isInteger(packet.total) || packet.total < 1 || packet.total > 32
        || !Number.isInteger(packet.part) || packet.part < 0 || packet.part >= packet.total
        || typeof packet.text !== 'string' || packet.text.length > 500) return;
      if (packet.id <= last) return true; // ACK an immutable retry of an already consumed batch.
      if (batch && now - batch.progress > 20000) batch = null;
      if (!batch || packet.id !== batch.id) {
        if (packet.part !== 0 || (batch && packet.id < batch.id)) return;
        batch = { id: packet.id, total: packet.total, text: '', next: 0, bytes: 0, lastText: '', progress: now };
      }
      if (batch.total !== packet.total) { batch = null; return; }
      if (packet.part < batch.next) return packet.part === batch.next - 1 && batch.lastText === packet.text;
      if (packet.part !== batch.next) { batch = null; return; }
      batch.bytes += encodeURIComponent(packet.text).replace(/%[A-F\d]{2}/gi, 'x').length;
      if (batch.bytes > 5000) { batch = null; return; }
      batch.text += packet.text;
      batch.lastText = packet.text;
      batch.next++;
      batch.progress = now;
      if (batch.next === batch.total) {
        const message = JSON.parse(batch.text);
        last = batch.id;
        batch = null;
        deliver(message);
      }
      return true;
    } catch (_) { batch = null; }
  };
}

// Bounded word wrapping keeps surrogate pairs together.
export function paginate(text, columns = 23, lines = 5, measure) {
  const fits = value => value.length <= columns && (!measure || measure(value));
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ');
  const rows = [];
  let row = '';
  for (let word of words) {
    if (row && !fits(row + ' ' + word)) { rows.push(row); row = ''; }
    while (!fits(word)) {
      let cut = Math.min(columns, word.length);
      while (cut > 1 && !fits(word.slice(0, cut))) cut--;
      if (word.charCodeAt(cut - 1) >= 0xD800 && word.charCodeAt(cut - 1) <= 0xDBFF
        && word.charCodeAt(cut) >= 0xDC00 && word.charCodeAt(cut) <= 0xDFFF) cut += cut === 1 ? 1 : -1;
      rows.push(word.slice(0, cut)); word = word.slice(cut);
    }
    if (word) row = row ? row + ' ' + word : word;
  }
  if (row || !rows.length) rows.push(row);
  const pages = [];
  for (let i = 0; i < rows.length; i += lines) pages.push(rows.slice(i, i + lines).join('\n'));
  return pages;
}
