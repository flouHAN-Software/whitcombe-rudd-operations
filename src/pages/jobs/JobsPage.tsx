import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../data/store';
import { statusOf, street, windowText, typeLabel, type StatusView } from '../../data/derive';
import { t, td } from '../../lib/i18n';
import type { Key } from '../../lib/strings';
import { TODAY } from '../../data/today';
import type { Data, Job } from '../../data/types';
import { useDemoMinute } from '../../lib/clock';
import { go, replace, useRoute } from '../../lib/router';
import { load, save } from '../../lib/storage';
import { PageHeader } from '../../components/Shell';
import { Status } from '../../components/Status';
import { Icon } from '../../components/Icon';
import { JobDetail } from './JobDetail';
import './jobs.css';

type ViewId = 'today' | 'attention' | 'tray' | 'parts' | 'hold' | 'open';
interface Row { job: Job; st: StatusView }

const VIEWS: { id: ViewId; label: Key; empty: [Key, Key] }[] = [
  { id: 'today', label: 'view.today', empty: ['e.today.1', 'e.today.2'] },
  { id: 'attention', label: 'view.attention', empty: ['e.attention.1', 'e.attention.2'] },
  { id: 'tray', label: 'view.tray', empty: ['e.tray.1', 'e.tray.2'] },
  { id: 'parts', label: 'view.parts', empty: ['e.parts.1', 'e.parts.2'] },
  { id: 'hold', label: 'view.hold', empty: ['e.hold.1', 'e.hold.2'] },
  { id: 'open', label: 'view.open', empty: ['e.open.1', 'e.open.2'] }
];

const GROUPS: { id: string; label: Key; test: (r: Row) => boolean }[] = [
  { id: 'attention', label: 'grp.attention', test: (r) => r.st.rank < 10 },
  { id: 'tray', label: 'grp.tray', test: (r) => r.job.status === 'unassigned' },
  { id: 'out', label: 'grp.out', test: (r) => r.st.tone === 'live' || r.st.tone === 'onsite' },
  { id: 'later', label: 'grp.later', test: (r) => r.st.tone === 'booked' },
  { id: 'done', label: 'grp.done', test: (r) => r.st.tone === 'done' }
];

function inView(v: ViewId, r: Row) {
  const s = r.job.status;
  switch (v) {
    case 'today': return r.job.date === TODAY;
    case 'attention': return r.st.rank < 10;
    case 'tray': return s === 'unassigned';
    case 'parts': return s === 'waiting_parts';
    case 'hold': return s === 'on_hold';
    case 'open': return s !== 'done';
  }
}

const start = (j: Job) => (j.plan ? j.plan[0] : j.window ? j.window[0] : 2000);
const byTime = (a: Row, b: Row) =>
  (a.job.date ?? '9999').localeCompare(b.job.date ?? '9999') || start(a.job) - start(b.job) || a.job.id.localeCompare(b.job.id);

function haystack(j: Job, d: Data) {
  const c = d.customers.find((x) => x.id === j.customer);
  const e = d.engineers.find((x) => x.id === j.engineer);
  return [j.id, j.title, td(j.title), j.code, c?.name, j.site.line, j.site.area, e?.name, j.equipment?.make, j.equipment?.model, td(j.equipment?.model ?? ''), typeLabel(j.type)]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
}

export function JobsPage() {
  const { state, retry, saveFailed } = useStore();
  const now = useDemoMinute();
  const { rest } = useRoute();
  const openId = rest[0] ?? null;

  const [view, setView] = useState<ViewId>(() => load<ViewId>('jobs-view', 'today'));
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState<string | null>(openId);
  const [focusDetail, setFocusDetail] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { save('jobs-view', view); }, [view]);
  useEffect(() => { if (openId) setCursor(openId); }, [openId]);

  const data = state.phase === 'ready' ? state.data : null;

  const rows: Row[] = useMemo(() => (data ? data.jobs.map((job) => ({ job, st: statusOf(job, now) })) : []), [data, now]);
  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.id, rows.filter((r) => inView(v.id, r)).length])) as Record<ViewId, number>, [rows]);

  const shown = useMemo(() => {
    if (!data) return [];
    const words = q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => inView(view, r) && words.every((w) => haystack(r.job, data).includes(w)));
  }, [rows, view, q, data]);

  // Gruplar: "Bugün" görünümünde durumlara göre, diğerlerinde tek liste
  const groups = useMemo(() => {
    if (view !== 'today') return [{ id: 'all', label: '', rows: [...shown].sort((a, b) => a.st.rank - b.st.rank || byTime(a, b)) }];
    const left = [...shown];
    return GROUPS.map((g) => {
      const mine = left.filter(g.test).sort(byTime);
      mine.forEach((r) => left.splice(left.indexOf(r), 1));
      return { id: g.id, label: g.label, rows: mine };
    }).filter((g) => g.rows.length);
  }, [shown, view]);

  const order = useMemo(() => groups.flatMap((g) => g.rows.map((r) => r.job.id)), [groups]);

  // İmleç görünen listede değilse ilk satıra al
  useEffect(() => {
    if (order.length && (!cursor || !order.includes(cursor)) && !openId) setCursor(order[0]);
  }, [order, cursor, openId]);

  useEffect(() => {
    if (cursor) document.getElementById('job-' + cursor)?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  // Klavye: J/K ya da oklar, Space önizleme, Enter aç, Esc kapat, F arama
  useEffect(() => {
    let gAt = 0;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.scrim')) return;
      // "G sonra harf" kısayolunun ikinci harfi listeyi oynatmasın
      if (e.key === 'g' || e.key === 'G') { gAt = Date.now(); return; }
      if (Date.now() - gAt < 1200) { gAt = 0; return; }
      const t = e.target as HTMLElement;
      const typing = t.closest('input, textarea, select');
      if (typing) {
        if (e.key === 'Escape' && t === search.current) { search.current!.blur(); listRef.current?.focus(); }
        if (e.key === 'ArrowDown' && t === search.current) { e.preventDefault(); listRef.current?.focus(); }
        return;
      }
      if (t.closest('.jd') && !['Escape'].includes(e.key)) return;
      const i = cursor ? order.indexOf(cursor) : -1;
      const move = (d: number) => {
        if (!order.length) return;
        const next = order[Math.max(0, Math.min(order.length - 1, i + d))];
        setCursor(next);
        if (openId) replace('jobs', next);
      };
      switch (e.key) {
        case 'j': case 'ArrowDown': e.preventDefault(); move(1); break;
        case 'k': case 'ArrowUp': e.preventDefault(); move(-1); break;
        case ' ':
          e.preventDefault();
          if (openId) go('jobs'); else if (cursor) go('jobs', cursor);
          break;
        case 'Enter':
          if (cursor) { e.preventDefault(); go('jobs', cursor); setFocusDetail((n) => n + 1); }
          break;
        case 'Escape':
          if (openId) { e.preventDefault(); go('jobs'); listRef.current?.focus(); }
          break;
        case 'f':
          e.preventDefault(); search.current?.focus();
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [order, cursor, openId]);

  const openJob = data && openId ? data.jobs.find((j) => j.id === openId) : undefined;
  const today = rows.filter((r) => r.job.date === TODAY);
  const meta = data
    ? t('jobs.meta', {
        n: today.length,
        done: today.filter((r) => r.st.tone === 'done').length,
        late: today.filter((r) => r.st.tone === 'late').length,
        tray: counts.tray
      })
    : t('loading');
  const viewDef = VIEWS.find((v) => v.id === view)!;
  const viewName = t(viewDef.label);

  return (
    <div className={'jobs' + (openId ? ' has-detail' : '')}>
      <div className="jobs-main">
        <PageHeader title={t('nav.jobs')} meta={meta} />

        <div className="jobs-bar">
          <div className="views" role="tablist" aria-label={t('filter.label')}>
            {VIEWS.map((v) => (
              <button
                key={v.id}
                role="tab"
                aria-selected={view === v.id}
                className="view"
                onClick={() => setView(v.id)}
              >
                {t(v.label)}
                {data && <span className="view-n tnum">{counts[v.id]}</span>}
              </button>
            ))}
          </div>
          <label className="filter">
            <Icon name="search" />
            <span className="sr-only">{t('filter.label')}</span>
            <input
              ref={search}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('filter.ph')}
              spellCheck={false}
            />
            {q ? (
              <button type="button" className="filter-clear" onClick={() => { setQ(''); search.current?.focus(); }} aria-label={t('filter.clear')}>
                <Icon name="close" size={14} />
              </button>
            ) : null}
          </label>
        </div>

        {saveFailed && (
          <p className="banner banner-warn" role="status">
            <b>{t('save.fail.b')}</b> {t('save.fail')}
          </p>
        )}

        {state.phase === 'loading' && <Skeleton />}

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
              <b>{t('nomatch', { q, inv: view !== 'open' ? t('nomatch.in', { view: viewName }) : '' })}</b>
              <p>{t('nomatch.text')}</p>
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
          <div
            ref={listRef}
            className="jlist"
            role="listbox"
            tabIndex={0}
            aria-label={t('jobs.listlabel', { view: viewName })}
            aria-activedescendant={cursor ? 'job-' + cursor : undefined}
          >
            <div className="jrow jhead" aria-hidden="true">
              <span>{t('col.job')}</span><span>{t('col.what')}</span><span>{t('col.customer')}</span><span>{t('col.window')}</span><span>{t('col.engineer')}</span><span>{t('col.status')}</span>
            </div>
            {groups.map((g) => (
              <div key={g.id} role="group" aria-label={g.label ? t(g.label as Key) : undefined}>
                {g.label && (
                  <div className={'jgroup jgroup-' + g.id} role="presentation">
                    {t(g.label as Key)} <span className="tnum">{g.rows.length}</span>
                  </div>
                )}
                {g.rows.map((r) => (
                  <JobRow
                    key={r.job.id}
                    row={r}
                    data={data}
                    cursor={cursor === r.job.id}
                    open={openId === r.job.id}
                    onPick={() => { setCursor(r.job.id); go('jobs', r.job.id); }}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {openId && data && (
        openJob ? (
          <JobDetail key={openJob.id} job={openJob} data={data} now={now} focusSignal={focusDetail} onClose={() => { go('jobs'); listRef.current?.focus(); }} />
        ) : (
          <aside className="jd jd-missing" aria-label={t('nf.b', { id: openId })}>
            <div className="state">
              <b>{t('nf.b', { id: openId })}</b>
              <p>{t('nf.t')}</p>
              <button className="btn" onClick={() => go('jobs')}>{t('back.jobs')}</button>
            </div>
          </aside>
        )
      )}
    </div>
  );
}

function JobRow({ row, data, cursor, open, onPick }: { row: Row; data: Data; cursor: boolean; open: boolean; onPick: () => void }) {
  const { job, st } = row;
  const c = data.customers.find((x) => x.id === job.customer)!;
  const e = data.engineers.find((x) => x.id === job.engineer);
  const what = job.equipment ? `${job.equipment.make} ${td(job.equipment.model)}` : typeLabel(job.type);
  return (
    <div
      id={'job-' + job.id}
      role="option"
      aria-selected={cursor}
      className={`jrow tone-${st.tone}${cursor ? ' is-cursor' : ''}${open ? ' is-open' : ''}`}
      onClick={onPick}
    >
      <span className="jc-id tnum">{job.id}</span>
      <span className="jc-what">
        <span className="t1">
          {td(job.title)}
          {job.flags?.length && st.tone !== 'done' ? <span className="tag-priority">{t('priority')}</span> : null}
        </span>
        <span className="t2">{what}{job.code ? ` · ${job.code}` : ''}</span>
      </span>
      <span className="jc-who">
        <span className="t1n">{c.name}</span>
        <span className="t2">{street(job.site.line)}, {job.site.area}</span>
      </span>
      <span className="jc-win tnum">{windowText(job)}</span>
      <span className={'jc-eng' + (e ? '' : ' is-none')}>{e ? e.name : t('not.assigned')}</span>
      <span className="jc-st"><Status view={st} /></span>
      <span className="jc-meta tnum">{windowText(job)}{e ? ` · ${e.name.split(' ')[0]}` : ''}</span>
    </div>
  );
}

function Skeleton() {
  const [show, setShow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShow(true), 150); return () => clearTimeout(t); }, []);
  if (!show) return null;
  return (
    <div className="skeleton" aria-busy="true" aria-label={t('jobs.loading')}>
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="sk-row">
          <i style={{ width: 64 }} /><i style={{ width: 180 + ((i * 37) % 90) }} /><i style={{ width: 140 + ((i * 53) % 60) }} /><i style={{ width: 88 }} />
        </div>
      ))}
    </div>
  );
}
