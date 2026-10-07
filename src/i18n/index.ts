// Current language, text lookup and translated program errors.
import type { SensorType, SlotName } from '../robot/robot';
import type { ProgramError } from '../runner/errors';
import type { ColorName } from '../tracks/surface';
import type { TrackId } from '../tracks/tracks';
import { kk } from './kk';
import { ru, type Dict } from './ru';

export { kk, ru, type Dict };
export type Lang = 'ru' | 'kk';
export type UiKey = keyof typeof ru.ui;

const DICTS: Record<Lang, Dict> = { ru, kk };
let lang: Lang = 'ru';
const listeners = new Set<(l: Lang) => void>();

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang): void {
  if (l === lang) return;
  lang = l;
  for (const cb of listeners) cb(l);
}

export function onLangChange(cb: (l: Lang) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

// Replaces `{name}` with params.name; unknown placeholders are left as they are.
export function t(key: UiKey, params: Record<string, string | number> = {}): string {
  return DICTS[lang].ui[key].replace(/\{(\w+)\}/g, (m, name: string) => name in params ? String(params[name]) : m);
}

export const slotLabel = (s: SlotName) => t(`slot_${s}`);
export const sensorLabel = (type: SensorType) => t(`sensor_${type}`);
export const trackName = (id: TrackId) => t(`track_${id}`);
export const colorLabel = (c: ColorName) => t(`color_${c}`);

export function formatProgramError(e: ProgramError): string {
  const text = errorText(e);
  return e.line === null ? text : `${t('lineN', { line: e.line })}: ${text}`;
}

function errorText(e: ProgramError): string {
  switch (e.kind) {
    case 'SensorError':
      // needed is null when the slot name itself is unknown
      return e.needed
        ? t('sensorMissing', { slot: slotLabel(e.slot as SlotName), sensorGen: t(`sensorGen_${e.needed}`) })
        : t('unknownSlot', { slot: e.slot ?? '' });
    case 'NameError': return e.name === undefined ? e.message : t('nameNotFound', { name: e.name });
    case 'NonLatinName': return t('nameLatinOnly');
    case 'SyntaxError': return t('syntaxError');
    case 'IndentationError': return t('indentationError');
    case 'TypeError': return t('typeError');
    case 'ValueError': return t('valueError');
    case 'ZeroDivisionError': return t('zeroDivisionError');
    case 'IndexError': return t('indexError');
    case 'Other': return e.message;
  }
}
