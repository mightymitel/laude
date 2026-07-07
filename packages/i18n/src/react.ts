import { useSyncExternalStore } from 'react';
import { getLocale, subscribe, t, type Locale, setLocale } from './index';

/** Re-renders on locale change; returns the translate function. */
export function useT(): typeof t {
  useSyncExternalStore(subscribe, getLocale, getLocale);
  return t;
}

export function useLocale(): [Locale, (l: Locale) => void] {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  return [locale, setLocale];
}
