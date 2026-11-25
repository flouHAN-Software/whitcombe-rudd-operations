import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react';
import { useStore } from '../../data/store';
import { TODAY } from '../../data/today';
import type { Data, Engineer, Job } from '../../data/types';
import { hhmm, nowStamp, shortName, statusOf, street, typeLabel, typeShort, windowText, type StatusView } from '../../data/derive';
import { DAY_END, DAY_START, SPAN, blockedFor, clampStart, clash, dayJobs, durOf, inWindow, nextFree, slotFor, snap, spanOf } from '../../data/plan';
import { useDemoMinute } from '../../lib/clock';
import { go, useRoute } from '../../lib/router';
import { t, td } from '../../lib/i18n';
import type { Key } from '../../lib/strings';
import { PageHeader } from '../../components/Shell';
import { Status } from '../../components/Status';
import { Dialog } from '../../components/Dialog';
import { JobDetail } from '../jobs/JobDetail';
import './dispatch.css';

const GROUPS: [Engineer['trade'], Key][] = [['gas', 'grp.gas'], ['appliance', 'grp.appliance'], ['cooling', 'grp.cooling']];
const pct = (min: number) => ((min - DAY_START) / SPAN) * 100;
const HOURS = Array.from({ length: 11 }, (_, i) => (8 + i) * 60);

/** Önizleme: bir işin nereye bırakılacağı */
interface Place { job: string; eng: string | null; start: number; how: 'drag' | 'pick' }
interface Pending { job: Job; eng: Engineer; start: number }
interface Toast { id: number; text: string; undo?: Job; error?: boolean }

const movable = (j: Job) => j.status === 'unassigned' || (j.status === 'booked' && (j.date === TODAY || j.date === null));
const firstName = (n: string) => n.split(' ')[0];

function usePhone() {
  const q = '(max-width: 767px)';
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

function blockLine(j: Job, st: StatusView) {
  switch (st.tone) {
    case 'done': return t('d.done', { t: st.sub ?? '' });
    case 'late': return t('d.late', { d: st.sub ?? '' });
    case 'over': return t('d.over', { d: st.sub ?? '' });
    case 'behind': return `${st.label} · ${st.sub}`;
    case 'live': return st.sub ?? st.label;
    case 'onsite': return t('d.onsite', { s: st.sub ?? '' });
    default: return typeLabel(j.type) + (j.code ? ` · ${j.code}` : '');
  }
}

/** The same line for a short job, where the full one would be cut */
function blockShort(j: Job, st: StatusView) {
  switch (st.tone) {
    case 'late': return t('d.late.s', { d: st.sub ?? '' });
    case 'behind': case 'onsite': return st.label;
    case 'done': case 'over': case 'live': return blockLine(j, st);
    default: return typeShort(j.type);
  }
}

export function DispatchPage() {
  const { state, updateJob, restoreJob, retry } = useStore();
  const now = useDemoMinute();
  const { rest } = useRoute();
  const openId = rest[0] ?? null;
  const phone = usePhone();

  const [place, setPlace] = useState<Place | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; job: string } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const drag = useRef<{ job: Job; offset: number; x: number; y: number; moved: boolean; fromBlock: boolean } | null>(null);

  const data = state.phase === 'ready' ? state.data : null;

  const say = useCallback((m: Omit<Toast, 'id'>) => setToast({ ...m, id: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.undo ? 8000 : 5000);
    return () => clearTimeout(id);
  }, [toast]);

  const tray = useMemo(
    () =>
      data
        ? data.jobs
            .filter((j) => (j.status === 'unassigned' && (j.date === TODAY || j.date === null)) || (j.status === 'booked' && j.date === TODAY && !j.plan))
            .sort((a, b) => Number(!a.flags?.length) - Number(!b.flags?.length) || (a.window?.[0] ?? 2000) - (b.window?.[0] ?? 2000))
        : [],
    [data]
  );

  const lanes = useMemo(() => (data ? GROUPS.map(([trade, label]) => ({ trade, label, engs: data.engineers.filter((e) => e.trade === trade) })) : []), [data]);
  const order = useMemo(() => lanes.flatMap((g) => g.engs), [lanes]);

  /** Neden buraya bırakılamaz; boşsa bırakılabilir */
  const reason = useCallback(
    (d: Data, job: Job, eng: Engineer, start: number) => {
      const b = blockedFor(eng, job);
      if (b) return b;
      if (start < now) return t('r.past');
      const dur = durOf(job);
      if (start + dur > DAY_END) return t('r.late');
      const c = clash(d, eng.id, start, dur, job.id, now);
      if (c) {
        const s = spanOf(c, now)!;
        return t('r.clash', { id: c.id, a: hhmm(s[0]), b: hhmm(s[1]) });
      }
      return '';
    },
    [now]
  );

  // Event texts are stored in English and shown through td(); toasts are written in the interface language
  function apply(job: Job, eng: Engineer, start: number, newWin?: [number, number]) {
    const prev = job;
    const same = job.engineer === eng.id;
    const old = data!.engineers.find((e) => e.id === job.engineer);
    const at = nowStamp(now);
    const events = [
      {
        at,
        kind: 'assigned' as const,
        text: same ? `Moved to ${hhmm(start)}` : old ? `Moved from ${old.name} to ${eng.name}, ${hhmm(start)}` : `Booked with ${eng.name}, ${hhmm(start)}`
      },
      ...(newWin ? [{ at, kind: 'text' as const, text: `Arrival window changed to ${hhmm(newWin[0])}–${hhmm(newWin[1])}. Text sent to the customer.` }] : [])
    ];
    updateJob(
      job.id,
      { engineer: eng.id, plan: [start, durOf(job)], status: job.status === 'unassigned' ? 'booked' : job.status, date: TODAY, window: newWin ?? job.window },
      events
    );
    const text = same ? t('toast.moved', { id: job.id, t: hhmm(start) }) : t('toast.booked', { id: job.id, e: firstName(eng.name), t: hhmm(start) });
    say({ text: text + (newWin ? t('toast.win') : ''), undo: prev });
  }

  function unassign(job: Job) {
    if (!job.engineer) return;
    const e = data!.engineers.find((x) => x.id === job.engineer)!;
    updateJob(job.id, { engineer: null, plan: undefined, status: 'unassigned' }, { at: nowStamp(now), kind: 'assigned', text: `Taken off ${e.name}'s day, back in the tray` });
    say({ text: t('toast.tray', { id: job.id }), undo: job });
  }

  function commit(p: Place | null) {
    if (!p || !data) return setPlace(null);
    const job = data.jobs.find((j) => j.id === p.job)!;
    if (p.eng === null) { setPlace(null); return unassign(job); }
    const eng = data.engineers.find((e) => e.id === p.eng)!;
    const why = reason(data, job, eng, p.start);
    if (why) {
      // Seçim modunda kalır; başka satır ya da saat denenebilir
      if (p.how === 'drag') setPlace(null);
      return say({ text: t('toast.cant', { e: firstName(eng.name), t: hhmm(p.start), why }), error: true });
    }
    setPlace(null);
    if (job.status === 'booked' && job.engineer === eng.id && job.plan?.[0] === p.start) return;
    if (!inWindow(job, p.start)) return setPending({ job, eng, start: p.start });
    apply(job, eng, p.start);
  }

  /** Tıkla-bırak ve klavye: işi seç, sonra satır ve saat seç */
  function startPick(job: Job) {
    if (!data || !movable(job)) return;
    const dur = durOf(job);
    if (job.engineer && job.plan) return setPlace({ job: job.id, eng: job.engineer, start: job.plan[0], how: 'pick' });
    // En erken boşalan uygun teknisyen önerilir
    let best: { e: Engineer; s: number } | null = null;
    for (const e of order) {
      if (blockedFor(e, job)) continue;
      const s = nextFree(data, e.id, now, dur, job.id);
      if (s !== null && (!best || s < best.s)) best = { e, s };
    }
    if (best) return setPlace({ job: job.id, eng: best.e.id, start: best.s, how: 'pick' });
    setPlace({ job: job.id, eng: order[0].id, start: clampStart(snap(now + 15), dur), how: 'pick' });
  }

  // Sürükle-bırak (fare ve kalem; telefonda liste görünümü kullanılır)
  function onDown(e: RPE, job: Job, fromBlock: boolean) {
    if (e.button !== 0) return;
    const track = (e.currentTarget as HTMLElement).closest('.track') as HTMLElement | null;
    let offset = 0;
    if (fromBlock && track) {
      const r = track.getBoundingClientRect();
      offset = ((e.clientX - (e.currentTarget as HTMLElement).getBoundingClientRect().left) / r.width) * SPAN;
    }
    drag.current = { job, offset, x: e.clientX, y: e.clientY, moved: false, fromBlock };
  }

  useEffect(() => {
    function locate(x: number, y: number, job: Job, offset: number, how: Place['how']): Place | null {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!el) return null;
      if (el.closest('[data-tray]')) return { job: job.id, eng: null, start: 0, how };
      const track = el.closest('[data-lane]') as HTMLElement | null;
      if (!track) return null;
      const r = track.getBoundingClientRect();
      const min = DAY_START + ((x - r.left) / r.width) * SPAN - offset;
      return { job: job.id, eng: track.dataset.lane!, start: clampStart(snap(min), durOf(job)), how };
    }
    function move(e: PointerEvent) {
      const d = drag.current;
      if (d) {
        if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
        if (!movable(d.job)) return;
        d.moved = true;
        setGhost({ x: e.clientX, y: e.clientY, job: d.job.id });
        setPlace(locate(e.clientX, e.clientY, d.job, d.offset, 'drag'));
        return;
      }
      if (place?.how === 'pick' && data) {
        const job = data.jobs.find((j) => j.id === place.job)!;
        const p = locate(e.clientX, e.clientY, job, 0, 'pick');
        if (p && p.eng) setPlace(p);
      }
    }
    function up(e: PointerEvent) {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      setGhost(null);
      if (d.moved) {
        commit(locate(e.clientX, e.clientY, d.job, d.offset, 'drag'));
        return;
      }
      // Hareket yoksa tıklamadır. Seçim modunda bloğa tıklama yerleştirme sayılır (satırın onClick'i)
      if (d.fromBlock) {
        if (place?.how !== 'pick') go('dispatch', d.job.id);
      } else startPick(d.job);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  });

  // Klavye: seçim modunda oklar satır ve saat değiştirir, Enter yerleştirir, Esc vazgeçer
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Kartın kendi Enter'ı seçimi başlattıysa aynı basış yerleştirme yapmasın
      if (e.defaultPrevented || document.querySelector('.scrim') || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      if (place) {
        const job = data?.jobs.find((j) => j.id === place.job);
        if (!job) return;
        const i = order.findIndex((x) => x.id === place.eng);
        if (e.key === 'Escape') { e.preventDefault(); setPlace(null); return; }
        if (e.key === 'Enter') { e.preventDefault(); commit(place); return; }
        const dur = durOf(job);
        if (e.key === 'ArrowLeft') { e.preventDefault(); setPlace({ ...place, start: clampStart(place.start - 15, dur) }); }
        if (e.key === 'ArrowRight') { e.preventDefault(); setPlace({ ...place, start: clampStart(place.start + 15, dur) }); }
        if (e.key === 'ArrowDown') { e.preventDefault(); setPlace({ ...place, eng: order[Math.min(order.length - 1, i + 1)].id }); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setPlace({ ...place, eng: order[Math.max(0, i - 1)].id }); }
        return;
      }
      if (e.key === 'Escape' && openId) { e.preventDefault(); go('dispatch'); }
      if (e.key === 'm') {
        const id = (document.activeElement as HTMLElement | null)?.dataset.job;
        const job = id && data?.jobs.find((j) => j.id === id);
        if (job && movable(job)) { e.preventDefault(); startPick(job); }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (state.phase === 'loading') return <><PageHeader title={t('nav.dispatch')} meta={t('loading')} /><div className="board-loading" aria-busy="true" /></>;
  if (state.phase === 'error' || !data)
    return (
      <>
        <PageHeader title={t('nav.dispatch')} />
        <div className="state"><b>{t('d.fail')}</b><p>{t('d.fail.text')}</p><button className="btn" onClick={retry}>{t('retry')}</button></div>
      </>
    );

  const working = data.engineers.filter((e) => !e.off);
  const off = data.engineers.filter((e) => e.off);
  const placingJob = place ? data.jobs.find((j) => j.id === place.job) : undefined;
  const openJob = openId ? data.jobs.find((j) => j.id === openId) : undefined;
  const offText = off.map((e) => t('d.off', { who: firstName(e.name), why: td(e.off!).toLocaleLowerCase() })).join('');
  const meta = t('d.meta', { n: working.length, off: offText, tray: tray.length });

  return (
    <div className={'dispatch' + (place ? ' is-placing' : '')}>
      <PageHeader title={t('nav.dispatch')} meta={meta} />

      {placingJob && place?.how === 'pick' && (
        <div className="placing" role="status">
          <span>
            <b>{t('d.placing', { id: placingJob.id })}</b> · {data.customers.find((c) => c.id === placingJob.customer)!.name}
            {placingJob.window ? t('d.promised', { w: windowText(placingJob) }) : ''}. {t('d.placing.help')}
          </span>
          <button className="btn btn-quiet" onClick={() => setPlace(null)}>{t('btn.cancel')}</button>
        </div>
      )}

      {phone ? (
        <Agenda data={data} now={now} tray={tray} />
      ) : (
        <>
          <div className="board-scroll">
            <div className="board" role="grid" aria-label={t('d.board')}>
              <div className="b-hours" role="row">
                <div className="b-corner" role="columnheader">{t('d.eng')}</div>
                <div className="b-ticks" role="columnheader" aria-label={t('d.time')}>
                  {HOURS.map((h) => (
                    // "Şimdi" etiketiyle çakışan saat etiketi gizlenir
                    <span key={h} style={{ left: pct(h) + '%', visibility: Math.abs(h - now) < 28 ? 'hidden' : undefined }}>{hhmm(h)}</span>
                  ))}
                  {now >= DAY_START && now <= DAY_END && <em className="now-label tnum" style={{ left: pct(now) + '%' }}>{hhmm(now)}</em>}
                </div>
              </div>

              {lanes.map((g) => (
                <div key={g.trade} className="b-group" role="rowgroup" aria-label={t(g.label)}>
                  <div className="b-gname" role="row"><span role="rowheader">{t(g.label)}</span></div>
                  {g.engs.map((e) => (
                    <Lane key={e.id} e={e} data={data} now={now} place={place} placing={placingJob} reason={reason} onDown={onDown} onPick={commit} />
                  ))}
                </div>
              ))}
            </div>
          </div>

          <section className={'tray' + (place?.eng === null ? ' is-target' : '')} data-tray aria-label={t('d.tray')}>
            <div className="tray-head">
              <h2>{t('d.tray')} <span className="tnum">{tray.length}</span></h2>
              <p>{t('d.tray.help')}</p>
            </div>
            {tray.length === 0 ? (
              <p className="tray-empty">{t('d.tray.empty')}</p>
            ) : (
              <ul className="tray-list">
                {tray.map((j) => (
                  <li key={j.id}>
                    <TrayCard job={j} data={data} selected={place?.job === j.id} onDown={onDown} onKeyPick={() => startPick(j)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {ghost && <Ghost job={data.jobs.find((j) => j.id === ghost.job)!} data={data} x={ghost.x} y={ghost.y} place={place} />}

      {pending && (
        <WindowDialog
          p={pending}
          data={data}
          onClose={() => setPending(null)}
          onChange={() => { apply(pending.job, pending.eng, pending.start, slotFor(pending.start)); setPending(null); }}
          onKeep={() => { apply(pending.job, pending.eng, pending.start); setPending(null); }}
        />
      )}

      {toast && (
        <div key={toast.id} className={'toast' + (toast.error ? ' toast-error' : '')} role="status">
          <span>{toast.text}</span>
          {toast.undo && (
            <button className="btn btn-quiet" onClick={() => { restoreJob(toast.undo!); setToast(null); }}>{t('undo')}</button>
          )}
        </div>
      )}

      {openJob && (
        <JobDetail key={openJob.id} job={openJob} data={data} now={now} focusSignal={1} overlay backLabel={t('nav.dispatch')} onClose={() => go('dispatch')} />
      )}
    </div>
  );
}

function Lane({ e, data, now, place, placing, reason, onDown, onPick }: {
  e: Engineer; data: Data; now: number; place: Place | null; placing?: Job;
  reason: (d: Data, j: Job, e: Engineer, s: number) => string;
  onDown: (ev: RPE, j: Job, fromBlock: boolean) => void;
  onPick: (p: Place) => void;
}) {
  const jobs = dayJobs(data, e.id);
  const booked = jobs.filter((j) => j.status !== 'done').reduce((s, j) => s + durOf(j), 0);
  const here = place && place.eng === e.id && placing;
  const why = here ? reason(data, placing!, e, place!.start) : '';
  const blocked = placing ? blockedFor(e, placing) : '';

  return (
    <div className={'lane' + (e.off ? ' is-off' : '') + (placing && blocked ? ' is-blocked' : '')} role="row">
      <div className="lane-head" role="rowheader">
        <b>{e.name}</b>
        <span>{e.off ? td(e.off) : t('d.lane', { n: jobs.length, h: Math.floor(booked / 60), m: String(booked % 60).padStart(2, '0') })}</span>
      </div>
      <div className="track" data-lane={e.id} role="gridcell" onClick={() => place?.how === 'pick' && onPick(place)}>
        {HOURS.map((h) => <i key={h} className="hline" style={{ left: pct(h) + '%' }} aria-hidden="true" />)}
        {placing?.window && !blocked && (
          <div className="win-band" style={{ left: pct(placing.window[0]) + '%', width: ((placing.window[1] - placing.window[0]) / SPAN) * 100 + '%' }} aria-hidden="true" />
        )}
        {e.off && <span className="off-label">{td(e.off)}</span>}
        {jobs.map((j) => <Block key={j.id} job={j} data={data} now={now} onDown={onDown} dim={placing?.id === j.id} />)}
        {here && (
          <div className={'preview' + (why ? ' is-bad' : '')} style={{ left: pct(place!.start) + '%', width: (durOf(placing!) / SPAN) * 100 + '%' }} aria-live="polite">
            <span className="tnum">{why || `${hhmm(place!.start)}–${hhmm(place!.start + durOf(placing!))}`}</span>
          </div>
        )}
        {now >= DAY_START && now <= DAY_END && <i className="now" style={{ left: pct(now) + '%' }} aria-hidden="true" />}
      </div>
    </div>
  );
}

function Block({ job, data, now, onDown, dim }: { job: Job; data: Data; now: number; onDown: (ev: RPE, j: Job, b: boolean) => void; dim: boolean }) {
  const s = spanOf(job, now);
  if (!s) return null;
  const st = statusOf(job, now);
  const c = data.customers.find((x) => x.id === job.customer)!;
  const planEnd = job.plan ? job.plan[0] + job.plan[1] : s[1];
  const over = st.tone === 'over' ? ((s[1] - planEnd) / (s[1] - s[0])) * 100 : 0;
  const can = movable(job);
  const time = `${hhmm(s[0])}–${hhmm(s[1])}`;
  const state = `${st.label}${st.sub ? ' ' + st.sub : ''}`;
  return (
    <button
      type="button"
      className={`blk tone-${st.tone}${can ? ' can-move' : ''}${dim ? ' is-dim' : ''}`}
      style={{ left: pct(s[0]) + '%', width: ((s[1] - s[0]) / SPAN) * 100 + '%' }}
      data-job={job.id}
      onPointerDown={(ev) => onDown(ev, job, true)}
      onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); go('dispatch', job.id); } }}
      title={`${job.id} · ${td(job.title)}\n${c.name}, ${street(job.site.line)}, ${job.site.area}\n${time} · ${state}${can ? '' : '\n' + t('d.locked')}`}
    >
      {over > 0 && <i className="overrun" style={{ width: over + '%' }} aria-hidden="true" />}
      {/* The area drops out before the name is cut; a short job shows the area under the name instead of the status */}
      <b className="blk-n"><span>{shortName(c)}</span><span className="blk-a">{'\u00a0· ' + job.site.area}</span></b>
      <span className="blk-s"><span className="blk-l">{blockLine(job, st)}</span><span className="blk-sh">{blockShort(job, st)}</span></span>
      <span className="blk-a2">{job.site.area}</span>
      {/* The name is read from what is on screen (whatever fits this width), then the details: voice control users can say what they see */}
      <span className="sr-only">, {job.id}, {c.name}, {time}</span>
    </button>
  );
}

function TrayCard({ job, data, selected, onDown, onKeyPick }: { job: Job; data: Data; selected: boolean; onDown: (ev: RPE, j: Job, b: boolean) => void; onKeyPick: () => void }) {
  const c = data.customers.find((x) => x.id === job.customer)!;
  const e = data.engineers.find((x) => x.id === job.engineer);
  return (
    <button
      type="button"
      className={'tcard' + (selected ? ' is-selected' : '') + (job.flags?.length ? ' is-priority' : '')}
      onPointerDown={(ev) => onDown(ev, job, false)}
      onKeyDown={(ev) => {
        // Kart seçiliyken Enter yerleştirir (tahtanın dinleyicisi), seçili değilken seçer
        if ((ev.key === 'Enter' || ev.key === ' ') && !selected) { ev.preventDefault(); onKeyPick(); }
        else if (ev.key === ' ') ev.preventDefault();
      }}
      aria-pressed={selected}
    >
      <span className="tc-top">
        <span className="tnum tc-id">{job.id}</span>
        {job.flags?.length ? <span className="tag-priority">{t('priority')}</span> : null}
        <span className="tc-win tnum">{job.window ? `${hhmm(job.window[0])}–${hhmm(job.window[1])}` : job.date ? t('d.any') : t('d.nodate')}</span>
      </span>
      <b>{td(job.title)}</b>
      <span className="tc-who">{c.name} · {street(job.site.line)}, {job.site.area}</span>
      <span className="tc-meta">{typeLabel(job.type)} · {t('d.about', { m: Math.round(durOf(job) / 15) * 15 })}{e ? ' · ' + t('d.notime', { who: e.name }) : ''}</span>
    </button>
  );
}

function Ghost({ job, data, x, y, place }: { job: Job; data: Data; x: number; y: number; place: Place | null }) {
  const c = data.customers.find((v) => v.id === job.customer)!;
  return (
    <div className="ghost" style={{ transform: `translate(${x + 12}px, ${y + 10}px)` }} aria-hidden="true">
      <b>{shortName(c)} · {job.site.area}</b>
      <span className="tnum">{place?.eng === null ? t('d.ghost.tray') : place ? hhmm(place.start) : t('d.ghost.drop')}</span>
    </div>
  );
}

function WindowDialog({ p, data, onClose, onChange, onKeep }: { p: Pending; data: Data; onClose: () => void; onChange: () => void; onKeep: () => void }) {
  const c = data.customers.find((x) => x.id === p.job.customer)!;
  const w = p.job.window!;
  const nw = slotFor(p.start);
  const early = p.start < w[0];
  const win = `${hhmm(w[0])}–${hhmm(w[1])}`;
  const nwin = `${hhmm(nw[0])}–${hhmm(nw[1])}`;
  return (
    <Dialog label={t('w.title')} onClose={onClose} className="windlg">
      <div className="windlg-body">
        <h2>{t('w.title')}</h2>
        <p className="tnum">
          {t('w.text', { c: c.name, w: win, e: firstName(p.eng.name), t: hhmm(p.start), when: early ? t('w.before') : t('w.after'), may: early ? t('w.may') : '' })}
        </p>
        <div className="windlg-actions">
          <button className="btn btn-primary" data-autofocus onClick={onChange}>{t('w.change', { w: nwin })}</button>
          <button className="btn" onClick={onKeep}>{t('w.keep', { w: win })}</button>
          <button className="btn btn-quiet" onClick={onClose}>{t('w.cancel')}</button>
        </div>
      </div>
    </Dialog>
  );
}

/** Telefon: tepsi + seçilen teknisyenin günü, liste olarak */
function Agenda({ data, now, tray }: { data: Data; now: number; tray: Job[] }) {
  const [eng, setEng] = useState(data.engineers.find((e) => !e.off)!.id);
  const jobs = dayJobs(data, eng).sort((a, b) => (spanOf(a, now)?.[0] ?? 0) - (spanOf(b, now)?.[0] ?? 0));
  const e = data.engineers.find((x) => x.id === eng)!;
  return (
    <div className="agenda">
      <section className="ag-tray" aria-label={t('d.tray')}>
        <h2>{t('d.tray')} <span className="tnum">{tray.length}</span></h2>
        {tray.length === 0 && <p className="tray-empty">{t('ag.empty')}</p>}
        <ul>
          {tray.map((j) => {
            const c = data.customers.find((x) => x.id === j.customer)!;
            return (
              <li key={j.id}>
                <a href={'#/dispatch/' + j.id}>
                  <b>{td(j.title)}{j.flags?.length ? <span className="tag-priority">{t('priority')}</span> : null}</b>
                  <span>{c.name} · {j.site.area}</span>
                  <span className="tnum muted">{windowText(j)}</span>
                </a>
              </li>
            );
          })}
        </ul>
        <p className="ag-note">{t('ag.note')}</p>
      </section>

      <div className="ag-engs" role="tablist" aria-label={t('d.eng')}>
        {data.engineers.map((x) => (
          <button key={x.id} role="tab" aria-selected={x.id === eng} className="ag-chip" onClick={() => setEng(x.id)}>
            {firstName(x.name)}{x.off ? t('ag.offchip') : ''}
          </button>
        ))}
      </div>

      <section className="ag-day" aria-label={t('ag.day', { e: e.name })}>
        <h2>{e.name}<span>{td(e.skills)}</span></h2>
        {e.off && <p className="tray-empty">{t('ag.off', { why: td(e.off) })}</p>}
        {!e.off && jobs.length === 0 && <p className="tray-empty">{t('ag.none')}</p>}
        <ol>
          {jobs.map((j) => {
            const s = spanOf(j, now)!;
            const c = data.customers.find((x) => x.id === j.customer)!;
            return (
              <li key={j.id}>
                <a href={'#/dispatch/' + j.id} className={s[0] <= now && now < s[1] ? 'is-now' : ''}>
                  <span className="tnum ag-time">{hhmm(s[0])}<small>{hhmm(s[1])}</small></span>
                  <span className="ag-what">
                    <b>{shortName(c)} · {j.site.area}</b>
                    <span>{td(j.title)}</span>
                    <Status view={statusOf(j, now)} />
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
