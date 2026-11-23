import type { Data, Engineer, Invoice, Job, Part, Trade } from './types';
import { TODAY } from './today';
import { needsTrade, statusOf, type StatusView } from './derive';
import { durOf, spanOf } from './plan';
import { balanceOf, lateDays, owed, paidOn, phaseOf } from './billing';

// "Bugün" ekranının hesapları. Hepsi diğer ekranlardaki veriden türetilir; ayrı sayı yazılmaz.

/** Boş zaman hesabı: gün sonu 18:00, iki iş arası yol payı 20 dk, işe yarar en kısa boşluk 45 dk */
export const WORK_END = 18 * 60;
export const TRAVEL = 20;
export const MIN_GAP = 45;

const byStart = (a: Job, b: Job) => (a.plan?.[0] ?? a.arrived ?? 0) - (b.plan?.[0] ?? b.arrived ?? 0);

export interface EngDay {
  e: Engineer;
  jobs: Job[];
  /** Sahada ya da yolda olduğu iş */
  current?: Job;
  /** Sıradaki başlamamış iş ve tahmini başlangıcı */
  next?: Job;
  nextAt?: number;
  left: number;
  workLeft: number;
  /** Şimdiden 18:00'e kadar, yol payı düşüldükten sonra 45 dakikadan uzun kalan boşlukların toplamı */
  free: number;
  /** Son işin tahmini bitişi */
  ends: number | null;
}

/** Mühendisin kalan gününü sırayla yürütür: uzayan iş sonrakini iter, boşluklar toplanır */
export function engDay(d: Data, e: Engineer, now: number): EngDay {
  const jobs = d.jobs.filter((j) => j.engineer === e.id && j.date === TODAY).sort(byStart);
  const day: EngDay = { e, jobs, left: 0, workLeft: 0, free: 0, ends: null };
  if (e.off) return day;

  let cursor = now;
  const current = jobs.find((j) => j.status === 'on_site') ?? jobs.find((j) => j.status === 'en_route');
  if (current) {
    day.current = current;
    const start = current.status === 'on_site' ? current.arrived ?? current.plan?.[0] ?? now : Math.max(now, current.eta ?? current.plan?.[0] ?? now);
    const end = Math.max(now, start + durOf(current));
    day.workLeft += end - now;
    day.left++;
    cursor = end;
  }
  const rest = jobs.filter((j) => j !== current && (j.status === 'booked' || j.status === 'en_route'));
  const usable = (from: number, to: number) => {
    const gap = Math.min(to, WORK_END) - from - TRAVEL;
    return gap >= MIN_GAP ? gap : 0;
  };
  for (const j of rest) {
    // Önceki iş uzadıysa bu iş, yol payı kadar sonra başlar
    const start = Math.max(cursor + (current || day.left ? TRAVEL : 0), j.plan?.[0] ?? cursor);
    day.free += usable(cursor, start);
    if (!day.next) { day.next = j; day.nextAt = start; }
    day.left++;
    day.workLeft += durOf(j);
    cursor = start + durOf(j);
  }
  day.free += usable(cursor, WORK_END);
  day.ends = day.left ? cursor : null;
  return day;
}

export const engDays = (d: Data, now: number) => d.engineers.map((e) => engDay(d, e, now));

export interface TradeLoad {
  trade: Trade;
  /** Bugün için havuzda bekleyen işler */
  pool: Job[];
  need: number;
  free: number;
  people: number;
}

/** ServiceTitan'daki kapasite fikri: havuzdaki iş, o uzmanlıktaki boş zamana sığıyor mu */
export function tradeLoad(d: Data, days: EngDay[]): TradeLoad[] {
  const trades: Trade[] = ['gas', 'appliance', 'cooling'];
  return trades.map((trade) => {
    const pool = d.jobs.filter((j) => j.status === 'unassigned' && j.date === TODAY && needsTrade(j) === trade);
    const working = days.filter((x) => x.e.trade === trade && !x.e.off);
    return {
      trade,
      pool,
      need: pool.reduce((s, j) => s + durOf(j), 0),
      free: working.reduce((s, x) => s + x.free, 0),
      people: working.length
    };
  });
}

/** Plana göre biten işler: her saat için planlanan bitiş sayısı ve gerçek bitiş sayısı */
export function planCurve(d: Data, now: number) {
  const today = d.jobs.filter((j) => j.date === TODAY);
  const planned = today
    .filter((j) => j.plan && j.engineer)
    .map((j) => j.plan![0] + j.plan![1])
    .sort((a, b) => a - b);
  const done = today
    .filter((j) => j.status === 'done' && j.doneAt !== undefined)
    .map((j) => j.doneAt!)
    .sort((a, b) => a - b);
  const countBy = (list: number[], t: number) => list.filter((x) => x <= t).length;
  return {
    total: today.length,
    planned,
    done,
    dueNow: countBy(planned, now),
    doneNow: countBy(done, now),
    countBy
  };
}

export type NeedKind = 'late' | 'over' | 'notstarted' | 'notarrived' | 'pool' | 'depot' | 'card' | 'poolmore' | 'drafts';

export interface Need {
  kind: NeedKind;
  view: StatusView;
  job?: Job;
  /** Uzayan işten sonra başlayamayan iş */
  next?: Job;
  part?: Part;
  inv?: Invoice;
  /** Karttaki müşterinin ayrıca gecikmiş borcu */
  alsoLate?: number;
  jobs?: Job[];
  invoices?: Invoice[];
}

/** Shopify ana sayfasındaki yapılacaklar fikri: her satır tek bir işe, doğrudan ilgili yere götürür */
export function needs(d: Data, now: number): Need[] {
  const out: Need[] = [];
  const today = d.jobs.filter((j) => j.date === TODAY);
  const views = new Map(today.map((j) => [j.id, statusOf(j, now)]));
  const used = new Set<string>();

  const ranked = today.filter((j) => views.get(j.id)!.rank < 10).sort((a, b) => views.get(a.id)!.rank - views.get(b.id)!.rank || byStart(a, b));
  for (const j of ranked) {
    if (used.has(j.id)) continue;
    const view = views.get(j.id)!;
    if (view.tone === 'late') out.push({ kind: 'late', view, job: j });
    else if (view.tone === 'over') {
      // Aynı mühendisin başlayamayan sıradaki işi bu satıra katılır
      const next = today
        .filter((x) => x.engineer === j.engineer && x.status === 'booked' && views.get(x.id)!.tone === 'behind')
        .sort(byStart)[0];
      if (next) used.add(next.id);
      out.push({ kind: 'over', view, job: j, next });
    } else if (view.tone === 'behind') out.push({ kind: j.status === 'en_route' ? 'notarrived' : 'notstarted', view, job: j });
    else if (view.tone === 'tray') out.push({ kind: 'pool', view, job: j });
    used.add(j.id);
  }

  // Bugünkü işte gereken parça depoda, araçta yok
  for (const j of today) {
    if (j.status === 'done' || !j.engineer) continue;
    const p = j.parts?.find((x) => x.state === 'at_depot');
    const part = p && d.parts.find((x) => x.id === p.part);
    if (part) out.push({ kind: 'depot', view: { tone: 'parts', label: '', rank: 6 }, job: j, part });
  }

  // Bugün geçmeyen kart ödemesi
  for (const inv of d.invoices) {
    const failed = inv.events.some((e) => e.kind === 'failed' && e.at.startsWith(TODAY));
    if (!failed || balanceOf(inv) <= 0) continue;
    const late = owed(d.invoices, inv.customer).late;
    out.push({ kind: 'card', view: { tone: 'late', label: '', rank: 7 }, inv, alsoLate: late || undefined });
  }

  const rest = today.filter((j) => j.status === 'unassigned' && !used.has(j.id));
  if (rest.length) out.push({ kind: 'poolmore', view: { tone: 'tray', label: '', rank: 20 }, jobs: rest.sort((a, b) => (a.window?.[0] ?? 0) - (b.window?.[0] ?? 0)) });

  const drafts = d.invoices.filter((i) => phaseOf(i) === 'draft');
  if (drafts.length) out.push({ kind: 'drafts', view: { tone: 'tray', label: '', rank: 30 }, invoices: drafts });

  return out;
}

/** Tahsilat satırları */
export function moneyToday(d: Data) {
  const live = d.invoices.filter((i) => balanceOf(i) > 0);
  const taken = d.invoices.map((i) => paidOn(i, TODAY)).filter((x) => x > 0);
  const overdue = live.filter((i) => phaseOf(i) === 'overdue');
  const due = live.filter((i) => phaseOf(i) === 'due');
  const drafts = live.filter((i) => phaseOf(i) === 'draft');
  const sum = (list: Invoice[]) => list.reduce((s, i) => s + balanceOf(i), 0);
  return {
    taken: taken.reduce((s, x) => s + x, 0),
    takenN: taken.length,
    drafts: drafts.length,
    draftsSum: sum(drafts),
    due: due.length,
    dueSum: sum(due),
    overdue: overdue.length,
    overdueSum: sum(overdue),
    oldest: overdue.reduce((m, i) => Math.max(m, lateDays(i)), 0)
  };
}

const stockTotal = (p: Part) => p.depot + Object.values(p.vans).reduce((s, x) => s + x, 0);

/** Stok satırları: stok ekranındaki "sipariş verilmesi gereken" kuralıyla aynı */
export function stockToday(d: Data) {
  const toOrder = d.parts.filter((p) => p.min > 0 && stockTotal(p) < p.min && !p.order);
  const ordered = d.parts.filter((p) => p.order).sort((a, b) => a.order!.due.localeCompare(b.order!.due));
  const waiting = d.jobs.filter((j) => j.status === 'waiting_parts');
  return { toOrder, ordered, waiting };
}

/** Gün şeridi için mühendisin blokları: gerçek ya da planlanan aralık + durum */
export function stripOf(day: EngDay, now: number) {
  return day.jobs
    .map((j) => ({ j, span: spanOf(j, now), view: statusOf(j, now) }))
    .filter((x): x is { j: Job; span: [number, number]; view: StatusView } => x.span !== null);
}
