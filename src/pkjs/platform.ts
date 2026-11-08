import type { SettingsReply, PageRequest } from '../common/types.js';

export type Timer = number;
export interface Timers {
  setTimeout(callback: () => void, delay: number): Timer;
  clearTimeout(id: Timer | null | undefined): void;
}
export interface AppMessageEvent { payload?: { DATA?: unknown } }
export interface ConfigEvent { data: unknown; respond(reply: SettingsReply): void }
interface PebbleEvents {
  ready: unknown; appmessage: AppMessageEvent; showConfiguration: unknown;
  webviewclosed: unknown; configmessage: ConfigEvent;
}
export interface CompanionPebble {
  addEventListener<K extends keyof PebbleEvents>(name: K, callback: (event: PebbleEvents[K]) => void): void;
  removeEventListener?<K extends keyof PebbleEvents>(name: K, callback: (event: PebbleEvents[K]) => void): void;
  sendAppMessage(data: { DATA: string }, success?: () => void, failure?: () => void): void;
  openURL(url: string): unknown;
  sendConfigMessage?(message: unknown): void;
}
export interface SettingsBridge {
  sendMessage(target: 'pkjs', message: PageRequest): Promise<SettingsReply | { error: string } | null>;
  addEventListener(name: 'ready', callback: (event: { target: string }) => void): void;
}
export interface Storage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export type JsonCallback = (error: unknown, data?: unknown) => void;
export type JsonRequester = (path: string, callback: JsonCallback) => (() => void) | void;
// Only the installed Paho API used by this app; no replacement client or runtime shim.
export interface MqttMessage { destinationName: string; payloadBytes: { byteLength: number }; payloadString: string }
interface SubscriptionOptions { timeout: number; onFailure(): void }
export interface MqttClient {
  onConnectionLost: () => void;
  onMessageArrived: (message: MqttMessage) => void;
  connect(options: { userName: string; useSSL: boolean; mqttVersion: number; cleanSession: boolean;
    reconnect: boolean; timeout: number; keepAliveInterval: number; onSuccess(): void; onFailure(): void }): void;
  subscribe(topic: string, options: SubscriptionOptions & { qos: number }): void;
  unsubscribe(topic: string, options: SubscriptionOptions): void;
  disconnect(): void;
}
