import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../data/store';
import type { Customer, Data, Job } from '../../data/types';
import { TODAY } from '../../data/today';
import { dayLabel, hhmm, money, statusOf, street } from '../../data/derive';
import { balanceOf, invStatus, owed, totalOf } from '../../data/billing';
import { useDemoMinute } from '../../lib/clock';
import { go, useRoute } from '../../lib/router';
import { load, save } from '../../lib/storage';
import { t, td, tn } from '../../lib/i18n';
import type { Key } from '../../lib/strings';
import { PageHeader } from '../../components/Shell';
import { Status } from '../../components/Status';
import { Icon } from '../../components/Icon';
import '../jobs/jobs.css';
import '../stock/stock.css';
import '../invoices/invoices.css';
import './customers.css';

type ViewId = 'all' | 'owing' | 'overdue' | 'accounts';
const VIEWS: { id: ViewId; label: Key; empty?: [Key, Key] }[] = [
  { id: 'all', label: 'cv.all' },
  { id: 'owing', label: 'cv.owing', empty: ['ce.owing.1', 'ce.owing.2'] },
  { id: 'overdue', label: 'cv.overdue', empty: ['ce.overdue.1', 'ce.overdue.2'] },
  { id: 'accounts', label: 'cv.accounts' }
];

const kindLabel = (c: Customer) => t(c.kind === 'landlord' ? 'kind.landlord' : c.kind === 'business' ? 'kind.business' : 'kind.household');

/** Bir müşterinin bütün işleri, sıradaki ziyareti ve adresleri */
function profile(c: Customer, data: Data) {
  const jobs = data.jobs.filter((j) => j.customer === c.id);
  const open = jobs.filter((j) => j.status !== 'done');
  const next = open
    .filter((j) => j.date && j.date >= TODAY && j.status !== 'on_hold')
    .sort((a, b) => (a.date! + (a.window?.[0] ?? 0)).localeCompare(b.date! + (b.window?.[0] ?? 0)))[0];
  const areas = [...new Set(jobs.map((j) => j.site.area))].sort();
  return { jobs, open, next, areas, money: owed(data.invoices, c.id) };
}

function nextText(j?: Job) {
  if (!j) return t('cc.none');
  const day = dayLabel(j.date!);
  return j.window ? `${day} · ${hhmm(j.window[0])}` : day;
}

export function CustomersPage() {
  const { state, retry } = useStore();
  const { rest } = useRoute();
  const openId = rest[0] ?? null;
  const [view, setView] = useState<ViewId>(() => load<ViewId>('cust-view', 'all'));
  const [q, setQ] = useState('');
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => { save('cust-view', view); }, [view]);

  const data = state.phase === 'ready' ? state.data : null;

  const rows = useMemo(() => (data ? data.customers.map((c) => ({ c, p: profile(c, data) })) : []), [data]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      owing: rows.filter((r) => r.p.money.open > 0).length,
      overdue: rows.filter((r) => r.p.money.late > 0).length,
      accounts: rows.filter((r) => r.c.kind !== 'household').length
    }),
    [rows]
  );

  const shown = useMemo(() => {
    const words = q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const list = rows
      .filter(({ c, p }) => (view === 'all' ? true : view === 'owing' ? p.money.open > 0 : view === 'overdue' ? p.money.late > 0 : c.kind !== 'household'))
      .filter(({ c, p }) => {
        const hay = `${c.name} ${c.phone} ${c.phone.replace(/\s/g, '')} ${p.areas.join(' ')} ${p.jobs.map((j) => `${j.id} ${j.site.line}`).join(' ')}`.toLocaleLowerCase();
        return words.every((w) => hay.includes(w));
      });
    if (view === 'overdue') return list.sort((a, b) => b.p.money.late - a.p.money.late);
    if (view === 'owing') return list.sort((a, b) => b.p.money.open - a.p.money.open);
    return list.sort((a, b) => a.c.name.localeCompare(b.c.name, 'en'));
  }, [rows, view, q]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.scrim')) return;
      const typing = (e.target as HTMLElement).closest('input, textarea');
      if (typing) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === 'f') { e.preventDefault(); search.current?.focus(); }
      if (e.key === 'Escape' && openId) { e.preventDefault(); go('customers'); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  const viewDef = VIEWS.find((v) => v.id === view)!;
  const open = openId ? rows.find((r) => r.c.id === openId) : undefined;
  const meta = data ? t('cust.meta', { n: counts.all, a: counts.accounts, o: counts.owing }) : t('loading');

  return (
    <div className="stock customers">
      <PageHeader title={t('nav.customers')} meta={meta} />

      <div className="jobs-bar">
        <div className="views" role="tablist" aria-label={t('cf.label')}>
          {VIEWS.map((v) => (
            <button key={v.id} role="tab" aria-selected={view === v.id} className="view" onClick={() => setView(v.id)}>
              {t(v.label)}
              {data && <span className="view-n tnum">{counts[v.id]}</span>}
            </button>
          ))}
        </div>
        <label className="filter">
          <Icon name="search" />
          <span className="sr-only">{t('cf.label')}</span>
          <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('cf.ph')} spellCheck={false} />
          {q ? (
            <button type="button" className="filter-clear" onClick={() => { setQ(''); search.current?.focus(); }} aria-label={t('filter.clear')}>
              <Icon name="close" size={14} />
            </button>
          ) : null}
        </label>
      </div>

      {state.phase === 'loading' && <div className="board-loading" aria-busy="true" />}
      {state.phase === 'error' && (
        <div className="state">
          <b>{t('load.fail.jobs')}</b>
          <p>{t('load.fail.text')}</p>
          <button className="btn" onClick={retry}>{t('retry')}</button>
        </div>
      )}

      {data && shown.length === 0 && (
        q ? (
          <div className="state">
            <b>{t('ce.nomatch', { q })}</b>
            <p>{t('ce.nomatch.2')}</p>
            <button className="btn" onClick={() => setQ('')}>{t('filter.clear')}</button>
          </div>
        ) : viewDef.empty ? (
          <div className="state"><b>{t(viewDef.empty[0])}</b><p>{t(viewDef.empty[1])}</p></div>
        ) : null
      )}

      {data && shown.length > 0 && (
        <div className="slist clist" role="table" aria-label={t(viewDef.label)}>
          <div className="srow shead" role="row">
            <span role="columnheader">{t('cc.name')}</span>
            <span role="columnheader">{t('cc.area')}</span>
            <span role="columnheader">{t('cc.phone')}</span>
            <span role="columnheader">{t('cc.next')}</span>
            <span role="columnheader" className="num">{t('cc.owes')}</span>
          </div>
          {shown.map(({ c, p }) => (
            <a key={c.id} className={'srow crow' + (openId === c.id ? ' is-open' : '') + (p.money.late ? ' tone-late' : '')} href={'#/customers/' + c.id} role="row">
              <span className="sc-name" role="cell">
                <span className="t1">{c.name}</span>
                <span className="t2">{kindLabel(c)} · {t('cc.since', { y: c.since })}</span>
              </span>
              <span className="cc-area tnum" role="cell">{p.areas.join(' · ')}</span>
              <span className="cc-phone tnum" role="cell">{c.phone}</span>
              <span className="cc-next tnum" role="cell">
                {nextText(p.next)}
                {p.open.length > 0 && <span className="t2">{tn('cc.open', p.open.length)}</span>}
              </span>
              <span className="cc-owes num tnum" role="cell">
                {p.money.open > 0 ? money(p.money.open) : <span className="is-zero">–</span>}
                {p.money.late > 0 && <span className="cc-late">{t('cc.late', { m: money(p.money.late) })}</span>}
              </span>
              <span className="cc-mmeta tnum" role="cell">
                {p.areas.join(' · ')} · {nextText(p.next)}
              </span>
            </a>
          ))}
        </div>
      )}

      {open && data && <CustomerDetail key={open.c.id} c={open.c} data={data} onClose={() => go('customers')} />}
      {openId && data && !open && (
        <aside className="jd jd-overlay jd-missing" tabIndex={-1}>
          <div className="jd-top">
            <span className="jd-id">{openId}</span>
            <button type="button" className="icon-btn jd-close" onClick={() => go('customers')} aria-label={t('jd.close')}><Icon name="close" /></button>
          </div>
          <div className="state"><b>{t('cd.missing')}</b><button className="btn" onClick={() => go('customers')}>{t('cd.back')}</button></div>
        </aside>
      )}
    </div>
  );
}

function CustomerDetail({ c, data, onClose }: { c: Customer; data: Data; onClose: () => void }) {
  const now = useDemoMinute();
  const box = useRef<HTMLElement>(null);
  useEffect(() => { box.current?.focus(); }, []);
  const p = profile(c, data);
  const invoices = data.invoices.filter((i) => i.customer === c.id).sort((a, b) => (a.issued < b.issued ? 1 : -1));
  const sites = [...new Map(p.jobs.map((j) => [`${j.site.line}, ${j.site.area}`, j])).entries()];
  const sources = [...new Set(p.jobs.map((j) => td(j.source)))];
  const jobs = [...p.jobs].sort((a, b) => statusOf(a, now).rank - statusOf(b, now).rank || (b.date ?? '9').localeCompare(a.date ?? '9'));
  const m = p.money;
  const oldestLate = invoices.filter((i) => i.sent && balanceOf(i) > 0).sort((a, b) => a.due.localeCompare(b.due))[0];

  const alerts: { tone: string; text: string; href?: string }[] = [];
  if (m.late > 0) {
    alerts.push(
      m.lateN === 1
        ? { tone: 'late', text: t('cd.owe.1', { m: money(m.late), id: oldestLate?.id ?? '', d: m.oldest }), href: oldestLate ? '#/invoices/' + oldestLate.id : undefined }
        : { tone: 'late', text: t('cd.owe', { m: money(m.late), n: m.lateN, d: m.oldest }) }
    );
  }
  p.open.forEach((j) => j.flags?.forEach((f) => alerts.push({ tone: 'risk', text: `${j.id}: ${td(f)}`, href: '#/jobs/' + j.id })));

  return (
    <aside ref={box} className="jd jd-overlay" aria-label={c.name} tabIndex={-1}>
      <div className="jd-top">
        <button type="button" className="jd-back" onClick={onClose}><Icon name="chevron" className="flip" /> {t('cd.back')}</button>
        <span className="jd-id cap">{kindLabel(c)}</span>
        <span className="jd-type tnum">{t('cd.since', { y: c.since })}</span>
        <button type="button" className="icon-btn jd-close" onClick={onClose} aria-label={t('jd.close')} title={t('jd.close')}><Icon name="close" /></button>
      </div>

      <div className="jd-head">
        <h2>{c.name}</h2>
        <div className="jd-state">
          <span className="jd-eng">{t(c.kind === 'household' ? 'cd.pays.home' : 'cd.pays.account')}</span>
        </div>
      </div>

      {alerts.length > 0 && (
        <ul className="jd-alerts">
          {alerts.map((a, i) => (
            <li key={i} className={'alert alert-' + a.tone}>{a.href ? <a className="plain-link" href={a.href}>{a.text}</a> : a.text}</li>
          ))}
        </ul>
      )}

      <section className="jd-sec">
        <dl className="facts">
          <div><dt>{t('cc.phone')}</dt><dd className="tnum"><a href={'tel:' + c.phone.replace(/\s/g, '')}>{c.phone}</a></dd></div>
          <div><dt>{t('cd.money')}</dt><dd className="tnum">{m.open > 0 ? <>{t('cd.unpaid', { m: money(m.open) })}{m.late > 0 && <span className="cc-late"> · {t('cc.late', { m: money(m.late) })}</span>}</> : <span className="muted">{t('cd.nothing')}</span>}</dd></div>
          <div><dt>{t('f.source')}</dt><dd>{sources.join(' · ')}</dd></div>
        </dl>
      </section>

      <section className="jd-sec">
        <h3>{sites.length > 1 ? t('cd.props', { n: sites.length }) : t('cd.prop')}</h3>
        <ul className="cd-sites">
          {sites.map(([addr, j]) => (
            <li key={addr}>
              <b lang="en">{addr}</b>
              {j.equipment && <span className="muted">{j.equipment.make} {td(j.equipment.model)}{j.equipment.fitted ? ` · ${t('fitted', { y: j.equipment.fitted })}` : ''}{j.equipment.extra ? ` · ${td(j.equipment.extra)}` : ''}</span>}
              {j.contact && <span className="muted">{td(j.contact)}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="jd-sec">
        <h3>{t('cd.jobs')}</h3>
        <ul className="sd-jobs cd-list">
          {jobs.map((j) => (
            <li key={j.id}>
              <a href={'#/jobs/' + j.id}>
                <span className="tnum sd-jid">{j.id}</span>
                <span>
                  <b>{td(j.title)}</b>
                  <span className="cd-line">
                    <Status view={statusOf(j, now)} compact />
                    <span className="muted tnum">{j.date ? dayLabel(j.date) : t('notbooked')}{sites.length > 1 ? ` · ${street(j.site.line)}` : ''}</span>
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="jd-sec">
        <h3>{t('cd.invoices')}</h3>
        {invoices.length === 0 ? (
          <p className="muted">{t('cd.noinv')}</p>
        ) : (
          <ul className="sd-jobs cd-list">
            {invoices.map((inv) => (
              <li key={inv.id}>
                <a href={'#/invoices/' + inv.id}>
                  <span className="tnum sd-jid">{inv.id}</span>
                  <span className="cd-inv">
                    <span className="cd-line">
                      <Status view={invStatus(inv)} />
                    </span>
                    <span className="muted tnum">{dayLabel(inv.issued)} · {money(totalOf(inv))}{balanceOf(inv) > 0 && balanceOf(inv) < totalOf(inv) ? ` · ${t('is.left', { m: money(balanceOf(inv)) })}` : ''}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
