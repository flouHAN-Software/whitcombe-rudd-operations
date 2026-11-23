import { useId, useMemo, useState, type PointerEvent as RPointerEvent } from 'react';
import { PageHeader } from '../../components/Shell';
import { StatusGlyph } from '../../components/Status';
import { useStore } from '../../data/store';
import { getLang, t } from '../../lib/i18n';
import { useWidth } from '../../lib/useWidth';
import { dur } from '../../data/derive';
import {
  COLD_WEEK, buildHistory, byTradeWeekly, engineerTotals, firstFixByTrade, onTimeWeekly, WEEKS
} from '../../data/history';
import type { Trade } from '../../data/types';
import type { Key } from '../../lib/strings';
import '../today/today.css';
import './reports.css';

// Raporlar: son 12 hafta. Grafikler mürekkep tonlarıyla çizilir; kimlikte renk yalnızca durumu anlatır.
// Durum rengi yalnızca hedefin altındaki noktada, bakır yalnızca "son hafta" vurgusunda.

const TRADES: Trade[] = ['gas', 'appliance', 'cooling'];
const ON_TIME_TARGET = 0.9;
const FTF_FLOOR = 0.75;

const loc = () => (getLang() === 'tr' ? 'tr-TR' : 'en-GB');
const num = (n: number) => n.toLocaleString(loc());
/** Türkçede yüzde işareti başa gelir: %91 */
const pct = (p: number, digits = 0) => {
  const v = (p * 100).toLocaleString(loc(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return getLang() === 'tr' ? `%${v}` : `${v}%`;
};
/** "12 Oct" / "12 Eki" */
const dm = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString(loc(), { day: 'numeric', month: 'short' }).replace('.', '');
const tradeLabel = (tr: Trade) => t(`grp.${tr}` as Key);

export function ReportsPage() {
  const { state, retry } = useStore();
  const data = state.phase === 'ready' ? state.data : null;

  const calc = useMemo(() => {
    if (!data) return null;
    const h = buildHistory(data.engineers);
    return {
      jobs: byTradeWeekly(h, data.engineers),
      onTime: onTimeWeekly(h),
      ftf: firstFixByTrade(h, data.engineers),
      eng: data.engineers.map((e) => engineerTotals(h, e))
    };
  }, [data]);

  const last = WEEKS.at(-1)!;
  const to = new Date(last + 'T12:00:00');
  to.setDate(to.getDate() + 6);
  const meta = t('rp.meta', { from: dm(WEEKS[0]), to: dm(to.toISOString().slice(0, 10)) });

  return (
    <div className="rp">
      <PageHeader title={t('nav.reports')} meta={data ? meta : t('loading')} />
      {state.phase === 'loading' && <div className="rp-loading" aria-busy="true"><span /><span /></div>}
      {state.phase === 'error' && (
        <div className="state">
          <b>{t('load.fail.jobs')}</b>
          <p>{t('load.fail.text')}</p>
          <button className="btn" onClick={retry}>{t('retry')}</button>
        </div>
      )}
      {calc && (
        <>
          <JobsSection rows={calc.jobs} />
          <div className="rp-row">
            <OnTimeSection rows={calc.onTime} />
            <FtfSection rows={calc.ftf} />
          </div>
          <EngTable rows={calc.eng} />
        </>
      )}
    </div>
  );
}

/* ---------- ortak parçalar ---------- */

function Swatch({ trade }: { trade: Trade }) {
  return <i className={'sw sw-' + trade} aria-hidden="true" />;
}

/** Yalnızca üst köşeleri yuvarlak dikdörtgen (çubuğun taban çizgisine oturan ucu düz kalır) */
function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/* ---------- haftalık tamamlanan iş ---------- */

type JobsRow = ReturnType<typeof byTradeWeekly>[number];

function JobsSection({ rows }: { rows: JobsRow[] }) {
  const [box, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const hatch = useId().replace(/:/g, '');
  const total = rows.reduce((s, r) => s + r.total, 0);

  const narrow = w < 640;
  const H = narrow ? 230 : 280;
  const pad = { l: 36, r: narrow ? 6 : 150, t: 34, b: 30 };
  const pw = Math.max(0, w - pad.l - pad.r);
  const ph = H - pad.t - pad.b;
  const max = Math.max(...rows.map((r) => r.total));
  const step = max > 200 ? 100 : 50;
  const yMax = Math.ceil((max * 1.08) / step) * step;
  const y = (v: number) => pad.t + ph - (v / yMax) * ph;
  const band = pw / rows.length;
  const bw = Math.min(44, band * 0.62);
  const bx = (i: number) => pad.l + i * band + (band - bw) / 2;
  const ticks = Array.from({ length: yMax / step + 1 }, (_, i) => i * step);
  const every = narrow ? 3 : 1;

  // Son çubuğun yanındaki doğrudan etiketler: üst üste binmesinler diye en az 20 px arayla
  const lastRow = rows.at(-1)!;
  let acc = 0;
  const want = TRADES.map((tr) => {
    const mid = y(acc + lastRow[tr] / 2);
    acc += lastRow[tr];
    return { tr, y: mid };
  });
  for (let i = 1; i < want.length; i++) want[i].y = Math.min(want[i].y, want[i - 1].y - 20);

  const cold = rows[COLD_WEEK];

  return (
    <section className="rp-sec" aria-labelledby="rp-jobs-h">
      <div className="rp-top">
        <div>
          <h2 id="rp-jobs-h" className="rp-h">{t('rp.jobs')}</h2>
          <p className="rp-big"><b className="tnum">{num(total)}</b> <span>{t('rp.jobs.big')}</span></p>
        </div>
        <ul className="rp-legend" aria-hidden="true">
          {TRADES.map((tr) => <li key={tr}><Swatch trade={tr} />{tradeLabel(tr)}</li>)}
        </ul>
      </div>

      <div className="chart rp-chart" ref={box} onPointerLeave={() => setHover(null)}>
        {w > 0 && (
          <svg width={w} height={H} aria-hidden="true">
            <defs>
              <pattern id={hatch} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="5" height="5" className="hatch-bg" />
                <line x1="0" y1="0" x2="0" y2="5" className="hatch-line" />
              </pattern>
            </defs>
            {ticks.map((v) => (
              <g key={v}>
                <line className="ch-grid" x1={pad.l} x2={pad.l + pw} y1={y(v)} y2={y(v)} />
                <text className="ch-y" x={pad.l - 8} y={y(v)} dy="0.35em">{num(v)}</text>
              </g>
            ))}
            {hover !== null && <rect className="rp-band" x={pad.l + hover * band} y={pad.t - 6} width={band} height={ph + 6} />}
            {rows.map((r, i) => {
              let base = 0;
              const segs = TRADES.filter((tr) => r[tr] > 0);
              return (
                <g key={r.week}>
                  {segs.map((tr, k) => {
                    const top = y(base + r[tr]);
                    const bottom = y(base) - (k > 0 ? 2 : 0);
                    base += r[tr];
                    const h = Math.max(0, bottom - top);
                    const fill = tr === 'cooling' ? `url(#${hatch})` : undefined;
                    return k === segs.length - 1
                      ? <path key={tr} className={'seg seg-' + tr} d={topRounded(bx(i), top, bw, h, 3)} fill={fill} />
                      : <rect key={tr} className={'seg seg-' + tr} x={bx(i)} y={top} width={bw} height={h} fill={fill} />;
                  })}
                  {i % every === 0 && (
                    <text className="ch-x" x={bx(i) + bw / 2} y={H - 8}>{dm(r.week)}</text>
                  )}
                </g>
              );
            })}
            {/* İlk soğuklar notu */}
            <g className="rp-annot">
              <line x1={bx(COLD_WEEK) + bw / 2} x2={bx(COLD_WEEK) + bw / 2} y1={y(cold.total) - 6} y2={pad.t - 14} />
              <text x={bx(COLD_WEEK) + bw / 2 + (narrow ? -4 : 6)} y={pad.t - 18} textAnchor={narrow ? 'middle' : 'start'}>{t('rp.cold')}</text>
            </g>
            {!narrow && want.map(({ tr, y: ly }) => (
              <g key={tr} className="rp-direct" transform={`translate(${bx(rows.length - 1) + bw + 12},${ly})`}>
                <text dy="0.35em">
                  <tspan className="rp-dn">{tradeLabel(tr)}</tspan>
                  <tspan className="rp-dv" dx="6">{num(lastRow[tr])}</tspan>
                </text>
              </g>
            ))}
            {rows.map((r, i) => (
              <rect key={r.week} className="rp-hit" x={pad.l + i * band} y={pad.t - 6} width={band} height={ph + 6} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
            ))}
          </svg>
        )}
        {hover !== null && w > 0 && (
          <div className="rp-tip" style={{ left: Math.min(Math.max(bx(hover) + bw / 2, 90), w - 90), top: Math.max(0, y(rows[hover].total) - 132) }}>
            <b>{t('rp.week', { d: dm(rows[hover].week) })}</b>
            {TRADES.map((tr) => (
              <span key={tr}><Swatch trade={tr} />{tradeLabel(tr)}<em className="tnum">{num(rows[hover][tr])}</em></span>
            ))}
            <span className="rp-tip-total">{t('rp.total')}<em className="tnum">{num(rows[hover].total)}</em></span>
          </div>
        )}
      </div>
      <p className="rp-note">{t('rp.jobs.note')}</p>

      <div className="sr-only"><table>
        <caption>{t('rp.t.jobs')}</caption>
        <thead><tr><th>{t('rp.c.week')}</th>{TRADES.map((tr) => <th key={tr}>{tradeLabel(tr)}</th>)}<th>{t('rp.total')}</th></tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.week}><td>{dm(r.week)}</td>{TRADES.map((tr) => <td key={tr}>{r[tr]}</td>)}<td>{r.total}</td></tr>)}
        </tbody>
      </table></div>
    </section>
  );
}

/* ---------- söz verilen saatte varış ---------- */

type OnTimeRow = ReturnType<typeof onTimeWeekly>[number];

function OnTimeSection({ rows }: { rows: OnTimeRow[] }) {
  const [box, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const jobs = rows.reduce((s, r) => s + r.jobs, 0);
  const late = rows.reduce((s, r) => s + r.late, 0);
  const avg = jobs ? (jobs - late) / jobs : 0;
  const lastRow = rows.at(-1)!;

  const H = 220;
  const pad = { l: 44, r: 48, t: 18, b: 30 };
  const pw = Math.max(0, w - pad.l - pad.r);
  const ph = H - pad.t - pad.b;
  const lo = 0.7;
  const x = (i: number) => pad.l + (i / (rows.length - 1)) * pw;
  const y = (p: number) => pad.t + ph - ((p - lo) / (1 - lo)) * ph;
  const line = rows.map((r, i) => `${i ? 'L' : 'M'}${x(i)},${y(r.pct)}`).join('');
  const every = pw < 420 ? 4 : 2;
  const lastX = x(rows.length - 1);

  function onMove(e: RPointerEvent<SVGSVGElement>) {
    const b = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - b.left - pad.l) / pw) * (rows.length - 1));
    setHover(Math.min(rows.length - 1, Math.max(0, i)));
  }

  return (
    <section className="rp-sec" aria-labelledby="rp-ot-h">
      <h2 id="rp-ot-h" className="rp-h">{t('rp.ontime')}</h2>
      <p className="rp-big"><b className="tnum">{pct(lastRow.pct)}</b> <span>{t('rp.ontime.sub', { a: pct(avg, 1) })}</span></p>

      <div className="chart rp-chart" ref={box}>
        {w > 0 && (
          <svg width={w} height={H} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} aria-hidden="true">
            {[0.7, 0.8, 0.9, 1].map((p) => (
              <g key={p}>
                <line className="ch-grid" x1={pad.l} x2={pad.l + pw} y1={y(p)} y2={y(p)} />
                <text className="ch-y" x={pad.l - 8} y={y(p)} dy="0.35em">{pct(p)}</text>
              </g>
            ))}
            <line className="rp-target" x1={pad.l} x2={pad.l + pw} y1={y(ON_TIME_TARGET)} y2={y(ON_TIME_TARGET)} />
            <text className="rp-target-l" x={pad.l + 6} y={y(ON_TIME_TARGET) + 18}>{t('rp.target', { p: pct(ON_TIME_TARGET) })}</text>
            {rows.map((r, i) => (i % every === 0 && lastX - x(i) >= 84) || i === rows.length - 1 ? (
              <text key={r.week} className="ch-x" x={x(i)} y={H - 8} textAnchor={i === rows.length - 1 ? 'end' : i === 0 ? 'start' : 'middle'}>{dm(r.week)}</text>
            ) : null)}
            {hover !== null && <line className="ch-cross" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ph} />}
            <path className="rp-line" d={line} />
            {rows.map((r, i) => {
              const below = r.pct < ON_TIME_TARGET;
              const isLast = i === rows.length - 1;
              return <circle key={r.week} className={'rp-pt' + (below ? ' is-below' : '') + (isLast ? ' is-last' : '')} cx={x(i)} cy={y(r.pct)} r={below || isLast ? 4.5 : 3} />;
            })}
            <text className="ch-label" x={x(rows.length - 1) + 9} y={y(lastRow.pct)} dy="0.35em">{pct(lastRow.pct)}</text>
          </svg>
        )}
        {hover !== null && w > 0 && (
          <div className="rp-tip" style={{ left: Math.min(Math.max(x(hover), 100), w - 100), top: 0 }}>
            <b>{t('rp.week', { d: dm(rows[hover].week) })}</b>
            <span className="tnum">{t('rp.ontime.tip', { p: pct(rows[hover].pct, 1), l: rows[hover].late, n: rows[hover].jobs })}</span>
          </div>
        )}
      </div>
      <p className="rp-note">{t('rp.ontime.note')}</p>

      <div className="sr-only"><table>
        <caption>{t('rp.t.ontime')}</caption>
        <tbody>
          {rows.map((r) => <tr key={r.week}><td>{dm(r.week)}</td><td>{pct(r.pct, 1)}</td></tr>)}
        </tbody>
      </table></div>
    </section>
  );
}

/* ---------- ilk ziyarette çözülen ---------- */

function FtfSection({ rows }: { rows: ReturnType<typeof firstFixByTrade> }) {
  const all = rows.reduce((s, r) => s + r.recent, 0) / rows.length;
  return (
    <section className="rp-sec" aria-labelledby="rp-ftf-h">
      <h2 id="rp-ftf-h" className="rp-h">{t('rp.ftf')}</h2>
      <p className="rp-big"><b className="tnum">{pct(all)}</b> <span>{t('rp.ftf.sub')}</span></p>
      <ul className="rp-legend rp-legend-ftf" aria-hidden="true">
        <li><i className="sw sw-bar" />{t('rp.ftf.recent')}</li>
        <li><i className="sw sw-tick" />{t('rp.ftf.avg')}</li>
      </ul>
      <ul className="hbars" aria-label={t('rp.t.ftf')}>
        {rows.map((r) => (
          <li key={r.trade} title={`${tradeLabel(r.trade)}: ${t('rp.ftf.recent')} ${pct(r.recent, 1)} · ${t('rp.ftf.avg')} ${pct(r.avg, 1)}`}>
            <span className="hb-name">{tradeLabel(r.trade)}</span>
            <span className="hb-track" aria-hidden="true">
              <i className="hb-bar" style={{ width: `${r.recent * 100}%` }} />
              <i className="hb-tick" style={{ left: `${r.avg * 100}%` }} />
            </span>
            <span className="hb-val tnum">
              {pct(r.recent)}
              <span className="sr-only"> · {t('rp.ftf.avg')} {pct(r.avg, 1)}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="hb-axis" aria-hidden="true"><span>{pct(0)}</span><span>{pct(0.5)}</span><span>{pct(1)}</span></div>
      <p className="rp-note">{t('rp.ftf.note')}</p>
    </section>
  );
}

/* ---------- teknisyen tablosu ---------- */

type Totals = ReturnType<typeof engineerTotals>;
type Col = 'name' | 'jobs' | 'onTime' | 'ftf' | 'avgMins' | 'returns';

function Spark({ values, name }: { values: number[]; name: string }) {
  const W = 104;
  const H = 26;
  const max = Math.max(...values, 1);
  const x = (i: number) => 2 + (i / (values.length - 1)) * (W - 6);
  const y = (v: number) => H - 3 - (v / max) * (H - 7);
  // İzin haftasında (0 iş) çizgi kesilir
  let d = '';
  values.forEach((v, i) => {
    if (v === 0) return;
    d += `${i === 0 || values[i - 1] === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  const li = values.length - 1;
  return (
    <svg className="spark" width={W} height={H} role="img" aria-label={t('rp.spark', { name, list: values.join(', ') })}>
      <path d={d} />
      {values[li] > 0 && <circle cx={x(li)} cy={y(values[li])} r={2.75} />}
    </svg>
  );
}

function EngTable({ rows }: { rows: Totals[] }) {
  const [sort, setSort] = useState<{ col: Col; dir: 1 | -1 }>({ col: 'jobs', dir: -1 });
  const sorted = useMemo(() => {
    const val = (r: Totals) => (sort.col === 'name' ? r.e.name : r[sort.col]);
    return [...rows].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      return (typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)) * sort.dir;
    });
  }, [rows, sort]);

  const cols: { id: Col; label: Key; num?: boolean }[] = [
    { id: 'name', label: 'rp.c.eng' },
    { id: 'jobs', label: 'rp.c.jobs', num: true },
    { id: 'onTime', label: 'rp.c.ontime', num: true },
    { id: 'ftf', label: 'rp.c.ftf', num: true },
    { id: 'avgMins', label: 'rp.c.avg', num: true },
    { id: 'returns', label: 'rp.c.ret', num: true }
  ];
  const head = (c: (typeof cols)[number]) => (
    <span key={c.id} role="columnheader" className={'et-' + c.id + (c.num ? ' num' : '')} aria-sort={sort.col === c.id ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => setSort((s) => ({ col: c.id, dir: s.col === c.id ? (s.dir === 1 ? -1 : 1) : c.id === 'name' ? 1 : -1 }))}>
        {t(c.label)}
        <span className="et-arrow" aria-hidden="true">{sort.col === c.id ? (sort.dir === 1 ? '↑' : '↓') : ''}</span>
      </button>
    </span>
  );

  return (
    <section className="rp-sec rp-eng" aria-labelledby="rp-eng-h">
      <div className="rp-top">
        <h2 id="rp-eng-h" className="rp-h">{t('rp.eng')}</h2>
        <span className="rp-sub">{t('rp.eng.sub')}</span>
      </div>
      <div className="etable" role="table" aria-labelledby="rp-eng-h">
        <div className="erow2 ehead2" role="row">
          {head(cols[0])}
          <span role="columnheader" className="et-trend">{t('rp.c.trend')}</span>
          {cols.slice(1).map(head)}
        </div>
        {sorted.map((r) => {
          const lowOn = r.onTime < ON_TIME_TARGET;
          const lowFix = r.ftf < FTF_FLOOR;
          return (
            <div key={r.e.id} className="erow2" role="row">
              <span role="cell" className="et-name"><b>{r.e.name}</b><span>{tradeLabel(r.e.trade)}</span></span>
              <span role="cell" className="et-trend"><Spark values={r.weekly} name={r.e.name} /></span>
              <span role="cell" className="et-jobs num tnum"><Lbl k="rp.c.jobs" />{num(r.jobs)}</span>
              <span role="cell" className={'et-onTime num tnum' + (lowOn ? ' is-low' : '')}>
                <Lbl k="rp.c.ontime" />
                {lowOn && <><StatusGlyph tone="behind" /><span className="sr-only">{t('rp.below')}: </span></>}
                {pct(r.onTime)}
              </span>
              <span role="cell" className={'et-ftf num tnum' + (lowFix ? ' is-low' : '')}>
                <Lbl k="rp.c.ftf" />
                {lowFix && <><StatusGlyph tone="behind" /><span className="sr-only">{t('rp.below')}: </span></>}
                {pct(r.ftf)}
              </span>
              <span role="cell" className="et-avgMins num tnum"><Lbl k="rp.c.avg" />{dur(r.avgMins)}</span>
              <span role="cell" className="et-returns num tnum"><Lbl k="rp.c.ret" />{num(r.returns)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Telefonda sütun başlığı görünmediği için değerin önüne kısa etiket */
function Lbl({ k }: { k: Key }) {
  return <span className="et-k" aria-hidden="true">{t(k)}</span>;
}

