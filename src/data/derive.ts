import type { Job, JobType } from './types';
import { TODAY } from './today';
import { getLang, t } from '../lib/i18n';

// Yalnızca kaynaktan doğrulanan kodlar (bkz. seed.ts başı). Türkçesi strings.ts DATA_TR'de
export const CODE_MEANING: Record<string, string> = {
  'F.22': 'Low water pressure',
  'F.28': 'Ignition failure',
  'F.29': 'Flame loss',
  'EA 227': 'No flame detected',
  E119: 'Low water pressure',
  E24: 'Drain blocked',
  '5E': 'Drain error'
};

export const nowStamp = (min: number) => `${TODAY}T${hhmm(min)}`;

export type Tone = 'late' | 'over' | 'behind' | 'live' | 'onsite' | 'booked' | 'tray' | 'parts' | 'hold' | 'half' | 'done';

export interface StatusView {
  tone: Tone;
  label: string;
  /** Kısa ek bilgi: "34 min", "ETA 10:52" */
  sub?: string;
  /** Sıralama ve gruplama için */
  rank: number;
}

export const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export const dur = (min: number) =>
  min < 60 ? t('min', { m: min }) : t('hm', { h: Math.floor(min / 60), m: String(min % 60).padStart(2, '0') });

const NAMES = {
  en: {
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  },
  tr: {
    days: ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'],
    months: ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  }
};

/** "Mon 23 Nov" / "Pzt 23 Kas" */
export function shortDate(d: Date) {
  const n = NAMES[getLang()];
  return getLang() === 'tr' ? `${d.getDate()} ${n.months[d.getMonth()]} ${n.days[d.getDay()]}` : `${n.days[d.getDay()]} ${d.getDate()} ${n.months[d.getMonth()]}`;
}

export function dayLabel(date: string) {
  if (date === TODAY) return t('today');
  return shortDate(new Date(date + 'T12:00:00'));
}

/** "Wed" / "Çar" */
export const weekday = (date: string) => NAMES[getLang()].days[new Date(date + 'T12:00:00').getDay()];

/** "10:21" bugün için, "Fri 20 Nov, 11:05" önceki günler için */
export function stamp(iso: string) {
  const [d, t] = iso.split('T');
  return d === TODAY ? t : `${dayLabel(d)}, ${t}`;
}

export function windowText(j: Job) {
  if (!j.date) return t('notbooked');
  if (!j.window) return j.date === TODAY ? t('anytime') : dayLabel(j.date);
  const w = `${hhmm(j.window[0])}–${hhmm(j.window[1])}`;
  return j.date === TODAY ? w : `${dayLabel(j.date)} · ${w}`;
}

/** İşin şu anki durumu, demo saatine göre */
export function statusOf(j: Job, now: number): StatusView {
  const today = j.date === TODAY;
  switch (j.status) {
    case 'done':
      return { tone: 'done', label: t('st.done'), sub: j.doneAt !== undefined ? hhmm(j.doneAt) : undefined, rank: 90 };
    case 'unassigned':
      return { tone: 'tray', label: t('st.tray'), sub: j.flags?.length ? t('st.prio') : undefined, rank: j.flags?.length ? 5 : 20 };
    case 'waiting_parts': {
      const due = j.parts?.find((p) => p.state === 'ordered')?.due;
      return { tone: 'parts', label: t('st.parts'), sub: due ? t('st.due', { d: weekday(due) }) : undefined, rank: 60 };
    }
    case 'on_hold':
      return { tone: 'hold', label: t('st.hold'), rank: 70 };
    case 'on_site': {
      if (today && j.plan && now > j.plan[0] + j.plan[1]) {
        return { tone: 'over', label: t('st.over'), sub: t('st.by', { d: dur(now - (j.plan[0] + j.plan[1])) }), rank: 3 };
      }
      return { tone: 'onsite', label: t('st.onsite'), sub: j.arrived !== undefined ? t('st.since', { t: hhmm(j.arrived) }) : undefined, rank: 30 };
    }
    case 'en_route':
      if (today && j.window && now > j.window[1]) return { tone: 'late', label: t('st.late'), sub: dur(now - j.window[1]), rank: 1 };
      if (today && j.eta !== undefined && now > j.eta + 5) return { tone: 'behind', label: t('st.notarr'), sub: t('st.etawas', { t: hhmm(j.eta) }), rank: 4 };
      return { tone: 'live', label: t('st.onway'), sub: j.eta !== undefined ? t('st.eta', { t: hhmm(j.eta) }) : undefined, rank: 31 };
    case 'booked':
      if (today && j.window && now > j.window[1]) return { tone: 'late', label: t('st.late'), sub: dur(now - j.window[1]), rank: 1 };
      if (today && j.plan && now > j.plan[0] + 10) return { tone: 'behind', label: t('st.notstarted'), sub: t('st.duestart', { t: hhmm(j.plan[0]) }), rank: 4 };
      return { tone: 'booked', label: t('st.booked'), sub: j.plan && today ? hhmm(j.plan[0]) : undefined, rank: 40 };
  }
}

export const typeLabel = (type: JobType) => t(`type.${type}`);

/** Gaz işleri yalnızca gaz kayıtlı mühendise verilebilir */
export const needsTrade = (j: Job) =>
  j.type === 'appliance' ? 'appliance' : j.type === 'cooling' ? 'cooling' : 'gas';

/** Listede kapı numarası gösterilmez: "Flat 3, 61 Ashley Down Road" → "Ashley Down Road" */
export const street = (line: string) => line.replace(/^Flat \d+,\s*/i, '').replace(/^\d+[A-Za-z]?\s+/, '');

/** Tahtada kısa ad: hanede soyadı, işletmede tam ad */
export const shortName = (name: string, kind: string) => (kind === 'household' ? name.split(' ').at(-1)! : name);

export const money = (pence: number) =>
  '£' + (pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
