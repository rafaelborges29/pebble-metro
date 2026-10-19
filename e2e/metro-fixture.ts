import { test as base, expect } from '@playwright/test';
import { Effect } from 'effect';
import { writeFileSync } from 'node:fs';
import mqtt from 'mqtt-packet';
import { acquireEmulator, root, type Button, type Loader } from './emulator';

type Favourite = { station: string; line: string; direction: string };
type PhoneData = { DATA: string };
type WatchCommand = { type: string; session: string; id?: number; part?: number; favorite?: Favourite | null };
type Envelope = { v: number; session: string; id: number; part: number; total: number; text: string };
type Batch = { parts: string[]; total: number; message?: { type: string } };
type Listener = (event: unknown) => void;
interface Metro {
  commands: WatchCommand[];
  subscriptions: string[];
  favourite: Favourite;
  press(button: Button): Promise<void>;
  expectScreen(name: string, loader?: Loader): Promise<void>;
  delivered(type: string): Promise<void>;
  relaunch(): Promise<void>;
}
declare global {
  interface Window {
    sendToWatch(data: PhoneData): Promise<void>;
    phoneEvent(name: string, event: unknown): void;
    Pebble: {
      addEventListener(name: string, callback: Listener): void;
      removeEventListener(name: string, callback: Listener): void;
      sendAppMessage(data: PhoneData, success?: Listener, failure?: Listener): void;
    };
  }
}

const topic = 'json/vehicleeta/pt-ml/pt-ml-sa/all';
const favourite: Favourite = { station: 'pt-ml-sa', line: 'pt-ml-red', direction: 'pt-ml-ap' };
const stations = [
  { id: 'pt-ml-ap', name: 'Aeroporto' },
  { id: 'pt-ml-sa', name: 'Saldanha' },
  { id: 'pt-ml-ss', name: 'São Sebastião' },
].map(station => ({ ...station, network: 'pt-ml', lines: ['pt-ml-red'] }));
const lines = [{ network: 'pt-ml', id: 'pt-ml-red', name: 'Vermelha', color: 'ff0000',
  stations: ['pt-ml-ss', 'pt-ml-sa', 'pt-ml-ap'] }];

export const test = base.extend<{ metro: Metro }>({
  metro: async ({ page }, use, testInfo) => {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const device = yield* acquireEmulator(testInfo);
      yield* device.ready;
      yield* Effect.tryPromise({ catch: cause => cause, try: async () => {
        const commands: WatchCommand[] = [], subscriptions: string[] = [], errors: string[] = [];
        const sent = new Map<string, Batch>(), receipts = new Set<string>();
        const phoneLog: string[] = [], inbox: PhoneData[] = [];
        let phoneReady = false, closing = false, sdkStarts = 0, delivering = Promise.resolve();
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
        }
        async function delivered(type: string) {
          await expect.poll(() => [...sent].some(([id, record]) => record.message?.type === type
            && receipts.has(`${id}/${record.total - 1}`)), { message: `${type} consumed by the real watch` }).toBe(true);
        }
        async function expectScreen(name: string, loader?: Loader) {
          await expect(async () => {
            const image = Buffer.from(await Effect.runPromise(device.request('screenshot', { mask_clock: true, mask_loader: loader })), 'base64');
            expect(image).toMatchSnapshot(`${name}.png`, { threshold: 0, maxDiffPixels: 0 });
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
            const data: Record<string, unknown> = { '/v1/stations': stations, '/v1/lines': lines, '/v1/disturbances': [] };
            if (url.origin === 'https://api.underlx.com' && Object.hasOwn(data, url.pathname)) {
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
                  subscriptions.push(subscription.topic);
                  if (subscription.topic !== topic) { errors.push(`Unexpected topic: ${subscription.topic}`); continue; }
                  // Real minute-unit estimates keep the snapshot stable for a minute.
                  const predictions = [3, 4, 5].map((value, index) => ({
                    direction: favourite.direction, order: index + 1, type: 'e', units: 'm', value,
                    made: Date.now() / 1000, validFor: 120,
                  }));
                  send({ cmd: 'publish', topic, qos: 0, retain: true, dup: false, payload: Buffer.from(JSON.stringify(predictions)) });
                }
              } else if (packet.cmd === 'unsubscribe') send({ cmd: 'unsuback', messageId: packet.messageId, granted: [] });
              else if (packet.cmd === 'pingreq') send({ cmd: 'pingresp' });
            });
            socket.onMessage(message => parser.parse(typeof message === 'string' ? Buffer.from(message) : message));
          });
          await page.exposeFunction('sendToWatch', async (data: PhoneData) => {
            track(data.DATA);
            await Effect.runPromise(device.request('send', { data: data.DATA }));
          });
          await page.addInitScript(() => {
            const listeners: Record<string, Listener[]> = {};
            window.Pebble = {
              addEventListener(name, callback) { (listeners[name] ||= []).push(callback); },
              removeEventListener(name, callback) { listeners[name] = (listeners[name] || []).filter(fn => fn !== callback); },
              sendAppMessage(data, success, failure) { window.sendToWatch(data).then(() => success?.({}), () => failure?.({})); },
            };
            window.phoneEvent = (name, event) => { for (const callback of listeners[name] || []) callback(event); };
          });
          device.onMessage = data => {
            // SDK 4.33.1 announces construction of its native message inbox.
            if (data[15025] === 1) { sdkStarts++; return; }
            const raw = data[10000];
            if (typeof raw !== 'string') return;
            const payload = { DATA: raw };
            const command: WatchCommand = JSON.parse(raw);
            commands.push(command);
            if (command.type === 'ack') receipts.add(`${key(command)}/${command.part}`);
            if (phoneReady) dispatch(payload);
            else inbox.push(payload);
          };
          async function startPhone() {
            phoneReady = false;
            await delivering;
            await page.goto('http://metro.test/');
            sent.clear(); receipts.clear();
            await page.addScriptTag({ content: phoneBundle + '\n//# sourceURL=pebble-js-app.js' });
            await page.evaluate(() => window.phoneEvent('ready', {}));
            phoneReady = true;
            for (const payload of inbox.splice(0)) dispatch(payload);
            await delivered('catalog');
          }
          const phoneBundle = await Effect.runPromise(device.request('install', { path: root + '/build/pebble-metro.pbw' }));
          // A completed transfer is not a ready app: wait for the real SDK
          // inbox handshake, then its native frame, before the phone's probe.
          await expect.poll(() => sdkStarts, { message: 'Alloy inbox initialized' }).toBeGreaterThan(0);
          await expectScreen('connecting', 'empty');
          await startPhone();
          const metro: Metro = {
            commands, subscriptions, favourite,
            async press(button) { await Effect.runPromise(device.request('press', { button })); },
            expectScreen, delivered,
            async relaunch() {
              await metro.press('back');
              await metro.press('back');
              phoneReady = false;
              await delivering;
              await page.goto('http://metro.test/'); // End the previous PKJS lifecycle.
              const previousStart = sdkStarts;
              await Effect.runPromise(device.request('launch', {}));
              await expect.poll(() => sdkStarts, { message: 'New Alloy inbox initialized' }).toBeGreaterThan(previousStart);
              await expectScreen('connecting-saved', 'arrivals');
              await startPhone();
            },
          };
          await use(metro);
          await delivering;
          expect(errors).toEqual([]);
        } finally {
          try {
            const image = Buffer.from(await Effect.runPromise(device.request('screenshot', {})), 'base64');
            await testInfo.attach('watch at end', { body: image, contentType: 'image/png' });
          } catch { /* Startup/connection failure: scoped release still saves logs. */ }
          closing = true;
          await page.close();
          writeFileSync(testInfo.outputPath('phone.log'), phoneLog.join('\n'));
          writeFileSync(testInfo.outputPath('messages.json'), JSON.stringify({ commands, subscriptions, errors }, null, 2));
        }
      } });
    })));
  },
});
export { expect };
