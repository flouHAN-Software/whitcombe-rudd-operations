import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../../data/store';
import { CODE_MEANING, dayLabel, dur, hhmm, money, needsTrade, nowStamp, stamp, statusOf, typeLabel, windowText } from '../../data/derive';
import { TODAY } from '../../data/today';
import type { Data, Engineer, EventKind, Job, JobPart } from '../../data/types';
import { Status } from '../../components/Status';
import { Icon } from '../../components/Icon';
import { cant, durOf, nextFree } from '../../data/plan';
import { invStatus, owed } from '../../data/billing';
import { t, td } from '../../lib/i18n';
import './jobs.css';

type Mode = null | 'assign' | 'hold';

const PART_STATE = (s: JobPart['state']) => t(`part.${s}`);
const KIND_LABEL = (k: EventKind) => t(`ev.${k}`);

export function JobDetail({ job, data, now, focusSignal, onClose, overlay = false, backLabel }: { job: Job; data: Data; now: number; focusSignal: number; onClose: () => void; overlay?: boolean; backLabel?: string }) {
  const { updateJob } = useStore();
  const [mode, setMode] = useState<Mode>(null);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const box = useRef<HTMLElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const st = statusOf(job, now);
  const cust = data.customers.find((c) => c.id === job.customer)!;
  const eng = data.engineers.find((e) => e.id === job.engineer);
  const first = eng?.name.split(' ')[0];
  const at = nowStamp(now);

  useEffect(() => {
    if (focusSignal) box.current?.focus();
  }, [focusSignal]);

  // Panel kısayolları: A ata, H beklet, N not. Esc önce açık formu kapatır.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.scrim')) return;
      const typing = (e.target as HTMLElement).closest('input, textarea, select');
      if (e.key === 'Escape' && mode) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setMode(null);
        return;
      }
      if (typing) return;
      if (e.key === 'a' && job.status !== 'done') { e.preventDefault(); setMode('assign'); }
      if (e.key === 'h' && !['done', 'on_hold'].includes(job.status)) { e.preventDefault(); setMode('hold'); }
      if (e.key === 'n') { e.preventDefault(); noteRef.current?.focus(); }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mode, job.status]);

  const backTo = () => (job.date && job.engineer ? 'booked' : 'unassigned') as Job['status'];

  // Olay metinleri veridir; firma İngiltere'de olduğu için İngilizce yazılır
  const act = {
    onWay: () => updateJob(job.id, { status: 'en_route', eta: now + 20 }, { at, kind: 'on_way', text: `Marked on the way for ${eng?.name}. ETA ${hhmm(now + 20)}, text sent to the customer.` }),
    arrived: () => updateJob(job.id, { status: 'on_site', arrived: now }, { at, kind: 'arrived', text: `Marked arrived for ${eng?.name}` }),
    complete: () => updateJob(job.id, { status: 'done', doneAt: now }, { at, kind: 'done', text: 'Marked complete from the office' }),
    partIn: () =>
      updateJob(
        job.id,
        { status: backTo(), parts: job.parts?.map((p) => (p.state === 'ordered' ? { ...p, state: 'at_depot', due: undefined } : p)) },
        { at, kind: 'part', text: job.date ? `Part arrived at the depot. Visit on ${job.date} goes ahead.` : 'Part arrived at the depot. Back in the tray to book a visit.' }
      ),
    resume: () => updateJob(job.id, { status: backTo(), holdReason: undefined }, { at, kind: 'hold', text: 'Taken off hold' })
  };

  function assign(e: Engineer) {
    const from = eng && eng.id !== e.id ? `Reassigned from ${eng.name} to ${e.name}` : `Assigned to ${e.name}`;
    // Bugünkü iş, teknisyenin ilk boş saatine yerleşir; tahtada hemen görünür
    let plan = job.plan;
    if (job.date === TODAY && ['unassigned', 'booked'].includes(job.status)) {
      const s = nextFree(data, e.id, now, durOf(job), job.id);
      plan = s !== null ? [s, durOf(job)] : undefined;
    }
    updateJob(
      job.id,
      { engineer: e.id, plan, status: job.status === 'unassigned' ? 'booked' : job.status },
      { at, kind: 'assigned', text: plan && job.date === TODAY ? `${from}, ${hhmm(plan[0])}` : from }
    );
    setMode(null);
  }

  function hold() {
    const r = reason.trim();
    if (!r) return;
    updateJob(job.id, { status: 'on_hold', holdReason: r }, { at, kind: 'hold', text: `On hold: ${r}` });
    setReason('');
    setMode(null);
  }

  function addNote() {
    const n = note.trim();
    if (!n) return;
    updateJob(job.id, {}, { at, kind: 'note', text: n });
    setNote('');
  }

  // Duruma göre tek ana eylem
  let primary: ReactNode = null;
  if (job.status === 'unassigned') primary = <button className="btn btn-primary" onClick={() => setMode('assign')}>{t('btn.assign')}</button>;
  if (job.status === 'booked' && job.date === TODAY) primary = <button className="btn btn-primary" onClick={act.onWay}>{t('btn.onway')}</button>;
  if (job.status === 'en_route') primary = <button className="btn btn-primary" onClick={act.arrived}>{t('btn.arrived')}</button>;
  if (job.status === 'on_site') primary = <button className="btn btn-primary" onClick={act.complete}>{t('btn.complete')}</button>;
  if (job.status === 'waiting_parts') primary = <button className="btn btn-primary" onClick={act.partIn}>{t('btn.partin')}</button>;
  if (job.status === 'on_hold') primary = <button className="btn btn-primary" onClick={act.resume}>{t('btn.unhold')}</button>;

  // Üstteki uyarılar: neden dikkat istiyor
  const alerts: { tone: 'late' | 'risk' | 'info'; text: ReactNode }[] = [];
  const who = first ?? t('a.noone');
  if (st.tone === 'late' && job.window) {
    const win = `${hhmm(job.window[0])}–${hhmm(job.window[1])}`;
    const tail = job.status === 'en_route' && job.eta !== undefined ? t('a.late.onway', { who, eta: hhmm(job.eta) }) : t('a.notoff', { who });
    alerts.push({ tone: 'late', text: t('a.late', { late: st.sub ?? '', win }) + tail });
  }
  if (st.tone === 'over' && job.plan) {
    const next = data.jobs
      .filter((x) => x.engineer === job.engineer && x.date === TODAY && x.status === 'booked' && x.plan)
      .sort((a, b) => a.plan![0] - b.plan![0])[0];
    const over = dur(now - (job.plan[0] + job.plan[1]));
    alerts.push({ tone: 'risk', text: t('a.over', { over, plan: dur(job.plan[1]) }) + (next ? t('a.next', { id: next.id, t: hhmm(next.plan![0]), area: next.site.area }) : '') });
  }
  if (st.tone === 'behind' && job.status === 'en_route') {
    alerts.push({ tone: 'risk', text: t('a.eta', { who, eta: job.eta !== undefined ? hhmm(job.eta) : '–' }) });
  } else if (st.tone === 'behind') {
    const cur = data.jobs.find((x) => x.engineer === job.engineer && x.date === TODAY && x.status === 'on_site');
    alerts.push({ tone: 'risk', text: t('a.behind', { t: job.plan ? hhmm(job.plan[0]) : '–' }) + (cur ? t('a.still', { who, id: cur.id, area: cur.site.area }) : t('a.notoff', { who })) });
  }
  if (job.status === 'on_hold' && job.holdReason) alerts.push({ tone: 'info', text: <>{t('a.hold')} {job.holdReason}</> });
  if (job.status === 'waiting_parts') {
    const p = job.parts?.find((x) => x.state === 'ordered');
    if (p)
      alerts.push({
        tone: 'info',
        text: t('a.waiting', { part: p.part, due: p.due ? t('a.due', { d: dayLabel(p.due) }) : '' }) + (job.date ? t('a.visit', { d: dayLabel(job.date) }) : t('a.tobook'))
      });
  }
  if (job.status !== 'done') job.flags?.forEach((f) => alerts.push({ tone: 'late', text: <><b>{t('a.prio')}</b> {f}</> }));
  // Müşterinin gecikmiş borcu varsa ziyaret öncesi görünsün
  const debt = owed(data.invoices, cust.id);
  if (debt.late > 0 && job.status !== 'done') alerts.push({ tone: 'risk', text: <a className="plain-link" href={'#/customers/' + cust.id}>{t('jd.owes', { c: cust.name, m: money(debt.late), d: debt.oldest })}</a> });
  const invoice = data.invoices.find((i) => i.job === job.id);

  const events = [...job.events].reverse();
  const kind = cust.kind === 'landlord' ? t('kind.landlord') : cust.kind === 'business' ? t('kind.business') : t('kind.household');

  return (
    <aside ref={box} className={'jd' + (overlay ? ' jd-overlay' : '')} aria-label={job.id} tabIndex={-1}>
      <div className="jd-top">
        <button type="button" className="jd-back" onClick={onClose}>
          <Icon name="chevron" className="flip" /> {backLabel ?? t('nav.jobs')}
        </button>
        <span className="jd-id tnum">{job.id}</span>
        <span className="jd-type">{typeLabel(job.type)}</span>
        <button type="button" className="icon-btn jd-close" onClick={onClose} aria-label={t('jd.close')} title={t('jd.close')}>
          <Icon name="close" />
        </button>
      </div>

      <div className="jd-head">
        <h2>{job.title}</h2>
        <div className="jd-state">
          <Status view={st} />
          <span className="jd-eng">{eng ? eng.name : t('jd.noeng')}</span>
        </div>
      </div>

      {alerts.length > 0 && (
        <ul className="jd-alerts">
          {alerts.map((a, i) => <li key={i} className={'alert alert-' + a.tone}>{a.text}</li>)}
        </ul>
      )}

      {job.status !== 'done' && (
        <div className="jd-actions">
          {primary}
          {job.status !== 'unassigned' && (
            <button className="btn" onClick={() => setMode(mode === 'assign' ? null : 'assign')} aria-expanded={mode === 'assign'}>
              {eng ? t('btn.reassign') : t('btn.assign')}
            </button>
          )}
          {job.status !== 'on_hold' && (
            <button className="btn btn-quiet" onClick={() => setMode(mode === 'hold' ? null : 'hold')} aria-expanded={mode === 'hold'}>
              {t('btn.hold')}
            </button>
          )}
        </div>
      )}

      {mode === 'assign' && <AssignList job={job} data={data} now={now} onPick={assign} onCancel={() => setMode(null)} />}

      {mode === 'hold' && (
        <form className="jd-form" onSubmit={(e) => { e.preventDefault(); hold(); }}>
          <label htmlFor="hold-reason">{t('hold.q')}</label>
          <input id="hold-reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('hold.ph')} />
          <div className="jd-form-row">
            <button className="btn btn-primary" type="submit" disabled={!reason.trim()}>{t('btn.hold')}</button>
            <button className="btn btn-quiet" type="button" onClick={() => setMode(null)}>{t('btn.cancel')}</button>
          </div>
        </form>
      )}

      <section className="jd-sec">
        <h3>{t('sec.said')}</h3>
        <p className="jd-said" lang="en">{job.detail}</p>
      </section>

      <section className="jd-sec">
        <dl className="facts">
          <Fact k={t('f.window')} v={<span className="tnum">{windowText(job)}</span>} />
          <Fact k={t('f.site')} v={<>{job.site.line}, {job.site.area}</>} />
          {job.contact && <Fact k={t('f.onsite')} v={<span lang="en">{job.contact}</span>} />}
          {job.access && <Fact k={t('f.access')} v={<span lang="en">{job.access}</span>} />}
          <Fact
            k={t('f.customer')}
            v={<><a href={'#/customers/' + cust.id}>{cust.name}</a><span className="muted"> · {kind} · {t('since', { y: cust.since })}</span><br /><span className="tnum">{cust.phone}</span></>}
          />
          {job.equipment && (
            <Fact
              k={t('f.equipment')}
              v={<>{job.equipment.make} {job.equipment.model}{job.equipment.fitted ? <span className="muted"> · {t('fitted', { y: job.equipment.fitted })}</span> : null}{job.equipment.extra ? <span className="muted"> · {job.equipment.extra}</span> : null}</>}
            />
          )}
          {job.code && <Fact k={t('f.code')} v={<>{job.code}{CODE_MEANING[job.code] ? <span className="muted"> · {td(CODE_MEANING[job.code])}</span> : null}</>} />}
          <Fact k={t('f.source')} v={td(job.source)} />
          {invoice && <Fact k={t('jd.inv')} v={<span className="jd-invfact"><a className="tnum" href={'#/invoices/' + invoice.id}>{invoice.id}</a> <Status view={invStatus(invoice)} compact /></span>} />}
        </dl>
      </section>

      {job.parts?.length ? (
        <section className="jd-sec">
          <h3>{t('sec.parts')}</h3>
          <ul className="jd-parts">
            {job.parts.map((p) => {
              const part = data.parts.find((x) => x.id === p.part);
              return (
                <li key={p.part} className={'pstate-' + p.state}>
                  <span className="tnum jd-code">{p.part}</span>
                  <span className="jd-pname">{part?.name ?? p.part}{p.qty > 1 ? ` × ${p.qty}` : ''}</span>
                  <span className="jd-pstate">{PART_STATE(p.state)}{p.due ? ` · ${dayLabel(p.due)}` : ''}</span>
                  {part && <span className="tnum jd-pcost">{money(part.cost * p.qty)}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="jd-sec">
        <h3>{t('sec.activity')}</h3>
        <form className="jd-note" onSubmit={(e) => { e.preventDefault(); addNote(); }}>
          <label htmlFor="note" className="sr-only">{t('note.label')}</label>
          <textarea
            id="note"
            ref={noteRef}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addNote(); } if (e.key === 'Escape') noteRef.current?.blur(); }}
            placeholder={t('note.ph')}
          />
          {note.trim() && (
            <div className="jd-form-row">
              <button className="btn btn-primary" type="submit">{t('note.add')}</button>
              <span className="muted">{t('note.or')}</span>
            </div>
          )}
        </form>
        <ol className="timeline">
          {events.map((ev, i) => (
            <li key={i} className={'ev ev-' + ev.kind}>
              <span className="ev-when tnum">{stamp(ev.at)}</span>
              <div className="ev-body">
                <span className="ev-head"><b>{KIND_LABEL(ev.kind)}</b> · {ev.by}</span>
                <p lang="en">{ev.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </aside>
  );
}

function Fact({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function AssignList({ job, data, now, onPick, onCancel }: { job: Job; data: Data; now: number; onPick: (e: Engineer) => void; onCancel: () => void }) {
  const need = needsTrade(job);
  const list = data.engineers
    .map((e) => {
      const mine = data.jobs.filter((x) => x.engineer === e.id && x.date === TODAY && x.status !== 'done' && x.id !== job.id);
      const ends = mine.map((x) => (x.plan ? x.plan[0] + x.plan[1] : x.window ? x.window[1] : 0));
      const free = Math.max(now, ...ends);
      const blocked = e.off ? td(e.off) : cant(e.trade, need);
      return { e, left: mine.length, free, blocked };
    })
    .sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked) || a.free - b.free);

  return (
    <div className="assign" role="group" aria-label={t('as.title')}>
      <div className="assign-head">
        <b>{t('as.title')}</b>
        <span className="muted">{need === 'gas' ? t('as.gas') : need === 'cooling' ? t('as.cool') : t('as.app')}</span>
      </div>
      <ul>
        {list.map(({ e, left, free, blocked }) => (
          <li key={e.id}>
            <button type="button" disabled={!!blocked} onClick={() => onPick(e)} aria-current={job.engineer === e.id || undefined}>
              <span className="as-av" aria-hidden="true">{e.initials}</span>
              <span className="as-name">{e.name}<small>{td(e.skills)}</small></span>
              <span className="as-load tnum">
                {blocked ? blocked : job.engineer === e.id ? t('as.assigned') : left === 0 ? t('as.free') : t('as.load', { n: left, t: hhmm(free) })}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button className="btn btn-quiet" type="button" onClick={onCancel}>{t('btn.cancel')}</button>
    </div>
  );
}
