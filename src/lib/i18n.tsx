import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { DATA_TR, STR, type Key } from './strings';

export type Lang = 'en' | 'tr';
export type Theme = 'light' | 'dark';
export interface Prefs { lang: Lang; theme: Theme; chosen: boolean }

// Tercihler "wr:" önekiyle saklanmaz: "Demo verisini sıfırla" bunları silmesin
const PREFS_KEY = 'wr-prefs';
const DEFAULTS: Prefs = { lang: 'en', theme: 'light', chosen: false };

function readPrefs(): Prefs {
  let p: Partial<Prefs> = {};
  try {
    p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
  } catch {
    p = {};
  }
  // ?lang=tr&theme=dark: siteden gelen bağlantı dili ve temayı belirler; rehber yine ilk girişte açılır
  const q = new URLSearchParams(location.search);
  const ql = q.get('lang'), qt = q.get('theme');
  const lang = ql === 'tr' || ql === 'en' ? ql : p.lang === 'tr' ? 'tr' : DEFAULTS.lang;
  const theme = qt === 'dark' || qt === 'light' ? qt : p.theme === 'dark' ? 'dark' : DEFAULTS.theme;
  return { lang, theme, chosen: p.chosen === true };
}

// Şu anki dil modül düzeyinde tutulur; dil değişince uygulama yeniden kurulur (bkz. main.tsx)
let current: Lang = readPrefs().lang;
export const getLang = () => current;

export function t(key: Key, vars?: Record<string, string | number>) {
  const s: string = STR[key][current === 'en' ? 0 : 1];
  return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : s;
}

/** Sayıya bağlı metin: n = 1 ise varsa "anahtar.1" kullanılır (İngilizce tekil) */
export function tn(key: Key, n: number, vars?: Record<string, string | number>) {
  const one = `${key}.1`;
  return t(n === 1 && one in STR ? (one as Key) : key, { n, ...vars });
}

/** Verideki sabit ifade (izin, uzmanlık, kaynak) Türkçe arayüzde çevrilir */
export const td = (s: string) => (current === 'tr' ? DATA_TR[s] ?? s : s);

interface Ctx { prefs: Prefs; set: (p: Partial<Prefs>) => void }
const C = createContext<Ctx | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  current = prefs.lang;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.lang = prefs.lang === 'tr' ? 'tr' : 'en-GB';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', prefs.theme === 'dark' ? '#141413' : '#F4F4F0');
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* depolama kapalı: tercih yalnızca bu oturumda geçerli */
    }
  }, [prefs]);

  const set = useCallback((p: Partial<Prefs>) => setPrefs((old) => ({ ...old, ...p })), []);
  return <C.Provider value={{ prefs, set }}>{children}</C.Provider>;
}

export function usePrefs() {
  const c = useContext(C);
  if (!c) throw new Error('PrefsProvider is missing');
  return c;
}
