import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../data/store';
import type { Data, Engineer, Job, Part, Trade } from '../../data/types';
import { dayLabel, money, nowStamp, weekday } from '../../data/derive';
import { useDemoMinute } from '../../lib/clock';
import { go, useRoute } from '../../lib/router';
import { load, save } from '../../lib/storage';
import { t, td } from '../../lib/i18n';
import type { Key } from '../../lib/strings';
import { PageHeader } from '../../components/Shell';
import { Status } from '../../components/Status';
import { Icon } from '../../components/Icon';
import type { StatusView } from '../../data/derive';
import '../jobs/jobs.css';
import '../dispatch/dispatch.css';
import './stock.css';

type ViewId = 'all' | 'reorder' | 'ordered';
const VIEWS: { id: ViewId; label: Key; empty?: [Key, Key] }[] = [
  { id: 'all', label: 'sv.all' },
  { id: 'reorder', label: 'sv.reorder', empty: ['se.reorder.1', 'se.reorder.2'] },
  { id: 'ordered', label: 'sv.ordered', empty: ['se.ordered.1', 'se.ordered.2'] }
];

// Tedarikçiye göre teslim süresi (bugün Pzt 23 Kas): ısıtma ve klima 2 iş günü, beyaz eşya 3
const LEAD: Record<string, string> = {
  'Harbourline Heating Supplies': '2026-11-25',
  'Kelston Appliance Spares': '2026-11-26',
  'Northcote Cooling': '2026-11-25'
};
const TRADE: Record<string, Trade> = {
  'Harbourline Heating Supplies': 'gas',
  'Kelston Appliance Spares': 'appliance',
  'Northcote Cooling': 'cooling'
};

export const vanTotal = (p: Part) => Object.values(p.vans).reduce((s, n) => s + n, 0);
export const total = (p: Part) => p.depot + vanTotal(p);
const needsReorder = (p: Part) => !p.order && p.min > 0 && total(p) < p.min;
const reorderQty = (p: Part) => Math.max(p.min * 2 - total(p), 1);

/** Parçanın durumu: biçim + renk + yazı (İşler ile aynı dil) */
function stockState(p: Part): StatusView {
  const tot = total(p);
  if (tot === 0 && p.min > 0) return { tone: 'late', label: t('ss.out'), rank: 0 };
  if (tot < p.min) return { tone: 'behind', label: t('ss.low'), rank: 1 };
  if (p.min > 0 && p.depot > 0 && vanTotal(p) === 0) return { tone: 'tray', label: t('ss.novan'), rank: 2 };
  return { tone: 'done', label: t('ss.ok'), rank: 3 };
}

interface Toast { id: number; text: string; undo?: Part[]; undoJobs?: Job[] }

export function StockPage() {
  const { state, retry, saveFailed, setParts, updateJob, restoreJob } = useStore();
  const now = useDemoMinute();
  const { rest } = useRoute();
  const openId = rest[0] ?? null;

  const [view, setView] = useState<ViewId>(() => load<ViewId>('stock-view', 'all'));
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<Toast | null>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => { save('stock-view', view); }, [view]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.undo ? 8000 : 5000);
    return () => clearTimeout(id);
  }, [toast]);

  const data = state.phase === 'ready' ? state.data : null;
  const parts = data?.parts ?? [];

  const counts = useMemo(
    () => ({
      all: parts.length,
      reorder: parts.filter(needsReorder).length,
      ordered: parts.filter((p) => p.order).length
    }),
    [parts]
  );

  const shown = useMemo(() => {
    const words = q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return parts
      .filter((p) => (view === 'all' ? true : view === 'reorder' ? needsReorder(p) : !!p.order))
      .filter((p) => words.every((w) => `${p.id} ${p.name} ${p.supplier}`.toLocaleLowerCase().includes(w)))
      .sort((a, b) => stockState(a).rank - stockState(b).rank || a.id.localeCompare(b.id));
  }, [parts, view, q]);

  // Klavye: F arama, Esc panel kapatır
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.scrim')) return;
      const typing = (e.target as HTMLElement).closest('input, textarea');
      if (typing) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === 'f') { e.preventDefault(); search.current?.focus(); }
      if (e.key === 'Escape' && openId) { e.preventDefault(); go('stock'); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  function reorder(ids: string[]) {
    if (!data) return;
    const before = data.parts;
    const todo = before.filter((p) => ids.includes(p.id) && !p.order);
    const skipped = ids.length - todo.length;
    if (!todo.length) return setToast({ id: Date.now(), text: t('stoast.none') });
    let n = 1191 + before.filter((p) => p.order).length;
    setParts((ps) => ps.map((p) => (todo.some((x) => x.id === p.id) ? { ...p, order: { qty: reorderQty(p), due: LEAD[p.supplier] ?? '2026-11-26', ref: `PO-${n++}` } } : p)));
    const due = todo.map((p) => LEAD[p.supplier] ?? '2026-11-26').sort()[0];
    setSel(new Set());
    setToast({ id: Date.now(), text: t('stoast.ordered', { n: todo.length, d: dayLabel(due) }) + (skipped ? t('sb.skipped', { n: skipped }) : ''), undo: before });
  }

  function receive(p: Part) {
    if (!p.order || !data) return;
    const before = data.parts;
    setParts((ps) => ps.map((x) => (x.id === p.id ? { ...x, depot: x.depot + p.order!.qty, order: undefined } : x)));
    setToast({ id: Date.now(), text: t('stoast.received', { q: p.order.qty, code: p.id }), undo: before });
  }

  /** Depodan bir adet araca; o teknisyenin bu parçayı depoda bekleyen işi varsa "araçta" olur */
  function sendToVan(p: Part, e: Engineer) {
    if (!data || p.depot < 1) return;
    const before = data.parts;
    setParts((ps) => ps.map((x) => (x.id === p.id ? { ...x, depot: x.depot - 1, vans: { ...x.vans, [e.id]: (x.vans[e.id] ?? 0) + 1 } } : x)));
    const linked = data.jobs.filter((j) => j.engineer === e.id && j.status !== 'done' && j.parts?.some((jp) => jp.part === p.id && jp.state === 'at_depot'));
    linked.forEach((j) =>
        updateJob(
          j.id,
          { parts: j.parts!.map((jp) => (jp.part === p.id && jp.state === 'at_depot' ? { ...jp, state: 'on_van' } : jp)) },
          { at: nowStamp(now), kind: 'part', text: `${p.id} sent to ${e.name}'s van from the depot` }
        )
      );
    // Geri al hem stoku hem de bağlanan işi eski hâline döndürür
    setToast({ id: Date.now(), text: t('stoast.sent', { q: 1, code: p.id, e: e.name.split(' ')[0] }), undo: before, undoJobs: linked });
  }

  const allShownSelected = shown.length > 0 && shown.every((p) => sel.has(p.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const viewDef = VIEWS.find((v) => v.id === view)!;
  const openPart = openId ? parts.find((p) => p.id === openId) : undefined;

  const meta = data
    ? t('stock.meta', {
        n: parts.length,
        low: parts.filter((p) => p.min > 0 && total(p) < p.min).length,
        out: parts.filter((p) => p.min > 0 && total(p) === 0).length,
        ord: counts.ordered
      })
    : t('loading');

  return (
    <div className="stock">
      <PageHeader title={t('nav.stock')} meta={meta} />

      <div className="jobs-bar">
        <div className="views" role="tablist" aria-label={t('sf.label')}>
          {VIEWS.map((v) => (
            <button key={v.id} role="tab" aria-selected={view === v.id} className="view" onClick={() => { setView(v.id); setSel(new Set()); }}>
              {t(v.label)}
              {data && <span className="view-n tnum">{counts[v.id]}</span>}
            </button>
          ))}
        </div>
        <label className="filter">
          <Icon name="search" />
          <span className="sr-only">{t('sf.label')}</span>
          <input ref={search} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('sf.ph')} spellCheck={false} />
          {q ? (
            <button type="button" className="filter-clear" onClick={() => { setQ(''); search.current?.focus(); }} aria-label={t('filter.clear')}>
              <Icon name="close" size={14} />
            </button>
          ) : null}
        </label>
      </div>

      {saveFailed && (
        <p className="banner banner-warn" role="status"><b>{t('save.fail.b')}</b> {t('save.fail')}</p>
      )}

      {state.phase === 'loading' && <div className="board-loading" aria-busy="true" />}
      {state.phase === 'error' && (
        <div className="state">
          <b>{t('load.fail.jobs')}</b>
          <p>{t('load.fail.text')}</p>
          <button className="btn" onClick={retry}>{t('retry')}</button>
        </div>
      )}

      {data && sel.size > 0 && (
        <div className="bulk" role="region" aria-label={t('sb.selected', { n: sel.size })}>
          <b className="tnum">{t('sb.selected', { n: sel.size })}</b>
          <button className="btn btn-primary" onClick={() => reorder([...sel])}>{t('sb.reorder')}</button>
          <button className="btn btn-quiet" onClick={() => setSel(new Set())}>{t('sb.clear')}</button>
        </div>
      )}

      {data && shown.length === 0 && (
        q ? (
          <div className="state">
            <b>{t('se.nomatch', { q })}</b>
            <p>{t('se.nomatch.2')}</p>
            <button className="btn" onClick={() => setQ('')}>{t('filter.clear')}</button>
          </div>
        ) : viewDef.empty ? (
          <div className="state">
            <b>{t(viewDef.empty[0])}</b>
            <p>{t(viewDef.empty[1])}</p>
          </div>
        ) : null
      )}

      {data && shown.length > 0 && (
        <div className="slist" role="table" aria-label={t(viewDef.label)}>
          <div className="srow shead" role="row">
            <span role="columnheader" className="sc-check">
              <input
                type="checkbox"
                checked={allShownSelected}
                aria-label={t('sb.all')}
                onChange={() => setSel(allShownSelected ? new Set() : new Set(shown.map((p) => p.id)))}
              />
            </span>
            <span role="columnheader">{t('sc.code')}</span>
            <span role="columnheader">{t('sc.part')}</span>
            <span role="columnheader" className="num">{t('sc.depot')}</span>
            <span role="columnheader">{t('sc.vans')}</span>
            <span role="columnheader" className="num">{t('sc.min')}</span>
            <span role="columnheader">{t('sc.status')}</span>
          </div>
          {shown.map((p) => (
            <StockRow key={p.id} p={p} data={data} checked={sel.has(p.id)} open={openId === p.id} onToggle={() => toggle(p.id)} />
          ))}
        </div>
      )}

      {toast && (
        <div key={toast.id} className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && (
            <button className="btn btn-quiet" onClick={() => { const u = toast.undo!; setParts(() => u); toast.undoJobs?.forEach(restoreJob); setToast(null); }}>{t('undo')}</button>
          )}
        </div>
      )}

      {openPart && data && (
        <PartDetail key={openPart.id} p={openPart} data={data} onClose={() => go('stock')} onReorder={() => reorder([openPart.id])} onReceive={() => receive(openPart)} onSend={(e) => sendToVan(openPart, e)} />
      )}
    </div>
  );
}

function StockRow({ p, data, checked, open, onToggle }: { p: Part; data: Data; checked: boolean; open: boolean; onToggle: () => void }) {
  const st = stockState(p);
  const vans = Object.entries(p.vans).filter(([, n]) => n > 0);
  return (
    <div className={`srow tone-${st.tone}${checked ? ' is-checked' : ''}${open ? ' is-open' : ''}`} role="row">
      <span className="sc-check" role="cell">
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={t('sb.row', { part: p.id })} />
      </span>
      <a className="sc-link" href={'#/stock/' + p.id} role="cell" aria-label={`${p.id}, ${p.name}`}>
        <span className="sc-code tnum">{p.id}</span>
        <span className="sc-name">
          <span className="t1" lang="en">{p.name}</span>
          <span className="t2">{p.supplier}</span>
        </span>
        <span className="sc-depot num tnum">{p.depot}</span>
        <span className="sc-vans">
          <b className="tnum">{vanTotal(p)}</b>
          {vans.length > 0 && (
            <span className="sc-vanlist tnum">
              {vans.map(([id, n]) => {
                const e = data.engineers.find((x) => x.id === id);
                return <span key={id} title={e?.name}>{e?.initials} {n}</span>;
              })}
            </span>
          )}
        </span>
        <span className="sc-min num tnum">{p.min || '–'}</span>
        <span className="sc-mmeta tnum">{t('sd.counts', { d: p.depot, v: vanTotal(p) })}</span>
        <span className="sc-st">
          <Status view={st} />
          {p.order && <span className="sc-order tnum">{t('ss.ordered', { q: p.order.qty, d: weekday(p.order.due) })}</span>}
        </span>
      </a>
    </div>
  );
}

function PartDetail({ p, data, onClose, onReorder, onReceive, onSend }: { p: Part; data: Data; onClose: () => void; onReorder: () => void; onReceive: () => void; onSend: (e: Engineer) => void }) {
  const [picking, setPicking] = useState(false);
  const st = stockState(p);
  const vans = Object.entries(p.vans).filter(([, n]) => n > 0);
  const trade = TRADE[p.supplier];
  const engs = data.engineers.filter((e) => !e.off && (!trade || e.trade === trade));
  const waiting = data.jobs.filter((j) => j.status !== 'done' && j.parts?.some((jp) => jp.part === p.id && jp.state !== 'used' && jp.state !== 'on_van'));
  const box = useRef<HTMLElement>(null);
  useEffect(() => { box.current?.focus(); }, []);

  return (
    <aside ref={box} className="jd jd-overlay" aria-label={p.id} tabIndex={-1}>
      <div className="jd-top">
        <button type="button" className="jd-back" onClick={onClose}><Icon name="chevron" className="flip" /> {t('sd.back')}</button>
        <span className="jd-id tnum">{p.id}</span>
        <span className="jd-type">{p.supplier}</span>
        <button type="button" className="icon-btn jd-close" onClick={onClose} aria-label={t('jd.close')} title={t('jd.close')}><Icon name="close" /></button>
      </div>
      <div className="jd-head">
        <h2 lang="en">{p.name}</h2>
        <div className="jd-state">
          <Status view={st} />
          {p.order && <span className="jd-eng tnum">{t('ss.ordered', { q: p.order.qty, d: dayLabel(p.order.due) })}</span>}
        </div>
      </div>

      <div className="jd-actions">
        {p.order ? (
          <button className="btn btn-primary" onClick={onReceive}>{t('sd.receive', { q: p.order.qty })}</button>
        ) : (
          <button className={'btn' + (needsReorder(p) ? ' btn-primary' : '')} onClick={onReorder}>{t('sd.reorder', { q: reorderQty(p) })}</button>
        )}
        <button className="btn" onClick={() => setPicking((v) => !v)} disabled={p.depot < 1} aria-expanded={picking} title={p.depot < 1 ? t('sd.nodepot') : undefined}>
          {t('sd.send')}
        </button>
      </div>

      {picking && p.depot > 0 && (
        <div className="assign" role="group" aria-label={t('sd.sendto')}>
          <div className="assign-head"><b>{t('sd.sendto')}</b></div>
          <ul>
            {engs.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => { onSend(e); setPicking(false); }}>
                  <span className="as-av" aria-hidden="true">{e.initials}</span>
                  <span className="as-name">{e.name}<small>{td(e.skills)}</small></span>
                  <span className="as-load tnum">{p.vans[e.id] ?? 0}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="jd-sec">
        <h3>{t('sd.where')}</h3>
        <dl className="facts">
          <div><dt>{t('sc.depot')}</dt><dd className="tnum">{p.depot} <span className="muted">· {t('sd.shelf', { bin: p.bin })}</span></dd></div>
          {vans.length === 0 ? (
            <div><dt>{t('sc.vans')}</dt><dd className="muted">{t('sd.noneinvans')}</dd></div>
          ) : (
            vans.map(([id, n]) => {
              const e = data.engineers.find((x) => x.id === id);
              return <div key={id}><dt>{e?.name.split(' ')[0]}</dt><dd className="tnum">{n}</dd></div>;
            })
          )}
          <div><dt>{t('sd.total')}</dt><dd className="tnum"><b>{total(p)}</b> <span className="muted">· {t('sd.min', { n: p.min })}</span></dd></div>
        </dl>
      </section>

      {p.order && (
        <section className="jd-sec">
          <h3>{t('sd.order')}</h3>
          <p className="tnum">{p.order.ref} · {t('ss.ordered', { q: p.order.qty, d: dayLabel(p.order.due) })}</p>
        </section>
      )}

      <section className="jd-sec">
        <h3>{t('sd.needed')}</h3>
        {waiting.length === 0 ? (
          <p className="muted">{t('sd.none')}</p>
        ) : (
          <ul className="sd-jobs">
            {waiting.map((j) => {
              const c = data.customers.find((x) => x.id === j.customer)!;
              const e = data.engineers.find((x) => x.id === j.engineer);
              const jp = j.parts!.find((x) => x.part === p.id)!;
              return (
                <li key={j.id}>
                  <a href={'#/jobs/' + j.id}>
                    <span className="tnum sd-jid">{j.id}</span>
                    <span><b lang="en">{j.title}</b><span className="muted">{c.name}{e ? ` · ${e.name}` : ''} · {t(`part.${jp.state}`)}</span></span>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="jd-sec">
        <dl className="facts">
          <div><dt>{t('sd.supplier')}</dt><dd>{p.supplier}</dd></div>
          <div><dt>{t('sd.cost')}</dt><dd className="tnum">{money(p.cost)}</dd></div>
          <div><dt>{t('sd.value')}</dt><dd className="tnum">{money(p.cost * total(p))}</dd></div>
        </dl>
      </section>
    </aside>
  );
}
