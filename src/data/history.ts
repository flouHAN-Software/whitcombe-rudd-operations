import type { Engineer, Trade } from './types';
import { addDays } from './billing';

// Raporlar için son 12 haftanın kurgusal geçmişi (31 Ağustos – 22 Kasım 2026).
// Sabit tohumla üretilir; her açılışta aynı sayılar çıkar. Bugünkü veriyle uyumlu olacak şekilde ayarlandı:
// - 31 Ağustos İngiltere'de resmî tatil (Summer bank holiday), o hafta 4 iş günü
// - 12 Ekim haftasında ilk soğuklar: kombi arızaları artar, randevuya yetişme düşer
// - klima işleri mevsim bittikçe azalır
// - Chris'in işleri sık uzar (randevuya yetişmesi düşük), Rhys'te parça araçta olmadığı için ilk ziyarette çözme düşük
// - izin haftaları: Gemma 14 Eylül, Aled 26 Ekim (okul tatili), Kasia 9 Kasım

export const WEEKS: string[] = Array.from({ length: 12 }, (_, i) => addDays('2026-08-31', i * 7));
export const COLD_WEEK = 6; // 12 Ekim haftası

interface Profile { perDay: number; onTime: number; ftf: number; mins: number }

const PROFILE: Record<string, Profile> = {
  dan: { perDay: 4.4, onTime: 0.9, ftf: 0.86, mins: 72 },
  sam: { perDay: 5.0, onTime: 0.94, ftf: 0.93, mins: 58 },
  kasia: { perDay: 4.2, onTime: 0.92, ftf: 0.85, mins: 74 },
  lee: { perDay: 5.2, onTime: 0.95, ftf: 0.95, mins: 55 },
  rhys: { perDay: 4.1, onTime: 0.9, ftf: 0.78, mins: 76 },
  gemma: { perDay: 4.8, onTime: 0.93, ftf: 0.91, mins: 62 },
  joel: { perDay: 1.6, onTime: 0.96, ftf: 0.9, mins: 236 },
  marcus: { perDay: 5.0, onTime: 0.91, ftf: 0.74, mins: 52 },
  aled: { perDay: 4.6, onTime: 0.92, ftf: 0.7, mins: 56 },
  chris: { perDay: 4.4, onTime: 0.84, ftf: 0.69, mins: 66 },
  imran: { perDay: 3.2, onTime: 0.93, ftf: 0.88, mins: 90 }
};

/** Mevsim etkisi: kombi işleri Ekim'de artar, klima azalır */
const SEASON: Record<Trade, number[]> = {
  gas: [1, 0.97, 0.98, 1, 1.04, 1.08, 1.19, 1.15, 1.11, 1.13, 1.15, 1.18],
  appliance: [1, 1.02, 0.98, 1, 1.01, 0.99, 1.02, 1, 0.98, 1.03, 1, 1.01],
  cooling: [1.3, 1.2, 1.08, 0.97, 0.86, 0.77, 0.72, 0.66, 0.62, 0.6, 0.57, 0.55]
};
/** İlk soğuklarda herkesin randevuya yetişmesi düşer */
const RUSH = [0, 0, 0, 0, 0, -0.02, -0.08, -0.05, -0.01, 0, 0, 0];
const LEAVE: Record<string, number[]> = { gemma: [2], aled: [8], kasia: [10] };

export interface EngWeek {
  jobs: number;
  late: number;
  fixed: number;
  mins: number;
}

export interface History {
  weeks: string[];
  /** mühendis kimliği → 12 haftalık kayıt */
  eng: Record<string, EngWeek[]>;
}

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function buildHistory(engineers: Engineer[]): History {
  const r = rng(20261123);
  const eng: History['eng'] = {};
  for (const e of engineers) {
    const p = PROFILE[e.id] ?? { perDay: 4.5, onTime: 0.92, ftf: 0.85, mins: 65 };
    eng[e.id] = WEEKS.map((_, w) => {
      if (LEAVE[e.id]?.includes(w)) return { jobs: 0, late: 0, fixed: 0, mins: 0 };
      const days = w === 0 ? 4 : 5;
      const jobs = Math.round(p.perDay * days * SEASON[e.trade][w] * (0.94 + 0.12 * r()));
      const onTime = clamp(p.onTime + RUSH[w] + (r() - 0.5) * 0.05, 0.6, 1);
      const ftf = clamp(p.ftf + (r() - 0.5) * 0.06, 0.5, 1);
      return {
        jobs,
        late: Math.round(jobs * (1 - onTime)),
        fixed: Math.round(jobs * ftf),
        mins: Math.round(jobs * p.mins * (0.95 + 0.1 * r()))
      };
    });
  }
  return { weeks: WEEKS, eng };
}

/* ---------- toplamlar ---------- */

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export function byTradeWeekly(h: History, engineers: Engineer[]) {
  const trades: Trade[] = ['gas', 'appliance', 'cooling'];
  return h.weeks.map((week, w) => {
    const row = { week, total: 0 } as { week: string; total: number } & Record<Trade, number>;
    for (const t of trades) {
      row[t] = sum(engineers.filter((e) => e.trade === t).map((e) => h.eng[e.id][w].jobs));
      row.total += row[t];
    }
    return row;
  });
}

export function onTimeWeekly(h: History) {
  return h.weeks.map((week, w) => {
    const all = Object.values(h.eng).map((x) => x[w]);
    const jobs = sum(all.map((x) => x.jobs));
    const late = sum(all.map((x) => x.late));
    return { week, jobs, late, pct: jobs ? (jobs - late) / jobs : 0 };
  });
}

/** İlk ziyarette çözülme: son 4 hafta ve 12 haftalık ortalama, uzmanlığa göre */
export function firstFixByTrade(h: History, engineers: Engineer[]) {
  const trades: Trade[] = ['gas', 'appliance', 'cooling'];
  return trades.map((trade) => {
    const rows = engineers.filter((e) => e.trade === trade).map((e) => h.eng[e.id]);
    const pct = (from: number) => {
      const ws = rows.flatMap((x) => x.slice(from));
      const jobs = sum(ws.map((x) => x.jobs));
      return jobs ? sum(ws.map((x) => x.fixed)) / jobs : 0;
    };
    return { trade, recent: pct(8), avg: pct(0) };
  });
}

export function engineerTotals(h: History, e: Engineer) {
  const ws = h.eng[e.id];
  const jobs = sum(ws.map((x) => x.jobs));
  const late = sum(ws.map((x) => x.late));
  const fixed = sum(ws.map((x) => x.fixed));
  const mins = sum(ws.map((x) => x.mins));
  return {
    e,
    weekly: ws.map((x) => x.jobs),
    jobs,
    onTime: jobs ? (jobs - late) / jobs : 0,
    ftf: jobs ? fixed / jobs : 0,
    avgMins: jobs ? Math.round(mins / jobs) : 0,
    returns: jobs - fixed
  };
}
