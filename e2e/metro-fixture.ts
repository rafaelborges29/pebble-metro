import { test as base, expect, type Page } from '@playwright/test';
import { Effect } from 'effect';
import { writeFileSync } from 'node:fs';
import mqtt from 'mqtt-packet';
import { acquireEmulator, root, type Button, type Loader, type MemorySample, type Platform } from './emulator';

export type Favourite = { station: string; line: string; direction: string };
type PhoneData = { DATA: string };
type WatchCommand = { type: string; session: string; id?: number; part?: number; favorite?: Favourite | null;
  snapshot?: number; revision?: number; catalog?: number; request?: number; status?: string; favorites?: (string[] | null)[] };
type Envelope = { v: number; session: string; id: number; part: number; total: number; text: string };
type SourcePrediction = { direction: string; order: number; value: number; units: Units; type: PredictionType };
type Message = { type: string; station?: string; predictions?: SourcePrediction[]; lines?: unknown[] };
type Batch = { parts: string[]; total: number; message?: Message };
type Listener = (event: unknown) => void;
type Units = 's' | 'm';
type PredictionType = 'e' | 'i' | 'l' | 'm';
type RoutePredictions = { direction: string; values: number[]; units?: Units; type?: PredictionType };
type Publisher = (predictions: SourcePrediction[]) => void;
type DeferredArrival = { started: boolean; resumed: Promise<void>; release(): void };
export interface Metro {
  platform: Platform;
  commands: WatchCommand[];
  subscriptions: string[];
  readonly activeSubscriptions: readonly string[];
  memory: MemorySample[];
  stations: readonly { id: string; name: string }[];
  favourite: Favourite;
  press(button: Button): Promise<void>;
  expectScreen(name: string, loader?: Loader): Promise<void>;
  expectAnimation(loader: Loader): Promise<void>;
  screenshot(): Promise<Buffer>;
  delivered(type: string): Promise<void>;
  relaunch(elapsedSeconds?: number, from?: 'arrivals' | 'root'): Promise<void>;
  startPhone(): Promise<void>;
  publish(values: number[], units?: Units, type?: PredictionType): Promise<void>;
  publishStation(routes: RoutePredictions[]): Promise<void>;
  queueStation(routes: RoutePredictions[]): Promise<() => Promise<void>>;
  deferNextArrival(): { wait(): Promise<void>; release(): void };
  removeLine(id: string): Promise<void>;
  setAutoArrivals(enabled: boolean): void;
  setInternetAllowed(allowed: boolean): void;
  openSettings(): Promise<Page>;
  readonly settingsCloses: number;
  favorites(): Promise<Favourite[]>;
  alterNextSave(patch: Record<string, unknown>): Promise<void>;
  pauseSettings(paused: boolean): void;
}
declare global {
  interface Window {
    sendToWatch(data: PhoneData): Promise<void>;
    observeArrival(raw: string): Promise<void>;
    phoneEvent(name: string, event: unknown): void;
    settingsPatch?: Record<string, unknown>;
    Pebble: {
      addEventListener(name: string, callback: Listener): void;
      removeEventListener(name: string, callback: Listener): void;
      sendAppMessage(data: PhoneData, success?: Listener, failure?: Listener): void;
      openURL(url: string): void;
      sendConfigMessage(message: unknown): void;
    };
  }
}

// Base catalogue facts: UnderLX (https://underlx.com/), ODbL 1.0:
// https://opendatacommons.org/licenses/odbl/1-0/
// Fixture data/additions retain ODbL; harness code is 0BSD. See DATA_METHODS.md.
// These polls only read local event-fed state, never issue browser/watch RPCs.
// Check promptly without changing assertion deadlines or production timers.
const transportPollIntervals = [20, 50, 100];
const topicFor = (station: string) => `json/vehicleeta/pt-ml/${station}/all`;
const favourite: Favourite = { station: 'pt-ml-sa', line: 'pt-ml-red', direction: 'pt-ml-ap' };
const stations = [
  { id: 'pt-ml-ap', name: 'Aeroporto' },
  { id: 'pt-ml-sa', name: 'Saldanha' },
  { id: 'pt-ml-ss', name: 'São Sebastião' },
].map(station => ({ ...station, network: 'pt-ml', lines: ['pt-ml-red'] }));
const lines = [{ network: 'pt-ml', id: 'pt-ml-red', name: 'Vermelha', color: 'ff0000',
  stations: ['pt-ml-ss', 'pt-ml-sa', 'pt-ml-ap'] }];

export const test = base.extend<{ metro: Metro; largeNetwork: boolean; watchLocale: string; hostileLabels: boolean; liveSettings: boolean; internetAllowed: boolean }>({
  largeNetwork: [false, { option: true }],
  hostileLabels: [false, { option: true }],
  liveSettings: [true, { option: true }],
  internetAllowed: [true, { option: true }],
  watchLocale: ['en_US', { option: true }],
  metro: async ({ page, largeNetwork, watchLocale, hostileLabels, liveSettings, internetAllowed }, use, testInfo) => {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const device = yield* acquireEmulator(testInfo);
      yield* device.ready;
      yield* Effect.tryPromise({ catch: cause => cause, try: async () => {
        const commands: WatchCommand[] = [], subscriptions: string[] = [], errors: string[] = [];
        let networkAllowed = internetAllowed;
        const extraStations = largeNetwork ? Array.from({ length: 47 }, (_, i) => ({ network: 'pt-ml',
          id: 'pt-ml-z' + i, name: 'Z station ' + i, lines: ['pt-ml-red'] })) : [];
        const catalogue = [...stations.map(station => ({ ...station, lines: [...station.lines] })), ...extraStations];
        if (hostileLabels) catalogue[1].name = '</script><img src=x onerror=alert(1)>';
        const routes = [{ ...lines[0], stations: ['pt-ml-ss', 'pt-ml-sa', ...extraStations.map(s => s.id), 'pt-ml-ap'] }];
        if (largeNetwork) {
          // Extra lines serve only the last six Z stations. Base stations (and
          // the first sixteen alphabetical choices) remain one-line routes.
          for (const [index, id, name, color] of [
            [0, 'pt-ml-blue', 'Azul', '0000ff'], [1, 'pt-ml-green', 'Verde', '00aa00'],
            [2, 'pt-ml-yellow', 'Amarela', 'ffff00'],
          ] as const) {
            const stops = extraStations.slice(41 + index * 2, 43 + index * 2);
            routes.push({ network: 'pt-ml', id, name, color, stations: stops.map(station => station.id) });
            for (const station of stops) station.lines.push(id);
          }
        }
        catalogue.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
        const network = { stations: catalogue.map(({ id, name, lines }) => ({ id, name, lines })),
          lines: routes.map(({ id, name, color, stations }) => ({ id, name, color: '#' + color, stations })) };
        expect(Buffer.byteLength(JSON.stringify({ type: 'catalog', network, cached: false }))).toBeLessThanOrEqual(4800);
        const expectedCatalog = { type: 'catalog', cached: expect.any(Boolean), catalogId: expect.any(Number),
          stations: catalogue.map(station => [station.id, station.name,
            routes.reduce((mask, line, index) => mask | (station.lines.includes(line.id) ? 1 << index : 0), 0)]),
          lines: routes.map(line => [line.id, line.name, '#' + line.color,
            line.stations.map(id => catalogue.findIndex(station => station.id === id))]) };
        const validTopics = new Set(catalogue.map(station => topicFor(station.id)));
        const publishers = new Map<string, Publisher>();
        let deferredArrival: DeferredArrival | undefined;
        const sent = new Map<string, Batch>(), receipts = new Set<string>();
        const serializedArrivals: Message[] = [];
        const phoneLog: string[] = [], inbox: PhoneData[] = [], configurationUrls: string[] = [];
        const configurationPages: Page[] = [];
        let settingsCloses = 0;
        let phoneReady = false, closing = false, autoArrivals = true, settingsPaused = false, uiStarts = 0, expectedStarts = 1, delivering = Promise.resolve();
        function dispatch(payload: PhoneData) {
          delivering = delivering.then(() => page.evaluate(payload => window.phoneEvent('appmessage', { payload }), payload))
            .catch(error => { if (!closing) errors.push(String(error)); });
        }
        const key = (packet: { session: string; id?: number }) => `${packet.session}/${packet.id}`;
        function track(raw: string) {
          const packet: Envelope = JSON.parse(raw);
          if (!packet.v || !packet.id) return;
          let record = sent.get(key(packet));
          if (!record) { record = { parts: [], total: packet.total }; sent.set(key(packet), record); }
          record.parts[packet.part] = packet.text;
          if (record.parts.filter(part => part !== undefined).length === record.total)
            record.message = JSON.parse(record.parts.join(''));
          return record.message;
        }
        async function delivered(type: string, previous = new Set<string>(), matches = (_message: Message) => true) {
          await expect.poll(() => [...sent].some(([id, record]) => !previous.has(id) && record.message?.type === type
            && matches(record.message) && receipts.has(`${id}/${record.total - 1}`)),
          { message: `${type} consumed by the real watch`, intervals: transportPollIntervals }).toBe(true);
        }
        async function queueStation(routes: RoutePredictions[]) {
          const selected = commands.filter(command => command.type === 'watch').at(-1)?.favorite;
          if (!selected) throw new Error('No selected favourite');
          const topic = topicFor(selected.station);
          await expect.poll(() => publishers.has(topic), { message: `Active arrival subscription for ${selected.station}` }).toBe(true);
          const predictions = routes.flatMap(({ direction, values, units = 'm', type = 'e' }) =>
            values.map((value, index) => ({ direction, order: index + 1, value, units, type })));
          const matches = (message: Message) => message.station === selected.station
            && message.predictions?.length === predictions.length
            && predictions.every(expected => message.predictions!.some(actual => actual.direction === expected.direction
              && actual.order === expected.order && actual.value === expected.value
              && actual.units === expected.units && actual.type === expected.type));
          const previous = new Set(sent.keys()), before = serializedArrivals.length;
          publishers.get(topic)!(predictions);
          await expect.poll(() => serializedArrivals.slice(before).some(matches),
            { message: 'Real phone transport serialized the source snapshot', intervals: transportPollIntervals }).toBe(true);
          return () => delivered('arrivals', previous, matches);
        }
        async function publishStation(routes: RoutePredictions[]) {
          const consumed = await queueStation(routes);
          await consumed();
        }
        async function expectScreen(name: string, loader?: Loader) {
          await expect(async () => {
            const image = Buffer.from(await Effect.runPromise(device.request('screenshot', { mask_clock: true, mask_loader: loader })), 'base64');
            const snapshot = [...(device.platform === 'gabbro' ? ['gabbro'] : []),
              ...(watchLocale === 'pt_PT' ? ['pt-PT'] : []), `${name}.png`];
            expect(image).toMatchSnapshot(snapshot, { threshold: 0, maxDiffPixels: 0 });
          }).toPass({ timeout: 10_000, intervals: [250, 500] });
        }
        try {
          page.on('pageerror', error => errors.push(error.message));
          page.on('console', message => phoneLog.push(`${message.type()}: ${message.text()}`));
          await page.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.href === 'http://metro.test/') {
              return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Metro phone host</title><link rel="icon" href="data:,">' });
            }
            const data: Record<string, unknown> = { '/v1/stations': catalogue, '/v1/lines': routes };
            if (url.origin === 'https://api.underlx.com' && !url.search && route.request().method() === 'GET'
                && Object.hasOwn(data, url.pathname)) {
              // Android's native network gate answers denied HTTP requests with 403.
              if (!networkAllowed) return route.fulfill({ status: 403, body: 'Forbidden', headers: { 'access-control-allow-origin': '*' } });
              return route.fulfill({ json: data[url.pathname], headers: {
                'access-control-allow-origin': '*', 'access-control-expose-headers': 'Date, Age',
                date: new Date().toUTCString(), age: '0',
              } });
            }
            errors.push(`Unexpected network request: ${url.href}`);
            await route.abort();
          });
          await page.routeWebSocket(/.*/, socket => {
            if (socket.url() !== 'wss://perturbacoes.pt/websocket/') {
              errors.push(`Unexpected WebSocket: ${socket.url()}`);
              socket.close();
              return;
            }
            if (!networkAllowed) { socket.close(); return; }
            const parser = mqtt.parser();
            const send = (packet: mqtt.Packet) => socket.send(mqtt.generate(packet));
            parser.on('error', (error: Error) => errors.push(error.message));
            parser.on('packet', (packet: mqtt.Packet) => {
              if (packet.cmd === 'connect') {
                if (packet.username !== 'ws' || packet.protocolVersion !== 4) errors.push('Unexpected MQTT connection parameters');
                send({ cmd: 'connack', returnCode: 0, sessionPresent: false });
              } else if (packet.cmd === 'subscribe') {
                send({ cmd: 'suback', messageId: packet.messageId, granted: packet.subscriptions.map(() => 0 as const) });
                for (const subscription of packet.subscriptions) {
                  const topic = subscription.topic;
                  subscriptions.push(topic);
                  if (!validTopics.has(topic)) { errors.push(`Unexpected topic: ${topic}`); continue; }
                  const publish: Publisher = predictions => {
                    const payload = predictions.map(prediction => ({ ...prediction, lower: prediction.value,
                      upper: prediction.value + 1, made: Date.now() / 1000, validFor: 120 }));
                    send({ cmd: 'publish', topic, qos: 0, retain: true, dup: false, payload: Buffer.from(JSON.stringify(payload)) });
                  };
                  publishers.set(topic, publish);
                  const selected = commands.filter(command => command.type === 'watch').at(-1)?.favorite;
                  const station = catalogue.find(station => topicFor(station.id) === topic)!;
                  const direction = selected?.station === station.id ? selected.direction
                    : station.id === 'pt-ml-ap' ? 'pt-ml-ss' : 'pt-ml-ap';
                  // Minute-unit defaults keep ordinary screenshots stable.
                  if (autoArrivals) publish([3, 4, 5].map((value, index) => ({ direction, order: index + 1, type: 'e', units: 'm', value })));
                }
              } else if (packet.cmd === 'unsubscribe') {
                for (const topic of packet.unsubscriptions) {
                  if (!validTopics.has(topic)) errors.push(`Unexpected unsubscribe: ${topic}`);
                  publishers.delete(topic);
                }
                send({ cmd: 'unsuback', messageId: packet.messageId, granted: [] });
              } else if (packet.cmd === 'pingreq') send({ cmd: 'pingresp' });
              else if (packet.cmd !== 'disconnect') errors.push(`Unexpected MQTT packet: ${packet.cmd}`);
            });
            socket.onMessage(message => parser.parse(typeof message === 'string' ? Buffer.from(message) : message));
          });
          await page.exposeFunction('configurationOpened', (url: string) => { configurationUrls.push(url); });
          await page.exposeFunction('observeArrival', (raw: string) => { serializedArrivals.push(JSON.parse(raw)); });
          await page.exposeFunction('sendToWatch', async (data: PhoneData) => {
            const message = track(data.DATA);
            const gate = deferredArrival;
            if (gate && !gate.started && message?.type === 'arrivals') {
              // Hold the final real chunk: native reassembly cannot apply it yet.
              gate.started = true;
              await gate.resumed;
              if (deferredArrival === gate) deferredArrival = undefined;
            }
            await Effect.runPromise(device.request('send', { data: data.DATA }));
          });
          await page.addInitScript(() => {
            // Observe queue entry without changing any bytes, values or application model.
            const stringify = JSON.stringify;
            JSON.stringify = function (...args: [unknown, ...unknown[]]) {
              if ((args[0] as { type?: string; request?: number } | null)?.type === 'settings-save'
                && typeof (args[0] as { request?: number }).request === 'number' && window.settingsPatch) {
                args[0] = { ...(args[0] as Record<string, unknown>), ...window.settingsPatch };
                delete window.settingsPatch;
              }
              const raw = Reflect.apply(stringify, JSON, args);
              if ((args[0] as { type?: string } | null)?.type === 'arrivals') void window.observeArrival(raw);
              return raw;
            };
            const listeners: Record<string, Listener[]> = {};
            window.Pebble = {
              addEventListener(name, callback) { (listeners[name] ||= []).push(callback); },
              removeEventListener(name, callback) { listeners[name] = (listeners[name] || []).filter(fn => fn !== callback); },
              sendAppMessage(data, success, failure) { window.sendToWatch(data).then(() => success?.({}), () => failure?.({})); },
              openURL(url) { void (window as unknown as { configurationOpened(url: string): Promise<void> }).configurationOpened(url); },
              sendConfigMessage() { /* Capability present independently of the preview toggle. */ },
            };
            window.phoneEvent = (name, event) => { for (const callback of listeners[name] || []) callback(event); };
          });
          device.onMessage = data => {
            const raw = data[10000];
            if (typeof raw !== 'string') return;
            const payload = { DATA: raw };
            const command: WatchCommand = JSON.parse(raw);
            commands.push(command);
            if (!['hello', 'ack', 'watch', 'catalog', 'refresh', 'settings-state'].includes(command.type))
              errors.push(`Unexpected watch command: ${command.type}`);
            if (command.type === 'ack') receipts.add(`${key(command)}/${command.part}`);
            if (settingsPaused && command.type === 'settings-state') return;
            if (phoneReady) dispatch(payload);
            else inbox.push(payload);
          };
          async function startPhone() {
            phoneReady = false;
            await delivering;
            publishers.clear();
            await page.goto('http://metro.test/');
            sent.clear(); receipts.clear(); serializedArrivals.length = 0;
            await page.addScriptTag({ content: phoneBundle + '\n//# sourceURL=pebble-js-app.js' });
            await page.evaluate(() => window.phoneEvent('ready', {}));
            phoneReady = true;
            for (const payload of inbox.splice(0)) dispatch(payload);
            if (!networkAllowed) {
              await expect.poll(() => phoneLog.some(line => line.includes('UnderLX HTTP 403'))).toBe(true);
              return;
            }
            await delivered('catalog');
            for (const record of sent.values()) if (record.message?.type === 'catalog')
              expect(record.message).toEqual(expectedCatalog);
          }
          let reportedLocale = '';
          device.onLog = message => {
            if (message === 'Metro native UI ready') uiStarts++;
            if (message.startsWith('Metro locale=')) reportedLocale = message.slice('Metro locale='.length);
          };
          if (watchLocale !== 'en_US') await Effect.runPromise(device.request('locale', { locale: watchLocale }));
          // Pebble names the PBW after the checkout directory, not package.json.
          const phoneBundle = await Effect.runPromise(device.request('install', { path: root + '/build/' + root.split('/').pop() + '.pbw' }));
          // The native app announces readiness only after its first real draw.
          await expect.poll(() => uiStarts, { message: 'First native Metro draw completed' }).toBe(1);
          expect(reportedLocale, 'Actual SDK system locale').toBe(watchLocale);
          await expectScreen('connecting', 'empty');
          await startPhone();
          const metro: Metro = {
            platform: device.platform,
            commands, subscriptions, memory: device.memory, stations: catalogue, favourite,
            get activeSubscriptions() { return [...publishers.keys()]; },
            async press(button) { await Effect.runPromise(device.request('press', { button })); },
            expectScreen, delivered, startPhone,
            async screenshot() { return Buffer.from(await Effect.runPromise(device.request('screenshot', {})), 'base64'); },
            setAutoArrivals(enabled) { autoArrivals = enabled; },
            setInternetAllowed(allowed) { networkAllowed = allowed; },
            pauseSettings(paused) { settingsPaused = paused; },
            async alterNextSave(patch) { await page.evaluate(value => { window.settingsPatch = value; }, patch); },
            async favorites() {
              let found: (string[] | null)[] | undefined;
              await expect.poll(() => {
                const session = commands.filter(command => command.type === 'hello').at(-1)?.session;
                const states = commands.filter(command => command.type === 'settings-state' && command.session === session);
                const latest = states.at(-1);
                if (!latest) return false;
                const parts = new Map(states.filter(state => state.snapshot === latest.snapshot).map(state => [state.part, state.favorites!]));
                if (parts.size !== 4) return false;
                found = [0, 1, 2, 3].flatMap(part => parts.get(part)!); return true;
              }, { message: 'Complete native favourites snapshot' }).toBe(true);
              return found!.filter((f): f is string[] => f !== null).map(f => ({ station: f[0], line: f[1], direction: f[2] }));
            },
            get settingsCloses() { return settingsCloses; },
            async openSettings() {
              const before = configurationUrls.length;
              await page.evaluate(() => window.phoneEvent('showConfiguration', {}));
              await expect.poll(() => configurationUrls.length).toBe(before + 1);
              const config = await page.context().newPage(); configurationPages.push(config);
              config.on('pageerror', error => errors.push(error.message));
              await config.route('**/*', route => { errors.push(`Settings attempted network: ${route.request().url()}`); return route.abort(); });
              await config.exposeFunction('configurationClosed', async () => {
                settingsCloses++;
                await page.evaluate(() => window.phoneEvent('webviewclosed', { response: '{}' }));
              });
              await config.exposeFunction('configurationMessage', async (message: unknown) => {
                try {
                  return await page.evaluate(data => new Promise(resolve => {
                    window.phoneEvent('configmessage', { data, respond: resolve });
                  }), message);
                } catch (error) {
                  if (String(error).includes('Execution context was destroyed')) return { status: 'expired', view: null };
                  throw error;
                }
              });
              await config.addInitScript(enabled => {
                if (enabled) Object.defineProperty(window, 'Pebble', { value: {
                  sendMessage(target: string, message: unknown) {
                    if (target !== 'pkjs') return Promise.reject(new Error('Unknown configuration target'));
                    return (window as unknown as { configurationMessage(message: unknown): Promise<unknown> }).configurationMessage(message);
                  },
                  addEventListener(name: string, callback: (event: { target: string }) => void) {
                    if (name === 'ready') callback({ target: 'pkjs' });
                  },
                }, configurable: true });
                document.addEventListener('click', event => {
                  const link = event.target as HTMLAnchorElement;
                  if (link.tagName === 'A' && link.href.startsWith('pebblejs://close#')) {
                    event.preventDefault();
                    void (window as unknown as { configurationClosed(url: string): Promise<void> }).configurationClosed(link.href);
                  }
                });
              }, liveSettings);
              await config.goto(configurationUrls.at(-1)!);
              return config;
            },
            async expectAnimation(loader) {
              const initial = await Effect.runPromise(device.request('screenshot', { crop_loader: loader }));
              await expect.poll(() => Effect.runPromise(device.request('screenshot', { crop_loader: loader })),
                { message: 'Native train animation advances', timeout: 5000 }).not.toBe(initial);
            },
            async publish(values, units = 'm', type = 'e') {
              const selected = commands.filter(command => command.type === 'watch').at(-1)?.favorite;
              if (!selected) throw new Error('No selected favourite');
              await publishStation([{ direction: selected.direction, values, units, type }]);
            },
            publishStation, queueStation,
            deferNextArrival() {
              if (deferredArrival) throw new Error('An arrival is already deferred');
              let release!: () => void;
              const resumed = new Promise<void>(resolve => { release = resolve; });
              const gate = deferredArrival = { started: false, resumed, release };
              return {
                async wait() { await expect.poll(() => gate.started, { message: 'Real arrival chunk held before native delivery' }).toBe(true); },
                release,
              };
            },
            async removeLine(id) {
              const index = routes.findIndex(line => line.id === id);
              if (index <= 0) throw new Error('Only a secondary fixture line can be removed');
              routes.splice(index, 1);
              for (const station of catalogue) station.lines = station.lines.filter(line => line !== id);
              const previous = new Set(sent.keys());
              const session = commands.filter(command => command.type === 'hello').at(-1)?.session;
              if (!session) throw new Error('No watch session');
              // Trigger real companion metadata refresh while the native picker stays open.
              dispatch({ DATA: JSON.stringify({ v: 1, session, type: 'catalog' }) });
              await delivered('catalog', previous, message => message.lines?.length === routes.length);
            },
            async relaunch(elapsedSeconds = 0, from = 'arrivals') {
              if (from === 'arrivals') await metro.press('back'); // Arrivals -> favourites root.
              await metro.press('back'); // Close the real native app.
              phoneReady = false;
              await delivering;
              await page.goto('http://metro.test/'); // End the previous PKJS lifecycle.
              publishers.clear(); inbox.length = 0;
              if (elapsedSeconds) await Effect.runPromise(device.request('time', { seconds: Math.floor(Date.now() / 1000) + elapsedSeconds }));
              expectedStarts++;
              await Effect.runPromise(device.request('launch', {}));
              await expect.poll(() => uiStarts, { message: 'Restored native Metro draw completed' }).toBe(expectedStarts);
              // Inspect persistent watch data BEFORE starting a new phone runtime.
            },
          };
          await use(metro);
          await delivering;
          expect(uiStarts, 'No unexpected native app restart').toBe(expectedStarts);
          expect(errors).toEqual([]);
        } finally {
          deferredArrival?.release();
          try {
            const image = Buffer.from(await Effect.runPromise(device.request('screenshot', {})), 'base64');
            await testInfo.attach('watch at end', { body: image, contentType: 'image/png' });
          } catch { /* Startup/connection failure: scoped release still saves logs. */ }
          closing = true;
          for (const config of configurationPages) if (!config.isClosed()) await config.close();
          await page.close();
          writeFileSync(testInfo.outputPath('phone.log'), phoneLog.join('\n'));
          writeFileSync(testInfo.outputPath('messages.json'), JSON.stringify({ commands, subscriptions, activeSubscriptions: [...publishers.keys()], errors,
            memory: device.memory, serializedArrivals, messages: [...sent.values()].map(record => record.message) }, null, 2));
        }
      } });
    })));
  },
});
export { expect };
