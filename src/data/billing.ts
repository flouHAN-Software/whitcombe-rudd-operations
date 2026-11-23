import type { Customer, Invoice, InvoiceLine, Job, Part } from './types';
import { TODAY } from './today';
import { dayLabel, money, type StatusView } from './derive';
import { t, tn } from '../lib/i18n';

// Fatura hesabı. Tutarlar peni; satırlar KDV hariç, KDV %20 (gaz kombi montajı dahil standart oran).

export const VAT_RATE = 0.2;

export const subtotal = (inv: Invoice) => inv.lines.reduce((s, l) => s + l.qty * l.unit, 0);
export const vatOf = (inv: Invoice) => Math.round(subtotal(inv) * VAT_RATE);
export const totalOf = (inv: Invoice) => subtotal(inv) + vatOf(inv);
export const paidOf = (inv: Invoice) => inv.events.reduce((s, e) => s + (e.kind === 'payment' ? e.amount ?? 0 : 0), 0);
export const balanceOf = (inv: Invoice) => totalOf(inv) - paidOf(inv);

const DAY = 86400000;
const noon = (d: string) => Date.parse(d + 'T12:00:00');
export const daysBetween = (a: string, b: string) => Math.round((noon(b) - noon(a)) / DAY);
export function addDays(date: string, n: number) {
  const d = new Date(noon(date) + n * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type Phase = 'draft' | 'open' | 'due' | 'overdue' | 'part' | 'paid';

export function phaseOf(inv: Invoice): Phase {
  if (balanceOf(inv) <= 0) return 'paid';
  if (!inv.sent) return 'draft';
  const late = daysBetween(inv.due, TODAY);
  if (late > 0) return 'overdue';
  if (paidOf(inv) > 0) return 'part';
  return late === 0 ? 'due' : 'open';
}

/** Gecikme günü; gecikmede değilse 0 */
export const lateDays = (inv: Invoice) => (phaseOf(inv) === 'overdue' ? daysBetween(inv.due, TODAY) : 0);

export function invStatus(inv: Invoice): StatusView {
  const p = phaseOf(inv);
  switch (p) {
    case 'overdue':
      return { tone: 'late', label: t('is.overdue'), sub: tn(paidOf(inv) > 0 ? 'is.days.part' : 'is.days', lateDays(inv)), rank: 0 };
    case 'due':
      return { tone: 'behind', label: t('is.due'), rank: 1 };
    case 'draft':
      return { tone: 'tray', label: t('is.draft'), rank: 2 };
    case 'part':
      return { tone: 'half', label: t('is.part'), sub: t('is.left', { m: money(balanceOf(inv)) }), rank: 3 };
    case 'open':
      return { tone: 'booked', label: t('is.open'), sub: t('is.until', { d: dayLabel(inv.due) }), rank: 4 };
    default:
      return { tone: 'done', label: t('is.paid'), rank: 5 };
  }
}

/** Ödeme olaylarının toplamı belli bir tarihte */
export const paidOn = (inv: Invoice, date: string) =>
  inv.events.reduce((s, e) => s + (e.kind === 'payment' && e.at.startsWith(date) ? e.amount ?? 0 : 0), 0);

export const termsFor = (c: Customer) => (c.kind === 'household' ? 7 : 30);

/** Parça satış fiyatı: maliyetin 1,5 katı, 10 peniye yuvarlanır */
export const sellPrice = (cost: number) => Math.round((cost * 1.5) / 10) * 10;

/** "gas hob" → 1, "hob, gas fire" → 2, "2 gas fires" → 2 */
const appliances = (extra?: string) => (extra ? extra.split(',').reduce((n, s) => n + (parseInt(s, 10) || 1), 0) : 0);

function labour(j: Job): InvoiceLine[] {
  const mins = j.arrived != null && j.doneAt != null ? j.doneAt - j.arrived : j.plan?.[1] ?? 60;
  const more = (free: number) => Math.max(0, Math.ceil((mins - free) / 30));
  switch (j.type) {
    case 'service':
      return [{ text: 'Annual boiler service', qty: 1, unit: 8250 }];
    case 'landlord': {
      const n = appliances(j.equipment?.extra);
      return [
        { text: 'Landlord gas safety record (CP12), boiler', qty: 1, unit: 7000 },
        ...(n ? [{ text: 'Further gas appliance checked', qty: n, unit: 1500 }] : [])
      ];
    }
    case 'breakdown':
    case 'repair':
    case 'recall': {
      const n = more(60);
      return [{ text: 'Call-out and first hour', qty: 1, unit: 9500 }, ...(n ? [{ text: 'Further labour, per half hour', qty: n, unit: 3400 }] : [])];
    }
    case 'appliance': {
      const n = more(45);
      return [{ text: 'Appliance call-out and first 45 minutes', qty: 1, unit: 7900 }, ...(n ? [{ text: 'Further labour, per half hour', qty: n, unit: 2900 }] : [])];
    }
    case 'cooling': {
      const units = parseInt(j.equipment?.extra ?? '', 10) || 1;
      return [
        { text: 'Air conditioning service, first unit', qty: 1, unit: 9500 },
        ...(units > 1 ? [{ text: 'Air conditioning service, each further unit', qty: units - 1, unit: 6500 }] : [])
      ];
    }
    default:
      // Keşif ücretsiz, montaj teklifle faturalanır: taslak açılmaz
      return [];
  }
}

export const nextInvoiceId = (all: Invoice[]) =>
  'INV-' + (all.reduce((m, i) => Math.max(m, Number(i.id.slice(4))), 0) + 1);

/** Biten işin taslak faturası; ücretlendirilmeyen iş türünde null */
export function draftFor(j: Job, c: Customer, parts: Part[], id: string, at: string, by = 'Automatic'): Invoice | null {
  const lines = labour(j);
  if (!lines.length) return null;
  j.parts?.forEach((jp) => {
    if (jp.state !== 'used' && jp.state !== 'on_van') return;
    const p = parts.find((x) => x.id === jp.part);
    if (p) lines.push({ text: `${p.name} (${p.id})`, qty: jp.qty, unit: sellPrice(p.cost) });
  });
  const issued = at.slice(0, 10);
  const terms = termsFor(c);
  return {
    id,
    customer: c.id,
    job: j.id,
    site: `${j.site.line}, ${j.site.area}`,
    issued,
    due: addDays(issued, terms),
    terms,
    lines,
    events: [{ at, by, kind: 'created', text: `Draft created when ${j.id} was completed` }]
  };
}

/** Bir müşterinin açık bakiyesi ve gecikmiş kısmı */
export function owed(invoices: Invoice[], customer: string) {
  let open = 0, late = 0, lateN = 0, oldest = 0;
  for (const inv of invoices) {
    if (inv.customer !== customer || !inv.sent) continue;
    const b = balanceOf(inv);
    if (b <= 0) continue;
    open += b;
    const d = lateDays(inv);
    if (d > 0) { late += b; lateN++; oldest = Math.max(oldest, d); }
  }
  return { open, late, lateN, oldest };
}
