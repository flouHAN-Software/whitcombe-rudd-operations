import { useEffect, useMemo, useRef, useState } from 'react';
import { ME, useStore } from '../../data/store';
import type { Data, Invoice, InvoiceEvent, PayMethod } from '../../data/types';
import { TODAY } from '../../data/today';
import { dayLabel, money, nowStamp, stamp, street } from '../../data/derive';
import { balanceOf, daysBetween, invStatus, lateDays, paidOf, phaseOf, subtotal, totalOf, vatOf } from '../../data/billing';
import { useDemoMinute } from '../../lib/clock';
import { go, useRoute } from '../../lib/router';
import { load, save } from '../../lib/storage';
import { t, td, tn } from '../../lib/i18n';
import type { Key } from '../../lib/strings';
import { PageHeader } from '../../components/Shell';
import { Status } from '../../components/Status';
import { Icon } from '../../components/Icon';
import '../jobs/jobs.css';
import '../dispatch/dispatch.css';
import '../stock/stock.css';
import './invoices.css';

type ViewId = 'unpaid' | 'overdue' | 'drafts' | 'paid';
const VIEWS: { id: ViewId; label: Key; empty: [Key, Key] }[] = [
  { id: 'unpaid', label: 'iv.unpaid', empty: ['ie.unpaid.1', 'ie.unpaid.2'] },
  { id: 'overdue', label: 'iv.overdue', empty: ['ie.overdue.1', 'ie.overdue.2'] },
  { id: 'drafts', label: 'iv.drafts', empty: ['ie.drafts.1', 'ie.drafts.2'] },
  { id: 'paid', label: 'iv.paid', empty: ['ie.paid.1', 'ie.paid.2'] }
];

const paidToday = (inv: Invoice) => inv.events.some((e) => e.kind === 'paid' && e.at.startsWith(TODAY));
const unpaid = (inv: Invoice) => !!inv.sent && balanceOf(inv) > 0;

function inView(inv: Invoice, v: ViewId) {
  if (v === 'unpaid') return unpaid(inv);
  if (v === 'overdue') return phaseOf(inv) === 'overdue';
  if (v === 'drafts') return phaseOf(inv) === 'draft';
  return paidToday(inv);
}

const lastAt = (inv: Invoice, kind: InvoiceEvent['kind']) => inv.events.filter((e) => e.kind === kind).at(-1)?.at;
const canRemind = (inv: Invoice) => unpaid(inv) && daysBetween(inv.due, TODAY) >= 0 && !lastAt(inv, 'reminder')?.startsWith(TODAY);

/** Ödeme olayı ve gerekiyorsa "tamamı ödendi" */
function withPayment(inv: Invoice, amount: number, method: PayMethod, ref: string, at: string): Invoice {
  const text =
    method === 'Bank transfer' ? `Bank transfer recorded${ref ? `, ref ${ref}` : ''}` : method === 'Cash' ? `Cash payment recorded${ref ? `: ${ref}` : ''}` : `Card payment recorded${ref ? `, ${ref}` : ''}`;
  const events: InvoiceEvent[] = [...inv.events, { at, by: ME, kind: 'payment', text, amount, method }];
  if (amount >= balanceOf(inv)) events.push({ at, by: 'Automatic', kind: 'paid', text: 'Paid in full' });
  return { ...inv, events };
}

interface Toast { id: number; text: string; undo?: Invoice[] }

export function InvoicesPage() {
  const { state, retry, saveFailed, setInvoices } = useStore();
  const now = useDemoMinute();
  const { rest } = useRoute();
  const openId = rest[0] ?? null;

  const [view, setView] = useState<ViewId>(() => load<ViewId>('inv-view', 'unpaid'));
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<Toast | null>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => { save('inv-view', view); }, [view]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.undo ? 8000 : 5000);
    return () => clearTimeout(id);
  }, [toast]);

  const data = state.phase === 'ready' ? state.data : null;
  const invoices = data?.invoices ?? [];
  const custName = (id: string) => data?.customers.find((c) => c.id === id)?.name ?? '';

  const counts = useMemo(() => {
    const c = { unpaid: 0, overdue: 0, drafts: 0, paid: 0 } as Record<ViewId, number>;
    invoices.forEach((inv) => VIEWS.forEach((v) => { if (inView(inv, v.id)) c[v.id]++; }));
    return c;
  }, [invoices]);

  const shown = useMemo(() => {
    const words = q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const list = invoices
      .filter((inv) => inView(inv, view))
      .filter((inv) => words.every((w) => `${inv.id} ${inv.job ?? ''} ${custName(inv.customer)} ${inv.site ?? ''}`.toLocaleLowerCase().includes(w)));
    if (view === 'overdue') return list.sort((a, b) => lateDays(b) - lateDays(a));
    if (view === 'drafts') return list.sort((a, b) => (a.events[0].at < b.events[0].at ? 1 : -1));
    if (view === 'paid') return list.sort((a, b) => ((lastAt(a, 'paid') ?? '') < (lastAt(b, 'paid') ?? '') ? 1 : -1));
    return list.sort((a, b) => invStatus(a).rank - invStatus(b).rank || a.due.localeCompare(b.due));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, view, q, data]);

  // Klavye: F arama, Esc paneli kapatır
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.scrim')) return;
      const typing = (e.target as HTMLElement).closest('input, textarea');
      if (typing) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === 'f') { e.preventDefault(); search.current?.focus(); }
      if (e.key === 'Escape' && openId) { e.preventDefault(); go('invoices'); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  const at = nowStamp(now);

  function send(ids: string[]) {
    const todo = invoices.filter((i) => ids.includes(i.id) && phaseOf(i) === 'draft');
    if (!todo.length) return setToast({ id: Date.now(), text: t('itoast.nothing') });
    const before = invoices;
    setInvoices((all) => all.map((i) => (todo.some((x) => x.id === i.id) ? { ...i, sent: at, events: [...i.events, { at, by: ME, kind: 'sent', text: 'Sent by email' }] } : i)));
    setSel(new Set());
    const skipped = ids.length - todo.length;
    setToast({ id: Date.now(), text: tn('itoast.sent', todo.length, { id: todo[0].id }) + (skipped ? tn('itoast.skipped', skipped) : ''), undo: before });
  }

  function remind(ids: string[]) {
    const todo = invoices.filter((i) => ids.includes(i.id) && canRemind(i));
    if (!todo.length) return setToast({ id: Date.now(), text: t('itoast.nothing') });
    const before = invoices;
    setInvoices((all) =>
      all.map((i) => {
        if (!todo.some((x) => x.id === i.id)) return i;
        const d = lateDays(i);
        const text = d > 0 ? `Reminder sent: ${d === 1 ? 'a day' : `${d} days`} overdue` : 'Reminder sent: due today';
        return { ...i, events: [...i.events, { at, by: ME, kind: 'reminder', text }] };
      })
    );
    setSel(new Set());
    const skipped = ids.length - todo.length;
    setToast({ id: Date.now(), text: tn('itoast.remind', todo.length, { id: todo[0].id }) + (skipped ? tn('itoast.skipped', skipped) : ''), undo: before });
  }

  function pay(inv: Invoice, amount: number, method: PayMethod, ref: string) {
    const before = invoices;
    const full = amount >= balanceOf(inv);
    setInvoices((all) => all.map((i) => (i.id === inv.id ? withPayment(i, amount, method, ref, at) : i)));
    setToast({ id: Date.now(), text: t(full ? 'itoast.paidfull' : 'itoast.paid', { m: money(amount), id: inv.id }), undo: before });
  }

  const selected = invoices.filter((i) => sel.has(i.id));
  const selDrafts = selected.filter((i) => phaseOf(i) === 'draft').length;
  const selRemind = selected.filter(canRemind).length;
  const allShownSelected = shown.length > 0 && shown.every((i) => sel.has(i.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const viewDef = VIEWS.find((v) => v.id === view)!;
  const openInv = openId ? invoices.find((i) => i.id === openId) : undefined;
  const pickable = view !== 'paid';

  const owedAll = invoices.filter(unpaid).reduce((s, i) => s + balanceOf(i), 0);
  const lateAll = invoices.filter((i) => phaseOf(i) === 'overdue').reduce((s, i) => s + balanceOf(i), 0);
  const meta = data ? t('inv.meta', { open: money(owedAll), late: money(lateAll), n: counts.drafts }) : t('loading');

  return (
    <div className="stock invoices">
      <PageHeader title={t('nav.invoices')} meta={meta} />

      {data && <Ageing invoices={invoices} />}

      <div className="jobs-bar">
        <div className="views" role="tablist" aria-label={t('if.label')}>
          {VIEWS.map((v) => (
            <button key={v.id} role="tab" aria-selected={view === v.id} className="view" onClick={() => { setView(v.id); setSel(new Set()); }}>
              {t(v.label)}
              {data && <span className="view-n tnum">{counts[v.id]}</span>}
            </button>
          ))}
        </div>
        <label className="filter">
          <Icon name="search" />
          <span className="sr-only">{t('if.label')}</span>
          <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('if.ph')} spellCheck={false} />
          {q ? (
            <button type="button" className="filter-clear" onClick={() => { setQ(''); search.current?.focus(); }} aria-label={t('filter.clear')}>
              <Icon name="close" size={14} />
            </button>
          ) : null}
        </label>
      </div>

      {saveFailed && <p className="banner banner-warn" role="status"><b>{t('save.fail.b')}</b> {t('save.fail')}</p>}

      {state.phase === 'loading' && <div className="board-loading" aria-busy="true" />}
      {state.phase === 'error' && (
        <div className="state">
          <b>{t('load.fail.jobs')}</b>
          <p>{t('load.fail.text')}</p>
          <button className="btn" onClick={retry}>{t('retry')}</button>
        </div>
      )}

      {data && sel.size > 0 && (
        <div className="bulk" role="region" aria-label={t('ib.selected', { n: sel.size })}>
          <b className="tnum">{t('ib.selected', { n: sel.size })}</b>
          {selDrafts > 0 && <button className="btn btn-primary" onClick={() => send([...sel])}>{tn('ib.send', selDrafts)}</button>}
          {selRemind > 0 && <button className={'btn' + (selDrafts ? '' : ' btn-primary')} onClick={() => remind([...sel])}>{tn('ib.remind', selRemind)}</button>}
          {!selDrafts && !selRemind && <span className="muted">{t('ib.nothing')}</span>}
          <button className="btn btn-quiet" onClick={() => setSel(new Set())}>{t('sb.clear')}</button>
        </div>
      )}

      {data && shown.length === 0 && (
        q ? (
          <div className="state">
            <b>{t('ie.nomatch', { q })}</b>
            <p>{t('ie.nomatch.2')}</p>
            <button className="btn" onClick={() => setQ('')}>{t('filter.clear')}</button>
          </div>
        ) : (
          <div className="state">
            <b>{t(viewDef.empty[0])}</b>
            <p>{t(viewDef.empty[1])}</p>
          </div>
        )
      )}

      {data && shown.length > 0 && (
        <div className={'slist ilist' + (pickable ? '' : ' no-pick')} role="table" aria-label={t(viewDef.label)}>
          <div className="srow shead" role="row">
            <span role="columnheader" className="sc-check">
              {pickable && (
                <input type="checkbox" checked={allShownSelected} aria-label={t('ib.all')} onChange={() => setSel(allShownSelected ? new Set() : new Set(shown.map((i) => i.id)))} />
              )}
            </span>
            <span role="columnheader">{t('ic.no')}</span>
            <span role="columnheader">{t('ic.cust')}</span>
            <span role="columnheader">{t('ic.issued')}</span>
            <span role="columnheader" className="num">{t('ic.total')}</span>
            <span role="columnheader" className="num">{t('ic.balance')}</span>
            <span role="columnheader">{t('ic.status')}</span>
          </div>
          {shown.map((inv) => (
            <InvoiceRow key={inv.id} inv={inv} name={custName(inv.customer)} pickable={pickable} checked={sel.has(inv.id)} open={openId === inv.id} onToggle={() => toggle(inv.id)} />
          ))}
        </div>
      )}

      {toast && (
        <div key={toast.id} className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && (
            <button className="btn btn-quiet" onClick={() => { const u = toast.undo!; setInvoices(() => u); setToast(null); }}>{t('undo')}</button>
          )}
        </div>
      )}

      {openInv && data && (
        <InvoiceDetail
          key={openInv.id}
          inv={openInv}
          data={data}
          onClose={() => go('invoices')}
          onSend={() => send([openInv.id])}
          onRemind={() => remind([openInv.id])}
          onPay={(a, m, r) => pay(openInv, a, m, r)}
        />
      )}
      {openId && data && !openInv && (
        <aside className="jd jd-overlay jd-missing" tabIndex={-1}>
          <div className="jd-top">
            <span className="jd-id tnum">{openId}</span>
            <button type="button" className="icon-btn jd-close" onClick={() => go('invoices')} aria-label={t('jd.close')}><Icon name="close" /></button>
          </div>
          <div className="state"><b>{t('id.missing', { id: openId })}</b><button className="btn" onClick={() => go('invoices')}>{t('id.back')}</button></div>
        </aside>
      )}
    </div>
  );
}

/** Ödenmemiş tutar yaşa göre: tek çubuk, dört dilim, her dilimin altında adı ve tutarı */
function Ageing({ invoices }: { invoices: Invoice[] }) {
  const buckets = [0, 0, 0, 0];
  invoices.filter(unpaid).forEach((i) => {
    const d = daysBetween(i.due, TODAY);
    buckets[d <= 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : 3] += balanceOf(i);
  });
  const sum = buckets.reduce((s, n) => s + n, 0);
  const keys: Key[] = ['age.0', 'age.1', 'age.2', 'age.3'];
  return (
    <section className="ageing" aria-label={t('age.title')}>
      <h2 className="ageing-title">{t('age.title')}</h2>
      <div className="ageing-bar" aria-hidden="true">
        {sum > 0 && buckets.map((n, i) => n > 0 && <span key={i} className={'ab ab-' + i} style={{ flexGrow: n }} title={`${t(keys[i])}: ${money(n)}`} />)}
      </div>
      <dl className="ageing-keys">
        {buckets.map((n, i) => (
          <div key={i} className={n ? '' : 'is-zero'}>
            <dt><i className={'ab ab-' + i} aria-hidden="true" />{t(keys[i])}</dt>
            <dd className="tnum">{money(n)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function InvoiceRow({ inv, name, pickable, checked, open, onToggle }: { inv: Invoice; name: string; pickable: boolean; checked: boolean; open: boolean; onToggle: () => void }) {
  const st = invStatus(inv);
  const bal = balanceOf(inv);
  return (
    <div className={`srow tone-${st.tone}${checked ? ' is-checked' : ''}${open ? ' is-open' : ''}`} role="row">
      <span className="sc-check" role="cell">
        {pickable && <input type="checkbox" checked={checked} onChange={onToggle} aria-label={t('ib.row', { id: inv.id })} />}
      </span>
      <a className="sc-link" href={'#/invoices/' + inv.id} role="cell" aria-label={`${inv.id}, ${name}`}>
        <span className="sc-code tnum">{inv.id}</span>
        <span className="sc-name">
          <span className="t1">{name}</span>
          <span className="t2 tnum">{inv.job ?? ''}{inv.site ? ` · ${td(street(inv.site))}` : ''}</span>
        </span>
        <span className="ic-issued tnum">{dayLabel(inv.issued)}</span>
        <span className="num tnum ic-total">{money(totalOf(inv))}</span>
        <span className={'num tnum ic-bal' + (bal > 0 ? '' : ' is-zero')}>{bal > 0 ? money(bal) : '–'}</span>
        <span className="sc-mmeta tnum">{bal > 0 ? t('ic.mleft', { m: money(bal) }) : money(totalOf(inv))}</span>
        <span className="sc-st"><Status view={st} /></span>
      </a>
    </div>
  );
}

const METHODS: { m: PayMethod; k: Key }[] = [
  { m: 'Bank transfer', k: 'pm.bank' },
  { m: 'Card', k: 'pm.card' },
  { m: 'Cash', k: 'pm.cash' }
];

const KIND: Record<InvoiceEvent['kind'], Key> = {
  created: 'ik.created', sent: 'ik.sent', reminder: 'ik.reminder', payment: 'ik.payment', failed: 'ik.failed', paid: 'ik.paid', note: 'ik.note'
};

function InvoiceDetail({ inv, data, onClose, onSend, onRemind, onPay }: {
  inv: Invoice; data: Data; onClose: () => void; onSend: () => void; onRemind: () => void; onPay: (amount: number, m: PayMethod, ref: string) => void;
}) {
  const box = useRef<HTMLElement>(null);
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PayMethod>('Bank transfer');
  const [ref, setRef] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { box.current?.focus(); }, []);

  const c = data.customers.find((x) => x.id === inv.customer)!;
  const job = inv.job ? data.jobs.find((j) => j.id === inv.job) : undefined;
  const st = invStatus(inv);
  const phase = phaseOf(inv);
  const bal = balanceOf(inv);
  const paid = paidOf(inv);
  const reminders = inv.events.filter((e) => e.kind === 'reminder');
  const failed = inv.events.filter((e) => e.kind === 'failed').at(-1);
  const paidAt = lastAt(inv, 'paid');

  const alerts: { tone: string; text: string }[] = [];
  if (phase === 'draft') alerts.push({ tone: 'risk', text: t('ia.draft') });
  if (phase === 'overdue') {
    const r = reminders.at(-1);
    alerts.push({ tone: 'late', text: tn('ia.overdue', lateDays(inv)) + (r ? tn('ia.rem', reminders.length, { d: stamp(r.at) }) : t('ia.norem')) });
  }
  if (failed && bal > 0 && !inv.events.some((e) => e.kind === 'payment' && e.at > failed.at)) alerts.push({ tone: 'risk', text: t('ia.failed', { d: stamp(failed.at) }) });
  if (paid > 0 && bal > 0) alerts.push({ tone: 'info', text: t('ia.part', { p: money(paid) }) + (inv.terms === 0 ? t('ia.completion', { d: dayLabel(inv.due) }) : '') });

  function openPay() {
    setAmount((bal / 100).toFixed(2));
    setErr('');
    setPaying(true);
  }

  function submit() {
    const pence = Math.round(parseFloat(amount.replace(/[£,\s]/g, '')) * 100);
    if (!pence || pence <= 0 || Number.isNaN(pence)) return setErr(t('pf.err.zero'));
    if (pence > bal) return setErr(t('pf.err.over', { m: money(bal) }));
    onPay(pence, method, ref.trim());
    setPaying(false);
    setRef('');
  }

  const remindable = canRemind(inv);
  const remindWhy = !unpaid(inv) ? '' : daysBetween(inv.due, TODAY) < 0 ? t('id.notdue') : t('id.reminded');
  const events = [...inv.events].reverse();

  return (
    <aside ref={box} className="jd jd-overlay" aria-label={inv.id} tabIndex={-1}>
      <div className="jd-top">
        <button type="button" className="jd-back" onClick={onClose}><Icon name="chevron" className="flip" /> {t('id.back')}</button>
        <span className="jd-id tnum">{inv.id}</span>
        <span className="jd-type">{t(`terms.${inv.terms}` as Key)}</span>
        <button type="button" className="icon-btn jd-close" onClick={onClose} aria-label={t('jd.close')} title={t('jd.close')}><Icon name="close" /></button>
      </div>

      <div className="jd-head">
        <h2><a className="plain-link" href={'#/customers/' + c.id}>{c.name}</a></h2>
        <div className="jd-state">
          <Status view={st} />
          {paidAt && <span className="jd-eng tnum">{stamp(paidAt)}</span>}
        </div>
        <p className="inv-sum">
          <span className="inv-big tnum">{money(bal > 0 ? bal : totalOf(inv))}</span>
          <span className="muted">{bal > 0 ? (paid > 0 ? t('id.of', { m: money(totalOf(inv)) }) : t('id.balance')) : t('id.paidtotal')}</span>
        </p>
      </div>

      {alerts.length > 0 && (
        <ul className="jd-alerts">
          {alerts.map((a, i) => <li key={i} className={'alert alert-' + a.tone}>{a.text}</li>)}
        </ul>
      )}

      {bal > 0 && (
        <div className="jd-actions">
          {phase === 'draft' && <button className="btn btn-primary" onClick={onSend}>{t('id.send')}</button>}
          <button className={'btn' + (phase !== 'draft' ? ' btn-primary' : '')} onClick={() => (paying ? setPaying(false) : openPay())} aria-expanded={paying}>{t('id.pay')}</button>
          {phase !== 'draft' && (
            <button className="btn" onClick={onRemind} disabled={!remindable} title={remindable ? undefined : remindWhy}>{t('id.remind')}</button>
          )}
        </div>
      )}
      {bal > 0 && phase !== 'draft' && !remindable && remindWhy && <p className="inv-why muted">{remindWhy}</p>}

      {paying && (
        <form className="jd-form pay-form" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
          <label htmlFor="pay-amount">{t('pf.amount')}</label>
          <div className="pay-amount">
            <span aria-hidden="true">£</span>
            <input id="pay-amount" inputMode="decimal" autoFocus value={amount} onChange={(e) => { setAmount(e.target.value); setErr(''); }} aria-invalid={!!err} aria-describedby={err ? 'pay-err' : undefined} />
          </div>
          {err && <p id="pay-err" className="pay-err" role="alert">{err}</p>}
          <fieldset className="pay-methods">
            <legend>{t('pf.method')}</legend>
            <div className="seg" role="radiogroup" aria-label={t('pf.method')}>
              {METHODS.map(({ m, k }) => (
                <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)}>{t(k)}</button>
              ))}
            </div>
          </fieldset>
          <label htmlFor="pay-ref">{t('pf.ref')}</label>
          <input id="pay-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder={t('pf.refph')} />
          <div className="jd-form-row">
            <button className="btn btn-primary" type="submit">{t('pf.save')}</button>
            <button className="btn btn-quiet" type="button" onClick={() => setPaying(false)}>{t('btn.cancel')}</button>
          </div>
        </form>
      )}

      <section className="jd-sec">
        <h3>{t('il.title')}</h3>
        <div className="doc">
        <div className="doc-head"><span className="doc-firm">Whitcombe &amp; Rudd</span><span className="doc-no tnum">{t('il.doc', { id: inv.id })}</span></div>
        <table className="lines">
          <thead className="sr-only">
            <tr><th>{t('il.item')}</th><th>{t('il.qty')}</th><th>{t('il.amount')}</th></tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i}>
                <td>{td(l.text)}{l.qty > 1 && <span className="muted tnum"> · {l.qty} × {money(l.unit)}</span>}</td>
                <td className="num tnum">{money(l.qty * l.unit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><th scope="row">{t('il.sub')}</th><td className="num tnum">{money(subtotal(inv))}</td></tr>
            <tr><th scope="row">{t('il.vat')}</th><td className="num tnum">{money(vatOf(inv))}</td></tr>
            <tr className="is-total"><th scope="row">{t('il.total')}</th><td className="num tnum">{money(totalOf(inv))}</td></tr>
            {paid > 0 && <tr><th scope="row">{t('il.paid')}</th><td className="num tnum">−{money(paid)}</td></tr>}
            {paid > 0 && <tr className="is-total"><th scope="row">{t('il.due')}</th><td className="num tnum">{money(bal)}</td></tr>}
          </tfoot>
        </table>
        </div>
      </section>

      <section className="jd-sec">
        <dl className="facts">
          <div><dt>{t('f.customer')}</dt><dd><a href={'#/customers/' + c.id}>{c.name}</a></dd></div>
          {inv.job && (
            <div>
              <dt>{t('if.job')}</dt>
              <dd className="tnum">{job ? <a href={'#/jobs/' + job.id}>{job.id}</a> : <>{inv.job} <span className="muted">· {t('if.archived')}</span></>}{job && <span className="muted"> · {td(job.title)}</span>}</dd>
            </div>
          )}
          {inv.site && <div><dt>{t('f.site')}</dt><dd>{td(inv.site)}</dd></div>}
          <div><dt>{t('if.issued')}</dt><dd className="tnum">{dayLabel(inv.issued)}</dd></div>
          <div><dt>{t('if.due')}</dt><dd className="tnum">{dayLabel(inv.due)} <span className="muted">· {t(`terms.${inv.terms}` as Key)}</span></dd></div>
        </dl>
      </section>

      <section className="jd-sec">
        <h3>{t('id.history')}</h3>
        <ol className="timeline">
          {events.map((ev, i) => (
            <li key={i} className={'ev ev-inv-' + ev.kind}>
              <span className="ev-when tnum">{stamp(ev.at)}</span>
              <div className="ev-body">
                <span className="ev-head"><b>{t(KIND[ev.kind])}</b>{ev.amount ? <> · <span className="tnum">{money(ev.amount)}</span></> : null} · {td(ev.by)}</span>
                <p>{td(ev.text)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}

