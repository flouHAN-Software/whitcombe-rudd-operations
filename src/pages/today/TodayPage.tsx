import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { useWidth } from '../../lib/useWidth';
import { PageHeader } from '../../components/Shell';
import { Icon } from '../../components/Icon';
import { Status, StatusGlyph } from '../../components/Status';
import { useStore } from '../../data/store';
import { demoDate, useDemoMinute } from '../../lib/clock';
import { getLang, t, td, tn } from '../../lib/i18n';
import { save } from '../../lib/storage';
import { dur, hhmm, money, shortDate, statusOf, typeLabel, weekday, windowText } from '../../data/derive';
import { DAY_START, SPAN } from '../../data/plan';
import { balanceOf } from '../../data/billing';
import {
  WORK_END, engDays, moneyToday, needs, planCurve, stockToday, stripOf, tradeLoad,
  type EngDay, type Need, type TradeLoad
} from '../../data/overview';
import type { Data, Trade } from '../../data/types';
import { TODAY } from '../../data/today';
import type { Key } from '../../lib/strings';
import './today.css';

// Bugün: sabah 10:34'te operasyon müdürünün ilk açtığı ekran.
// Yapılacaklar listesi (Shopify ana sayfası), plana göre gün eğrisi (Stripe'ın "bugün" grafiği),
// havuz ile boş zaman karşılaştırması (ServiceTitan kapasite planı). Dört eş kart yok.

const lower = (s: string) => s.toLocaleLowerCase(getLang() === 'tr' ? 'tr' : 'en');

/** Bağlantıdan önce hedef ekranın sekmesini ayarlar */
const preset = (key: string, view: string) => () => { save(key, view); };

export function TodayPage() {
  const { state, retry } = useStore();
  const now = useDemoMinute();
  const data = state.phase === 'ready' ? state.data : null;

  const calc = useMemo(() => {
    if (!data) return null;
    const days = engDays(data, now);
    return {
      days,
      load: tradeLoad(data, days),
      curve: planCurve(data, now),
      needs: needs(data, now),
      money: moneyToday(data),
      stock: stockToday(data)
    };
  }, [data, now]);

  const list = useRef<HTMLUListElement>(null);

  // J/K ile listede gezinme (Linear'daki gibi), Enter bağlantıyı açar
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.scrim')) return;
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return;
      const k = e.key.toLowerCase();
      if (k !== 'j' && k !== 'k') return;
      const rows = [...(list.current?.querySelectorAll<HTMLAnchorElement>('a[data-need]') ?? [])];
      if (!rows.length) return;
      e.preventDefault();
      const at = rows.indexOf(document.activeElement as HTMLAnchorElement);
      const next = at < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, at + (k === 'j' ? 1 : -1)));
      rows[next].focus();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const working = data ? data.engineers.filter((e) => !e.off) : [];
  const off = data ? data.engineers.filter((e) => e.off) : [];
  const meta = data
    ? [
        t('ov.meta', { d: shortDate(demoDate()), t: hhmm(now), n: working.length }),
        ...off.map((e) => t('ov.off', { name: e.name, why: lower(td(e.off!)) }))
      ].join(' · ')
    : t('loading');

  return (
    <div className="today">
      <PageHeader title={t('nav.today')} meta={meta} />

      {state.phase === 'loading' && (
        <div className="ov-loading" aria-busy="true">
          <span /><span /><span />
        </div>
      )}
      {state.phase === 'error' && (
        <div className="state">
          <b>{t('load.fail.jobs')}</b>
          <p>{t('load.fail.text')}</p>
          <button className="btn" onClick={retry}>{t('retry')}</button>
        </div>
      )}

      {data && calc && (
        <div className="ov">
          <div className="ov-top">
            <section className="ov-sec ov-needs" aria-labelledby="ov-needs-h">
              <h2 id="ov-needs-h" className="ov-h">
                {t('ov.needs')} {calc.needs.length > 0 && <span className="ov-count tnum">{calc.needs.length}</span>}
              </h2>
              {calc.needs.length === 0 ? (
                <div className="ov-empty">
                  <b>{t('ov.none.1')}</b>
                  <p>{t('ov.none.2')}</p>
                </div>
              ) : (
                <ul className="needs" ref={list}>
                  {calc.needs.map((n, i) => (
                    <NeedRow key={n.kind + i} n={n} d={data} now={now} days={calc.days} load={calc.load} />
                  ))}
                </ul>
              )}
            </section>

            <div className="ov-side">
              <PlanSection curve={calc.curve} now={now} />
              <CapSection load={calc.load} />
            </div>
          </div>

          <EngSection days={calc.days} d={data} now={now} />

          <div className="ov-ledgers">
            <MoneySection m={calc.money} />
            <StockSection s={calc.stock} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- hemen bakılacaklar ---------- */

function NeedRow({ n, d, now, days, load }: { n: Need; d: Data; now: number; days: EngDay[]; load: TradeLoad[] }) {
  const cust = (id: string) => d.customers.find((c) => c.id === id)?.name ?? id;
  const eng = (id: string | null) => d.engineers.find((e) => e.id === id)?.name ?? '';
  let title = '';
  let sub = '';
  let href = '#/today';
  let act = '';
  let onClick: (() => void) | undefined;
  const j = n.job;

  switch (n.kind) {
    case 'late': {
      const way = [...j!.events].reverse().find((e) => e.kind === 'on_way');
      title = t('ov.n.late', { eng: eng(j!.engineer), d: n.view.sub ?? '', cust: cust(j!.customer) });
      sub = way && j!.status === 'en_route' ? t('ov.n.late.way', { w: windowText(j!), t: way.at.slice(11) }) : t('ov.n.late.book', { w: windowText(j!) });
      href = `#/jobs/${j!.id}`;
      act = t('ov.go.job');
      break;
    }
    case 'over': {
      const over = j!.plan ? now - (j!.plan[0] + j!.plan[1]) : 0;
      title = t('ov.n.over', { eng: eng(j!.engineer), d: dur(over), cust: cust(j!.customer) });
      const day = days.find((x) => x.e.id === j!.engineer);
      sub = n.next?.plan && day?.nextAt !== undefined && day.next === n.next
        ? t('ov.n.over.next', { id: n.next.id, t: hhmm(n.next.plan[0]), e: hhmm(day.nextAt) })
        : t('ov.n.over.alone', { t: hhmm(j!.arrived ?? j!.plan![0]), p: dur(j!.plan![1]) });
      href = `#/dispatch/${n.next?.id ?? j!.id}`;
      act = t('ov.go.board');
      break;
    }
    case 'notstarted':
      title = t('ov.n.notstarted', { eng: eng(j!.engineer), cust: cust(j!.customer) });
      sub = t('ov.n.due', { t: hhmm(j!.plan![0]), w: windowText(j!) });
      href = `#/dispatch/${j!.id}`;
      act = t('ov.go.board');
      break;
    case 'notarrived':
      title = t('ov.n.notarr', { eng: eng(j!.engineer), cust: cust(j!.customer) });
      sub = t('ov.n.eta', { t: hhmm(j!.eta ?? 0), w: windowText(j!) });
      href = `#/jobs/${j!.id}`;
      act = t('ov.go.job');
      break;
    case 'pool':
      title = t('ov.n.pool', { cust: cust(j!.customer) });
      sub = [typeLabel(j!.type), j!.site.area, ...(j!.flags ?? []).map(td)].join(' · ');
      href = `#/jobs/${j!.id}`;
      act = t('ov.go.assign');
      break;
    case 'depot': {
      const p = n.part!;
      title = t('ov.n.depot', { eng: eng(j!.engineer), code: p.id });
      sub = t('ov.n.depot.sub', { name: td(p.name), id: j!.id, n: p.depot, bin: p.bin });
      href = `#/stock/${p.id}`;
      act = t('ov.go.part');
      break;
    }
    case 'card': {
      const inv = n.inv!;
      const sent = inv.events.find((e) => e.kind === 'sent');
      title = t('ov.n.card', { cust: cust(inv.customer), m: money(balanceOf(inv)) });
      sub = [
        sent ? t('ov.n.card.sub', { id: inv.id, t: sent.at.slice(11) }) : inv.id,
        ...(n.alsoLate ? [t('ov.n.card.late', { m: money(n.alsoLate) })] : [])
      ].join(' · ');
      href = `#/invoices/${inv.id}`;
      act = t('ov.go.inv');
      break;
    }
    case 'poolmore': {
      const jobs = n.jobs!;
      const short = load.find((l) => l.pool.length && l.need > l.free);
      title = tn('ov.n.poolmore', jobs.length);
      sub = [
        ...jobs.map((x) => `${windowText(x)} ${typeLabel(x.type)}`),
        short ? t('ov.n.short', { trade: lower(t(`grp.${short.trade}` as Key)) }) : t('ov.n.fits')
      ].join(' · ');
      href = '#/dispatch';
      act = t('ov.go.place');
      break;
    }
    case 'drafts': {
      const inv = n.invoices!;
      const auto = inv.every((x) => x.job && x.issued === TODAY);
      const sum = money(inv.reduce((s, x) => s + balanceOf(x), 0));
      title = tn('ov.n.drafts', inv.length);
      sub = auto ? t('ov.n.drafts.sub', { m: sum }) : sum;
      href = '#/invoices';
      onClick = preset('inv-view', 'drafts');
      act = t('ov.go.send');
      break;
    }
  }

  return (
    <li>
      <a className={'need tone-' + n.view.tone} href={href} onClick={onClick} data-need>
        <span className={'need-glyph st-' + n.view.tone}><StatusGlyph tone={n.view.tone} /></span>
        <span className="need-text">
          <b>{title}</b>
          <span>{sub}</span>
        </span>
        <span className="need-act">
          {act}
          <Icon name="chevron" size={14} />
        </span>
      </a>
    </li>
  );
}

/* ---------- plana göre ---------- */


const X0 = 8 * 60;
const X1 = 18 * 60;

function PlanSection({ curve, now }: { curve: ReturnType<typeof planCurve>; now: number }) {
  const [box, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const diff = curve.doneNow - curve.dueNow;

  const H = 184;
  const pad = { l: 26, r: 6, t: 12, b: 26 };
  const pw = Math.max(0, w - pad.l - pad.r);
  const ph = H - pad.t - pad.b;
  const yMax = Math.max(10, Math.ceil(curve.total / 10) * 10);
  const x = (m: number) => pad.l + ((Math.min(Math.max(m, X0), X1) - X0) / (X1 - X0)) * pw;
  const y = (n: number) => pad.t + ph - (n / yMax) * ph;

  /** Basamaklı birikimli çizgi: her bitişte bir basamak */
  const steps = (list: number[], end: number) => {
    let p = `M${x(X0)},${y(0)}`;
    let n = 0;
    for (const m of list) {
      if (m > end) break;
      p += `H${x(m)}V${y(++n)}`;
    }
    return p + `H${x(end)}`;
  };

  const ticks = pw < 260 ? [8, 12, 16] : pw < 360 ? [8, 10, 12, 14, 16] : [8, 10, 12, 14, 16, 18];
  const nowX = x(now);
  const doneN = curve.doneNow;
  const lastPlanned = curve.planned.at(-1) ?? X1;

  function onMove(e: RPointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const m = X0 + ((e.clientX - r.left - pad.l) / pw) * (X1 - X0);
    setHover(Math.round(Math.min(Math.max(m, X0), X1) / 15) * 15);
  }

  const hoursRows = Array.from({ length: 11 }, (_, i) => X0 + i * 60);

  return (
    <section className="ov-sec ov-plan" aria-labelledby="ov-plan-h">
      <div className="ov-hrow">
        <h2 id="ov-plan-h" className="ov-h">{t('ov.plan')}</h2>
        <span className={'ov-verdict ' + (diff < 0 ? 'is-behind' : diff > 0 ? 'is-ahead' : '')}>
          {diff < 0 ? t('ov.plan.behind', { n: -diff }) : diff > 0 ? t('ov.plan.ahead', { n: diff }) : t('ov.plan.on')}
        </span>
      </div>
      <p className="ov-sub tnum">{t('ov.plan.sum', { done: curve.doneNow, total: curve.total, due: curve.dueNow })}</p>

      <div className="ov-legend" aria-hidden="true">
        <span><i className="lg-done" />{t('ov.plan.done')}</span>
        <span><i className="lg-plan" />{t('ov.plan.planned')}</span>
      </div>

      <div className="chart" ref={box}>
        {w > 0 && (
          <svg width={w} height={H} onPointerMove={onMove} onPointerLeave={() => setHover(null)} aria-hidden="true">
            {[0, yMax / 2, yMax].map((n) => (
              <g key={n}>
                <line className="ch-grid" x1={pad.l} x2={pad.l + pw} y1={y(n)} y2={y(n)} />
                <text className="ch-y" x={pad.l - 8} y={y(n)} dy="0.35em">{n}</text>
              </g>
            ))}
            {ticks.map((h) => (
              <text key={h} className="ch-x" x={x(h * 60)} y={H - 6} textAnchor={h === 18 ? 'end' : 'middle'}>{`${String(h).padStart(2, '0')}:00`}</text>
            ))}
            <path className="ch-plan" d={steps(curve.planned, X1)} />
            <path className="ch-done" d={steps(curve.done, now)} />
            <line className="ch-now" x1={nowX} x2={nowX} y1={pad.t - 4} y2={pad.t + ph} />
            {hover !== null && <line className="ch-cross" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ph} />}
            <circle className="ch-dot" cx={nowX} cy={y(doneN)} r={4} />
            <text className="ch-label" x={nowX + 8} y={y(doneN)} dy="0.35em">{doneN}</text>
            <text className="ch-label is-plan" x={x(lastPlanned)} y={y(curve.planned.length) - 8} textAnchor="end">{curve.planned.length}</text>
          </svg>
        )}
        {hover !== null && w > 0 && (
          <div className="ch-tip" style={{ left: Math.min(Math.max(x(hover), 70), w - 70) }}>
            <b className="tnum">{hhmm(hover)}</b>
            <span className="tnum"><i className="lg-plan" />{t('ov.plan.planned')} {curve.countBy(curve.planned, hover)}</span>
            {hover <= now && <span className="tnum"><i className="lg-done" />{t('ov.plan.done')} {curve.countBy(curve.done, hover)}</span>}
          </div>
        )}
      </div>

      <div className="sr-only"><table>
        <caption>{t('ov.plan.table')}</caption>
        <thead>
          <tr><th>{t('ov.plan.time')}</th><th>{t('ov.plan.planned')}</th><th>{t('ov.plan.done')}</th></tr>
        </thead>
        <tbody>
          {hoursRows.map((m) => (
            <tr key={m}>
              <td>{hhmm(m)}</td>
              <td>{curve.countBy(curve.planned, m)}</td>
              <td>{m <= now ? curve.countBy(curve.done, m) : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="ov-note">{t('ov.plan.note')}</p>
    </section>
  );
}

/* ---------- havuz ve boş zaman ---------- */

function CapSection({ load }: { load: TradeLoad[] }) {
  return (
    <section className="ov-sec ov-cap" aria-labelledby="ov-cap-h">
      <h2 id="ov-cap-h" className="ov-h">{t('ov.cap')}</h2>
      <table className="load">
        <thead>
          <tr>
            <th scope="col">{t('ov.cap.trade')}</th>
            <th scope="col">{t('ov.cap.pool')}</th>
            <th scope="col" className="num">{t('ov.cap.free')}</th>
          </tr>
        </thead>
        <tbody>
          {load.map((l) => {
            const short = l.need > l.free;
            return (
              <tr key={l.trade}>
                <th scope="row">
                  <b>{t(`grp.${l.trade}` as Key)}</b>
                  <span>{tn('ov.cap.people', l.people)}</span>
                </th>
                <td>
                  {l.pool.length ? tn('ov.cap.jobs', l.pool.length, { d: dur(l.need) }) : <span className="muted">{t('ov.cap.zero')}</span>}
                  {l.pool.length > 0 && (
                    <span className={'load-v ' + (short ? 'st-late' : 'st-done')}>
                      {short ? t('ov.cap.short', { d: dur(l.need - l.free) }) : t('ov.cap.fits')}
                    </span>
                  )}
                </td>
                <td className="num tnum">{dur(l.free)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="ov-note">{t('ov.cap.note')}</p>
    </section>
  );
}

/* ---------- teknisyenler ---------- */

const TRADE_ORDER: Trade[] = ['gas', 'appliance', 'cooling'];

function EngSection({ days, d, now }: { days: EngDay[]; d: Data; now: number }) {
  const onSite = days.filter((x) => x.current?.status === 'on_site').length;
  const onWay = days.filter((x) => x.current?.status === 'en_route').length;
  const between = days.filter((x) => !x.e.off && !x.current && x.next).length;
  const sorted = [...days].sort((a, b) => TRADE_ORDER.indexOf(a.e.trade) - TRADE_ORDER.indexOf(b.e.trade));
  const cust = (id: string) => d.customers.find((c) => c.id === id)?.name ?? id;
  const pct = (m: number) => `${((m - DAY_START) / SPAN) * 100}%`;

  return (
    <section className="ov-sec ov-eng" aria-labelledby="ov-eng-h">
      <div className="ov-hrow">
        <h2 id="ov-eng-h" className="ov-h">{t('ov.eng')}</h2>
        <span className="ov-sub tnum">{t('ov.eng.sum', { a: onSite, b: onWay, c: between })}</span>
      </div>
      <div className="elist" role="table" aria-label={t('ov.eng')}>
        <div className="erow ehead" role="row">
          <span role="columnheader">{t('ov.c.eng')}</span>
          <span role="columnheader" className="e-day">{t('ov.c.day')}</span>
          <span role="columnheader">{t('ov.c.now')}</span>
          <span role="columnheader">{t('ov.c.next')}</span>
          <span role="columnheader">{t('ov.c.left')}</span>
          <span role="columnheader" className="num">{t('ov.c.free')}</span>
        </div>
        {sorted.map((x) => {
          const blocks = stripOf(x, now);
          const slip = x.next?.plan && x.nextAt !== undefined ? x.nextAt - x.next.plan[0] : 0;
          const late18 = x.ends !== null && x.ends > WORK_END;
          return (
            <div key={x.e.id} className={'erow' + (x.e.off ? ' is-off' : '')} role="row">
              <span role="cell" className="e-name">
                <b>{x.e.name}</b>
                <span>{td(x.e.skills)}</span>
              </span>
              <span role="cell" className="e-day">
                <span className="strip" role="img" aria-label={tn('ov.e.strip', x.jobs.length, { name: x.e.name })}>
                  {blocks.map((b) => (
                    <span key={b.j.id} className={'sb sb-' + b.view.tone} title={`${b.j.id} · ${b.view.label} · ${hhmm(b.span[0])}–${hhmm(b.span[1])}`} style={{ left: pct(b.span[0]), width: `calc(${((b.span[1] - b.span[0]) / SPAN) * 100}% - 2px)` }} />
                  ))}
                  <span className="strip-now" style={{ left: pct(now) }} />
                </span>
              </span>
              <span role="cell" className="e-now">
                {x.e.off ? (
                  <span className="muted">{td(x.e.off)}</span>
                ) : x.current ? (
                  <a href={`#/jobs/${x.current.id}`} className="e-link">
                    <Status view={statusOf(x.current, now)} />
                    <span className="e-where">{cust(x.current.customer)}, {x.current.site.area}</span>
                  </a>
                ) : x.next ? (
                  <span className="st st-booked"><StatusGlyph tone="booked" /><span className="st-label">{t('ov.e.between')}</span></span>
                ) : x.jobs.length ? (
                  <span className="st st-done"><StatusGlyph tone="done" /><span className="st-label">{t('ov.e.finished')}</span></span>
                ) : null}
              </span>
              <span role="cell" className="e-next">
                {x.next && x.next.plan ? (
                  <a href={`#/jobs/${x.next.id}`} className="e-link">
                    <span className="e-k">{t('ov.c.next')}</span>
                    <span className="tnum"><b>{hhmm(x.next.plan[0])}</b> {typeLabel(x.next.type)} · {x.next.site.area}</span>
                    {slip > 10 && <span className="e-slip tnum">{t('ov.e.about', { t: hhmm(x.nextAt!) })}</span>}
                  </a>
                ) : null}
              </span>
              <span role="cell" className={'e-left tnum' + (late18 ? ' is-over' : '')}>
                {x.left > 0 && x.ends !== null ? tn('ov.e.left', x.left, { t: hhmm(x.ends) }) : ''}
              </span>
              <span role="cell" className="e-free num tnum">
                {!x.e.off && <span className="e-k">{t('ov.c.free')}</span>}
                {x.e.off ? '' : x.free ? dur(x.free) : '–'}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- tahsilat ve stok ---------- */

function Ledger({ rows }: { rows: { label: string; value: string; sub?: string; href: string; onClick?: () => void; tone?: 'late' | 'zero' }[] }) {
  return (
    <ul className="ledger">
      {rows.map((r) => (
        <li key={r.label}>
          <a href={r.href} onClick={r.onClick} className={r.tone ? 'is-' + r.tone : undefined}>
            <span className="ld-label">{r.label}</span>
            <span className="ld-val tnum">
              <b>{r.value}</b>
              {r.sub && <span>{r.sub}</span>}
            </span>
            <Icon name="chevron" size={14} />
          </a>
        </li>
      ))}
    </ul>
  );
}

function MoneySection({ m }: { m: ReturnType<typeof moneyToday> }) {
  return (
    <section className="ov-sec ov-money" aria-labelledby="ov-money-h">
      <h2 id="ov-money-h" className="ov-h">{t('ov.money')}</h2>
      <Ledger
        rows={[
          { label: t('ov.m.taken'), value: money(m.taken), sub: tn('ov.m.takenN', m.takenN), href: '#/invoices', onClick: preset('inv-view', 'paid') },
          { label: t('ov.m.send'), value: money(m.draftsSum), sub: tn('ov.m.invN', m.drafts), href: '#/invoices', onClick: preset('inv-view', 'drafts'), tone: m.drafts ? undefined : 'zero' },
          { label: t('ov.m.due'), value: money(m.dueSum), sub: tn('ov.m.invN', m.due), href: '#/invoices', onClick: preset('inv-view', 'unpaid'), tone: m.due ? undefined : 'zero' },
          { label: t('ov.m.overdue'), value: money(m.overdueSum), sub: m.overdue ? t('ov.m.oldest', { n: m.overdue, d: m.oldest }) : undefined, href: '#/invoices', onClick: preset('inv-view', 'overdue'), tone: m.overdue ? 'late' : 'zero' }
        ]}
      />
    </section>
  );
}

function StockSection({ s }: { s: ReturnType<typeof stockToday> }) {
  const first = s.ordered[0]?.order;
  return (
    <section className="ov-sec ov-stock" aria-labelledby="ov-stock-h">
      <h2 id="ov-stock-h" className="ov-h">{t('ov.stock')}</h2>
      <Ledger
        rows={[
          { label: t('ov.s.order'), value: tn('ov.s.parts', s.toOrder.length), sub: s.toOrder.map((p) => p.id).join(', '), href: '#/stock', onClick: preset('stock-view', 'reorder'), tone: s.toOrder.length ? undefined : 'zero' },
          { label: t('ov.s.coming'), value: tn('ov.s.orders', s.ordered.length), sub: first ? tn('ov.s.first', s.ordered.length, { d: weekday(first.due) }) : undefined, href: '#/stock', onClick: preset('stock-view', 'ordered'), tone: s.ordered.length ? undefined : 'zero' },
          { label: t('ov.s.wait'), value: tn('ov.s.jobs', s.waiting.length), sub: s.waiting.map((j) => j.id).join(', '), href: '#/jobs', onClick: preset('jobs-view', 'parts'), tone: s.waiting.length ? undefined : 'zero' }
        ]}
      />
    </section>
  );
}
