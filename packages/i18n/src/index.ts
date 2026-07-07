/**
 * @laude/i18n — tiny framework-agnostic locale store + catalogs.
 * RO is the default locale. React binding in ./react.
 */
import { ro, MessageKey } from './catalogs/ro';
import { en } from './catalogs/en';

export type { MessageKey };
export type Locale = 'ro' | 'en';

export const DEFAULT_LOCALE: Locale = 'ro';

const catalogs: Record<Locale, Record<MessageKey, string>> = { ro, en };

let currentLocale: Locale = readStoredLocale() ?? DEFAULT_LOCALE;
const listeners = new Set<() => void>();

function readStoredLocale(): Locale | null {
  if (typeof localStorage === 'undefined') return null;
  const v = localStorage.getItem('laude.locale');
  return v === 'ro' || v === 'en' ? v : null;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  if (typeof localStorage !== 'undefined') localStorage.setItem('laude.locale', locale);
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Translate a key, with optional {placeholder} interpolation. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const raw = catalogs[currentLocale][key] ?? catalogs[DEFAULT_LOCALE][key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] === undefined ? `{${name}}` : String(params[name]),
  );
}

export const LOCALES: { id: Locale; label: string }[] = [
  { id: 'ro', label: 'Română' },
  { id: 'en', label: 'English' },
];
