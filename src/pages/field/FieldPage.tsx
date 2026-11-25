import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { PageHeader } from '../../components/Shell';
import { Status, StatusGlyph } from '../../components/Status';
import { useStore } from '../../data/store';
import { engineerOf, useAccount } from '../../lib/account';
import { demoDate, useDemoMinute } from '../../lib/clock';
import { t, td, tn } from '../../lib/i18n';
import { load, save } from '../../lib/storage';
import { CODE_MEANING, dur, hhmm, nowStamp, shortDate, stamp, statusOf, typeLabel, windowText } from '../../data/derive';
import { engDay } from '../../data/overview';
import { draftFor } from '../../data/billing';
import { TODAY } from '../../data/today';
import type { Customer, Data, Engineer, EventKind, Job } from '../../data/types';
import '../jobs/jobs.css';
import '../dispatch/dispatch.css';
import './field.css';

// Teknisyen uygulaması: telefonda tek elle kullanılır. Ana eylem başparmak bölgesinde, tek düğme.
// Akış Housecall Pro'dan: Yola çıkıyorum (müşteriye varış saatiyle SMS) → Vardım → İşi bitir.

type Sheet = null | 'way' | 'finish';
type Outcome = 'done' | 'part' | 'noaccess';
interface Toast { id: number; text: string; undo?: () => void }

const byPlan = (a: Job, b: Job) => (a.plan?.[0] ?? a.arrived ?? 0) - (b.plan?.[0] ?? b.arrived ?? 0);
const TRADES = ['gas', 'appliance', 'cooling'];
const ETAS = [15, 30, 45];

/** Form açılınca görünür alana kayar ve seçili seçeneğe odaklanır (telefonda düğmenin altında kalmasın) */
function useReveal() {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const f = ref.current;
    if (!f) return;
    f.scrollIntoView({ block: 'start', behavior: 'smooth' });
    f.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
  }, []);
  return ref;
}

export function FieldPage() {
  const { state, retry, updateJob, restoreJob, setParts, setInvoices, saveFailed, live } = useStore();
  const now = useDemoMinute();
  const data = state.phase === 'ready' ? state.data : null;
  // Teknisyen hesabı yalnızca kendi gününü görür; ofis hesabı herhangi bir teknisyenin ekranına bakabilir
  const { account } = useAccount();
  const locked = engineerOf(account);

  const [engId, setEngId] = useState(() => load<string>('field-eng', 'rhys'));
  useEffect(() => { save('field-eng', engId); }, [engId]);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [peek, setPeek] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.undo ? 8000 : 5000);
    return () => clearTimeout(id);
  }, [toast]);

  const engineers = useMemo(
    () => (data ? [...data.engineers].sort((a, b) => TRADES.indexOf(a.trade) - TRADES.indexOf(b.trade)) : []),
    [data]
  );
  const eng = engineers.find((e) => e.id === (locked ?? engId)) ?? engineers[0];
  const jobs = useMemo(
    () => (data && eng ? data.jobs.filter((j) => j.engineer === eng.id && j.date === TODAY).sort(byPlan) : []),
    [data, eng]
  );
  const current =
    jobs.find((j) => j.status === 'on_site') ?? jobs.find((j) => j.status === 'en_route') ?? jobs.find((j) => j.status === 'booked');
  const later = jobs.filter((j) => j !== current && j.status === 'booked');
  const done = jobs.filter((j) => j.status === 'done').sort((a, b) => (a.doneAt ?? 0) - (b.doneAt ?? 0));
  const day = data && eng ? engDay(data, eng, now) : null;

  // Teknisyen ya da iş değişince açık form kapanır
  useEffect(() => setSheet(null), [engId, current?.id, current?.status]);

  const say = (text: string, undo?: () => void) => setToast({ id: Date.now(), text, undo });

  // Canlı oturum: ofis bu teknisyenin gününe iş ekleyince ya da saatini değiştirince telefonda bildirim çıkar
  useEffect(() => {
    const e = live.last;
    if (!e || !locked || e.eng !== locked || (e.kind !== 'assigned' && e.kind !== 'moved')) return;
    const j = data?.jobs.find((x) => x.id === e.job);
    if (!j) return;
    say(t(e.kind === 'assigned' ? 'fa.t.new' : 'fa.t.moved', { by: e.by ?? t('fa.byoffice'), id: j.id, title: td(j.title), t: j.plan ? hhmm(j.plan[0]) : '' }));
    // yalnızca yeni olayda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.last?.n]);
  const cust = (j: Job) => data!.customers.find((c) => c.id === j.customer)!;

  function setOff(job: Job, mins: number) {
    const before = job;
    const eta = now + mins;
    updateJob(job.id, { status: 'en_route', eta }, { at: nowStamp(now), by: eng.name, kind: 'on_way', text: `On the way, ETA ${hhmm(eta)}. Text sent to the customer.` });
    say(t('fa.t.way', { c: cust(job).name, t: hhmm(eta) }), () => restoreJob(before));
  }

  function arrive(job: Job) {
    const before = job;
    updateJob(job.id, { status: 'on_site', arrived: now }, { at: nowStamp(now), by: eng.name, kind: 'arrived', text: 'Arrived on site' });
    say(t('fa.t.arr', { id: job.id }), () => restoreJob(before));
  }

  function finish(job: Job, outcome: Outcome, note: string, used: string[]) {
    const before = job;
    const partsBefore = data!.parts;
    const invoicesBefore = data!.invoices;
    const at = nowStamp(now);
    const off = { date: null, window: null, plan: undefined, eta: undefined } as const;
    if (outcome === 'done') {
      // Kullanılmayan araç parçası işten çıkar (faturaya da yazılmaz), kullanılan araçtan düşer
      const parts = job.parts
        ?.filter((p) => p.state !== 'on_van' || used.includes(p.part))
        .map((p) => (p.state === 'on_van' ? { ...p, state: 'used' as const } : p));
      updateJob(job.id, { status: 'done', doneAt: now, parts }, { at, by: eng.name, kind: 'done', text: note });
      if (used.length) {
        setParts((ps) =>
          ps.map((p) => {
            const jp = job.parts?.find((x) => x.part === p.id && used.includes(x.part));
            return jp ? { ...p, vans: { ...p.vans, [eng.id]: Math.max(0, (p.vans[eng.id] ?? 0) - jp.qty) } } : p;
          })
        );
      }
      // Fatura kuralı mağazadakiyle aynı: ücretlendirilmeyen iş türünde taslak açılmaz
      const billed = draftFor(job, cust(job), data!.parts, 'check', at) !== null;
      say(t(billed ? 'fa.t.done' : 'fa.t.done2', { id: job.id }), () => {
        restoreJob(before);
        setParts(() => partsBefore);
        setInvoices(() => invoicesBefore);
      });
    } else if (outcome === 'part') {
      updateJob(job.id, { status: 'waiting_parts', ...off }, { at, by: eng.name, kind: 'part', text: `Needs a part: ${note}` });
      say(t('fa.t.part', { id: job.id }), () => restoreJob(before));
    } else {
      updateJob(job.id, { status: 'on_hold', holdReason: 'No access', ...off }, { at, by: eng.name, kind: 'hold', text: `No access: ${note}` });
      say(t('fa.t.noaccess', { id: job.id }), () => restoreJob(before));
    }
  }

  const picker = data && !locked && (
    <label className="fa-as">
      <span>{t('fa.as')}</span>
      <select value={eng?.id} onChange={(e) => setEngId(e.target.value)}>
        {engineers.map((e) => (
          <option key={e.id} value={e.id}>{e.off ? t('fa.offopt', { name: e.name }) : e.name}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="field">
      <PageHeader title={t('nav.field')} meta={t(locked ? 'fa.meta.eng' : 'fa.meta')} actions={picker || undefined} />

      {saveFailed && <p className="banner banner-warn" role="status"><b>{t('save.fail.b')}</b> {t('save.fail')}</p>}
      {state.phase === 'loading' && <div className="fa-loading" aria-busy="true"><span /><span /></div>}
      {state.phase === 'error' && (
        <div className="state">
          <b>{t('load.fail.jobs')}</b>
          <p>{t('load.fail.text')}</p>
          <button className="btn" onClick={retry}>{t('retry')}</button>
        </div>
      )}

      {data && eng && (
        <div className="fa-wrap">
          <div className="fa" aria-label={eng.name}>
            <header className="fa-head">
              <b>{eng.name}</b>
              <span className="tnum">
                {shortDate(demoDate())} · {hhmm(now)}
                {day && day.left > 0 && day.ends !== null ? ` · ${tn('fa.left', day.left, { t: hhmm(day.ends) })}` : ''}
              </span>
            </header>

            {eng.off ? (
              <div className="fa-empty">
                <b>{t('fa.off', { name: eng.name })}</b>
                <p>{td(eng.off)}</p>
              </div>
            ) : !jobs.length ? (
              <div className="fa-empty">
                <b>{t('fa.nojobs')}</b>
                <p>{t('fa.nojobs.2')}</p>
              </div>
            ) : !current ? (
              <div className="fa-empty">
                <b>{t('fa.alldone')}</b>
                <p className="tnum">{t('fa.alldone.2', { t: hhmm(done.at(-1)?.doneAt ?? now) })}</p>
              </div>
            ) : (
              <CurrentJob
                key={current.id}
                job={current}
                c={cust(current)}
                d={data}
                eng={eng}
                now={now}
                sheet={sheet}
                setSheet={setSheet}
                onSetOff={(m) => setOff(current, m)}
                onArrive={() => arrive(current)}
                onFinish={(o, n, u) => finish(current, o, n, u)}
              />
            )}

            {later.length > 0 && (
              <section className="fa-sec" aria-labelledby="fa-later">
                <h3 id="fa-later">{t('fa.h.later')}</h3>
                <ul className="fa-list">
                  {later.map((j) => (
                    <li key={j.id}>
                      <button type="button" className="fa-row" aria-expanded={peek === j.id} onClick={() => setPeek(peek === j.id ? null : j.id)}>
                        <b className="tnum">{j.plan ? hhmm(j.plan[0]) : '–'}</b>
                        <span>
                          {typeLabel(j.type)} · {j.site.area}
                          <span className="fa-row-sub tnum">{cust(j).name} · {windowText(j)}</span>
                        </span>
                      </button>
                      {peek === j.id && (
                        <div className="fa-peek">
                          <p><b>{td(j.title)}</b></p>
                          <p>{j.site.line}, {j.site.area}</p>
                          <p className="fa-said">{td(j.detail)}</p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {done.length > 0 && (
              <section className="fa-sec" aria-labelledby="fa-done">
                <h3 id="fa-done">{t('fa.h.done')}</h3>
                <ul className="fa-list fa-done">
                  {done.map((j) => (
                    <li key={j.id}>
                      <span className="st st-done"><StatusGlyph tone="done" /></span>
                      <span>
                        {typeLabel(j.type)} · {j.site.area}
                        <span className="fa-row-sub tnum">{cust(j).name} · {t('fa.doneat', { t: j.doneAt !== undefined ? hhmm(j.doneAt) : '' })}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {!locked && <OfficeView d={data} eng={eng} jobs={jobs} now={now} />}
        </div>
      )}

      {toast && (
        <div key={toast.id} className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && (
            <button className="btn btn-quiet" onClick={() => { toast.undo!(); setToast(null); }}>{t('undo')}</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- şu anki iş ---------- */

interface CurrentProps {
  job: Job;
  c: Customer;
  d: Data;
  eng: Engineer;
  now: number;
  sheet: Sheet;
  setSheet: (s: Sheet) => void;
  onSetOff: (mins: number) => void;
  onArrive: () => void;
  onFinish: (o: Outcome, note: string, used: string[]) => void;
}

function CurrentJob({ job, c, d, eng, now, sheet, setSheet, onSetOff, onArrive, onFinish }: CurrentProps) {
  const st = statusOf(job, now);
  const heading = job.status === 'booked' ? t('fa.h.next') : t('fa.h.now');

  let line = null;
  if (job.status === 'on_site' && job.arrived !== undefined && job.plan) {
    const el = now - job.arrived;
    const over = el - job.plan[1];
    line = (
      <div className={'fa-timer' + (over > 0 ? ' is-over' : '')}>
        <span className="tnum">{over > 0 ? t('fa.overrun', { d: dur(over) }) : t('fa.onsite', { d: dur(el), p: dur(job.plan[1]) })}</span>
        <span className="fa-bar-track" aria-hidden="true"><i style={{ width: `${Math.min(100, (el / job.plan[1]) * 100)}%` }} /></span>
      </div>
    );
  } else if (job.status === 'en_route' && job.eta !== undefined) {
    line = <p className="fa-line tnum">{t('fa.driving', { t: hhmm(job.eta) })}</p>;
  } else if (job.status === 'booked' && job.plan) {
    line = <p className="fa-line tnum">{t('fa.start', { t: hhmm(job.plan[0]), w: windowText(job) })}</p>;
  }

  const action =
    job.status === 'booked' ? { label: t('fa.btn.way'), go: () => setSheet(sheet === 'way' ? null : 'way') }
    : job.status === 'en_route' ? { label: t('fa.btn.arrived'), go: onArrive }
    : { label: t('fa.btn.finish'), go: () => setSheet(sheet === 'finish' ? null : 'finish') };

  return (
    <section className="fa-cur" aria-labelledby="fa-cur-h">
      <div className="fa-cur-top">
        <h3 id="fa-cur-h">{heading}</h3>
        <Status view={st} />
      </div>
      {line}
      <h2 className="fa-title">{td(job.title)}</h2>
      <p className="fa-type tnum">{job.id} · {typeLabel(job.type)}{job.code ? ` · ${job.code}` : ''}</p>

      {job.flags?.length ? (
        <ul className="jd-alerts fa-alerts">
          {job.flags.map((f) => <li key={f} className="alert alert-late">{td(f)}</li>)}
        </ul>
      ) : null}

      <div className="fa-cust">
        <div>
          <b>{c.name}</b>
          <span>{job.site.line}, {job.site.area}</span>
        </div>
        <a className="btn fa-call" href={`tel:${c.phone.replace(/\s/g, '')}`}>{t('fa.call')}</a>
      </div>

      <dl className="facts fa-facts">
        {job.contact && <div><dt>{t('f.onsite')}</dt><dd>{td(job.contact)}</dd></div>}
        {job.access && <div><dt>{t('f.access')}</dt><dd>{td(job.access)}</dd></div>}
        {job.equipment && (
          <div>
            <dt>{t('f.equipment')}</dt>
            <dd>{job.equipment.make} {td(job.equipment.model)}{job.equipment.fitted ? <span className="muted"> · {t('fitted', { y: job.equipment.fitted })}</span> : null}</dd>
          </div>
        )}
        {job.code && <div><dt>{t('f.code')}</dt><dd>{job.code}{CODE_MEANING[job.code] ? <span className="muted"> · {td(CODE_MEANING[job.code])}</span> : null}</dd></div>}
      </dl>

      <div className="fa-block">
        <h4>{t('sec.said')}</h4>
        <p className="fa-said">{td(job.detail)}</p>
      </div>

      {job.parts?.length ? (
        <div className="fa-block">
          <h4>{t('sec.parts')}</h4>
          <ul className="fa-parts">
            {job.parts.map((p) => {
              const part = d.parts.find((x) => x.id === p.part);
              return (
                <li key={p.part} className={'pstate-' + p.state}>
                  <span className="tnum fa-code">{p.part}</span>
                  <span>{part ? td(part.name) : p.part}{p.qty > 1 ? ` × ${p.qty}` : ''}</span>
                  <span className="fa-pstate">{t(`part.${p.state}`)}{p.state === 'at_depot' && part ? ` · ${part.bin}` : ''}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {sheet === 'way' && <WayForm job={job} c={c} eng={eng} now={now} onSend={onSetOff} onCancel={() => setSheet(null)} />}
      {sheet === 'finish' && <FinishForm job={job} d={d} eng={eng} onSend={onFinish} onCancel={() => setSheet(null)} />}

      {!sheet && (
        <div className="fa-action">
          <button type="button" className="btn btn-primary fa-go" onClick={action.go}>{action.label}</button>
        </div>
      )}
    </section>
  );
}

function WayForm({ job, c, eng, now, onSend, onCancel }: { job: Job; c: Customer; eng: Engineer; now: number; onSend: (m: number) => void; onCancel: () => void }) {
  const [mins, setMins] = useState(30);
  const ref = useReveal();
  const first = eng.name.split(' ')[0];
  // Emlak ve işletme işlerinde SMS yerindeki kişiye gider (kiracı, muayenehane müdürü)
  const who = job.contact ? job.contact.split(': ')[1]?.split(' ')[0] : c.kind === 'household' ? c.name.split(' ')[0] : '';
  return (
    <form ref={ref} className="fa-form" onSubmit={(e) => { e.preventDefault(); onSend(mins); }} aria-label={t('fa.btn.way')}>
      <fieldset className="fa-fs">
        <legend>{t('fa.eta.q')}</legend>
        <div className="seg fa-seg" role="radiogroup">
          {ETAS.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mins === m} onClick={() => setMins(m)}>
              <span className="tnum">{t('fa.eta.n', { n: m })}</span>
              <span className="fa-seg-sub tnum">{hhmm(now + m)}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="fa-sms">
        <span className="fa-sms-k">{t('fa.sms')} · {job.contact ? <span>{td(job.contact.split(' meets')[0])}</span> : <span className="tnum">{c.phone}</span>}</span>
        <p>{t(who ? 'fa.sms.hi' : 'fa.sms.hello', { who, first, t: hhmm(now + mins) })}</p>
      </div>
      <div className="fa-form-row">
        <button type="submit" className="btn btn-primary fa-go">{t('fa.sms.send')}</button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>{t('btn.cancel')}</button>
      </div>
    </form>
  );
}

function FinishForm({ job, d, onSend, onCancel }: { job: Job; d: Data; eng: Engineer; onSend: (o: Outcome, note: string, used: string[]) => void; onCancel: () => void }) {
  const vanParts = (job.parts ?? []).filter((p) => p.state === 'on_van');
  const [outcome, setOutcome] = useState<Outcome>('done');
  const [note, setNote] = useState('');
  const [used, setUsed] = useState<string[]>(() => vanParts.map((p) => p.part));
  const [err, setErr] = useState(false);
  const ref = useReveal();
  const outcomes: Outcome[] = ['done', 'part', 'noaccess'];

  function submit(e: FormEvent) {
    e.preventDefault();
    if (note.trim().length < 3) { setErr(true); return; }
    onSend(outcome, note.trim(), outcome === 'done' ? used : []);
  }

  return (
    <form ref={ref} className="fa-form" onSubmit={submit} aria-label={t('fa.btn.finish')} noValidate>
      <fieldset className="fa-fs">
        <legend>{t('fa.out.q')}</legend>
        <div className="seg fa-seg" role="radiogroup">
          {outcomes.map((o) => (
            <button key={o} type="button" role="radio" aria-checked={outcome === o} onClick={() => setOutcome(o)}>
              {t(`fa.out.${o}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <label htmlFor="fa-note" className="fa-label">{t(`fa.note.${outcome}`)}</label>
      <textarea
        id="fa-note"
        rows={3}
        value={note}
        onChange={(e) => { setNote(e.target.value); if (err) setErr(false); }}
        aria-invalid={err}
        aria-describedby="fa-note-hint"
      />
      <p id="fa-note-hint" className={err ? 'fa-err' : 'fa-hint'}>{err ? t('fa.err.note') : t('fa.note.hint')}</p>

      {outcome === 'done' && vanParts.length > 0 && (
        <fieldset className="fa-fs">
          <legend>{t('fa.used')}</legend>
          {vanParts.map((p) => {
            const part = d.parts.find((x) => x.id === p.part);
            return (
              <label key={p.part} className="fa-check">
                <input
                  type="checkbox"
                  checked={used.includes(p.part)}
                  onChange={(e) => setUsed(e.target.checked ? [...used, p.part] : used.filter((x) => x !== p.part))}
                />
                <span><span className="tnum">{p.part}</span> {part ? td(part.name) : ''}{p.qty > 1 ? ` × ${p.qty}` : ''}</span>
              </label>
            );
          })}
        </fieldset>
      )}

      <div className="fa-form-row">
        <button type="submit" className="btn btn-primary fa-go">{outcome === 'done' ? t('fa.send.done') : t('fa.send.back')}</button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>{t('btn.cancel')}</button>
      </div>
    </form>
  );
}

/* ---------- ofisin gördüğü (yalnızca geniş ekranda) ---------- */

const FEED: EventKind[] = ['on_way', 'arrived', 'done', 'part', 'hold', 'note'];

function OfficeView({ d, eng, jobs, now }: { d: Data; eng: Engineer; jobs: Job[]; now: number }) {
  const current = jobs.find((j) => j.status === 'on_site') ?? jobs.find((j) => j.status === 'en_route');
  // Bugün bu teknisyenin gönderdiği kayıtlar; ofise geri dönen işler de dahil
  const feed = d.jobs
    .flatMap((j) => j.events.filter((e) => e.by === eng.name && e.at.startsWith(TODAY) && FEED.includes(e.kind)).map((e) => ({ e, j })))
    .sort((a, b) => b.e.at.localeCompare(a.e.at))
    .slice(0, 6);
  const first = eng.name.split(' ')[0];

  return (
    <aside className="fa-office" aria-labelledby="fa-office-h">
      <h2 id="fa-office-h" className="ov-h">{t('fa.office')}</h2>
      {current && (
        <p className="fa-office-st">
          <span className="muted">{t('fa.office.st')}</span>
          <a href={`#/dispatch/${current.id}`} className="tnum">{current.id}</a>
          <Status view={statusOf(current, now)} />
        </p>
      )}
      <h3 className="fa-office-h3">{t('fa.office.feed', { name: first })}</h3>
      {feed.length ? (
        <ol className="fa-feed">
          {feed.map(({ e, j }) => (
            <li key={j.id + e.at + e.kind}>
              <span className="tnum fa-feed-t">{stamp(e.at)}</span>
              <span>
                <a href={`#/jobs/${j.id}`} className="tnum">{j.id}</a>
                <span> {td(e.text)}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">{t('fa.office.none')}</p>
      )}
    </aside>
  );
}
