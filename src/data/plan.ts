import type { Data, Engineer, Job, JobType, Trade } from './types';
import { TODAY } from './today';
import { needsTrade } from './derive';
import { t, td } from '../lib/i18n';

// Tahta saatleri: 07:30–18:30
export const DAY_START = 7 * 60 + 30;
export const DAY_END = 18 * 60 + 30;
export const SPAN = DAY_END - DAY_START;
export const SNAP = 15;

/** Planı olmayan iş tahtaya bırakılınca kullanılan tahmini süre (dakika) */
export const DEFAULT_DUR: Record<JobType, number> = {
  breakdown: 90, repair: 75, service: 60, landlord: 60, recall: 120,
  install: 480, survey: 45, appliance: 60, cooling: 90
};

export const durOf = (j: Job) => j.plan?.[1] ?? DEFAULT_DUR[j.type];

/** Tahtada görünen gerçek aralık: bitmiş iş varış–bitiş, sahadaki iş varıştan başlar */
export function spanOf(j: Job, now: number): [number, number] | null {
  if (!j.plan && j.arrived === undefined) return null;
  const start = j.status === 'done' || j.status === 'on_site' ? j.arrived ?? j.plan![0] : j.plan![0];
  if (j.status === 'done' && j.doneAt !== undefined) return [start, Math.max(j.doneAt, start + 15)];
  const end = start + durOf(j);
  if (j.status === 'on_site' && now > end) return [start, now];
  return [start, end];
}

export const dayJobs = (d: Data, eng: string) =>
  d.jobs.filter((j) => j.engineer === eng && j.date === TODAY && (j.plan || j.arrived !== undefined));

/** Aynı mühendiste çakışan iş */
export function clash(d: Data, eng: string, start: number, dur: number, except: string, now: number) {
  return dayJobs(d, eng).find((j) => {
    if (j.id === except) return false;
    const s = spanOf(j, now);
    return s ? start < s[1] && start + dur > s[0] : false;
  });
}

/** Neden atanamaz: gaz işi gaz kaydı, klima işi F-gas belgesi ister */
export function cant(trade: Trade, need: Trade) {
  if (trade === need) return '';
  if (need === 'gas') return t('cant.gas');
  if (need === 'cooling') return t('cant.cool');
  return trade === 'gas' ? t('cant.gasonly') : t('cant.aconly');
}

export const blockedFor = (e: Engineer, j: Job) => (e.off ? td(e.off) : cant(e.trade, needsTrade(j)));

/** Şu andan sonraki ilk boş, çakışmasız başlangıç */
export function nextFree(d: Data, eng: string, now: number, dur: number, except: string) {
  let t = Math.max(8 * 60, Math.ceil((now + 15) / SNAP) * SNAP);
  while (t + dur <= DAY_END) {
    if (!clash(d, eng, t, dur, except, now)) return t;
    t += SNAP;
  }
  return null;
}

/** Başlangıcı içine alan iki saatlik varış aralığı (08–10, 10–12 …) */
export function slotFor(start: number): [number, number] {
  const s = 8 * 60 + Math.floor((start - 8 * 60) / 120) * 120;
  return [s, s + 120];
}

export const inWindow = (j: Job, start: number) => !j.window || (start >= j.window[0] && start < j.window[1]);

export const snap = (min: number) => Math.round(min / SNAP) * SNAP;
export const clampStart = (min: number, dur: number) => Math.max(DAY_START, Math.min(DAY_END - Math.min(dur, SPAN), min));
