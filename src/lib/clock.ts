import { useEffect, useState } from 'react';
import { KEY_PREFIX } from './storage';

// Demo saati. Veriler Pazartesi 23 Kasım 2026'ya göre yazıldı; panel her açılışta
// 10:34'ten başlar ve gerçek zamanla ilerler. Böylece gecikmiş işler, "şimdi" çizgisi
// ve vadeler kim ne zaman açarsa açsın tutarlı görünür.
export const DEMO_DAY = { y: 2026, m: 10, d: 23 } as const; // ay 0'dan başlar
const START_MIN = 10 * 60 + 34;
const CLOCK_KEY = KEY_PREFIX + 'clock-start';

function startedAt(): number {
  try {
    const v = Number(sessionStorage.getItem(CLOCK_KEY));
    if (v > 0) return v;
    const now = Date.now();
    sessionStorage.setItem(CLOCK_KEY, String(now));
    return now;
  } catch {
    return Date.now();
  }
}

let t0 = startedAt();

/** Canlı oturumda bütün cihazlar aynı demo saatini görsün: oturumun başlangıç anı kullanılır */
export function syncClock(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return;
  t0 = ms;
  try {
    sessionStorage.setItem(CLOCK_KEY, String(ms));
  } catch {
    /* depolama kapalı */
  }
}

/** Demo saatinin başladığı an (canlı oturumu başlatan cihaz bunu paylaşır) */
export const clockStart = () => t0;

/** Günün dakikası (10:34 = 634). Gün sonunda 19:00'da durur. */
export function demoMinute(at = Date.now()): number {
  return Math.min(START_MIN + Math.floor((at - t0) / 60000), 19 * 60);
}

export function demoDate(): Date {
  const m = demoMinute();
  return new Date(DEMO_DAY.y, DEMO_DAY.m, DEMO_DAY.d, Math.floor(m / 60), m % 60);
}

export function useDemoMinute(): number {
  const [m, setM] = useState(demoMinute);
  useEffect(() => {
    const id = window.setInterval(() => setM(demoMinute()), 15000);
    return () => window.clearInterval(id);
  }, []);
  return m;
}

export const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
