// Application contracts. Network/bridge input remains unknown until validated.
export interface Station { id: string; name: string; lines: string[] }
export interface Line { id: string; name: string; color: string; stations: string[] }
export interface Network { stations: Station[]; lines: Line[] }
export interface Favorite { station: string; line: string; direction: string }
export type FavoriteTriple = [station: string, line: string, direction: string];
export type FavoriteSlot = FavoriteTriple | null;
export interface LocaleRegistry { fallback: string; locales: Record<string, string> }
export type PhoneStrings = Record<string, string>;
export type PhoneLocales = Record<string, PhoneStrings> & { 'en.json': PhoneStrings };

interface PredictionBase { direction: string; order: number; value: number; received: number; expires: number }
export type Prediction = PredictionBase & (
  | { type: 'e' | 'l' | 'm'; units: 's' | 'm' }
  | { type: 'i'; units: 's' | 'm'; upper: number }
  | { type: 't'; units: 's' }
);
export interface Connection {
  type: 'connection'; status: 'connecting' | 'connected' | 'disconnected'; error?: string; generation?: number;
}
export interface Arrivals { type: 'arrivals'; station: string; at: number; predictions: Prediction[]; generation?: number }
export type FeedEvent = Connection | Arrivals;
export type SettingsStatus = 'ready' | 'saved' | 'conflict' | 'invalid' | 'storage' | 'unknown';
export type PageStatus = SettingsStatus | 'expired' | 'unavailable' | 'busy';
export type FeedbackStatus = PageStatus | 'connecting' | 'saving' | 'duplicate' | 'bridge';
export interface SettingsView { editable: boolean; favorites: FavoriteTriple[]; network: Network }
export interface SettingsReply { status: PageStatus; view: SettingsView | null }
export interface SettingsModel { edit: string; language: 'en' | 'pt'; strings: PhoneStrings; view: SettingsView | null }
export type PageRequest = { v: 1; edit: string } & (
  | { type: 'settings-read' }
  | { type: 'settings-save'; favorites: FavoriteTriple[] }
);
export interface SettingsSnapshot {
  snapshot: number; revision: number; catalog: number; part: number; request: number;
  status: SettingsStatus; writable: boolean; locale: string; favorites: FavoriteSlot[];
}
export type WatchMessage = FeedEvent
  | { type: 'hello'; echo: number; at: number }
  | { type: 'catalog'; cached: boolean; catalogId: number;
      stations: [id: string, name: string, mask: number][];
      lines: [id: string, name: string, color: string, stations: number[]][] }
  | { type: 'settings-get' }
  | { type: 'settings-receipt'; snapshot: number; part: number }
  | { type: 'settings-save'; request: number; revision: number; catalog: number; favorites: FavoriteTriple[] };
