import { useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { useStore, type LiveChecks as Checks, type LiveEvent } from '../data/store';
import { LIVE_ENGINEER } from '../lib/account';
import { hhmm } from '../lib/clock';
import { getLang, t, tn, usePrefs } from '../lib/i18n';
import { go } from '../lib/router';
import type { Key } from '../lib/strings';
import type { Engineer } from '../data/types';
import type { LiveStatus } from '../lib/live';

// Canlı oturum arayüzü: pencere (karekod, bağlantı, durum) ve oturumdayken üstte duran ince şerit.

/** Pencereyi her yerden açar (App dinler) */
// Bekleyen istek: pencere, ofis kabuğu henüz kurulmadan istenirse (giriş + rehber) kabuk kurulunca açılır
let pending = false;
export const openLive = () => {
  pending = true;
  window.dispatchEvent(new Event('wr:live'));
};
export const takeLive = () => {
  const p = pending;
  pending = false;
  return p;
};

/** Karekod: tarayıcı kamerasının okuyabilmesi için temadan bağımsız siyah-beyaz */
function Qr({ text }: { text: string }) {
  const { n, d } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
    return { n, d };
  }, [text]);
  return (
    <svg className="qr" viewBox={`-3 -3 ${n + 6} ${n + 6}`} role="img" aria-label={t('lv.scan')}>
      <rect x={-3} y={-3} width={n + 6} height={n + 6} fill="#fff" />
      <path d={d} fill="#111" shapeRendering="crispEdges" />
    </svg>
  );
}

function statusText(s: LiveStatus, peers: number) {
  if (s === 'live') return peers > 1 ? tn('lv.st.live', peers) : t('lv.st.live.1');
  if (s === 'connecting') return t('lv.st.connecting');
  if (s === 'offline') return t('lv.st.offline');
  return t('lv.st.off');
}

/** Canlı denemenin üç adımı: telefonda ne yapılır, bilgisayarda ne görülür. Pencerede kendiliğinden işaretlenir. */
const STEPS: { id: keyof Checks; do: Key; see: Key }[] = [
  { id: 'way', do: 'lc.way.do', see: 'lc.way.see' },
  { id: 'finish', do: 'lc.fin.do', see: 'lc.fin.see' },
  { id: 'assign', do: 'lc.as.do', see: 'lc.as.see' }
];

export function LiveChecks({ checks }: { checks?: Checks }) {
  return (
    <ol className={'lc' + (checks ? ' lc-live' : '')}>
      {STEPS.map((s, i) => {
        const ok = checks?.[s.id] ?? false;
        return (
          <li key={s.id} className={ok ? 'is-ok' : undefined}>
            <span className="lc-n" aria-hidden="true">{ok ? <Icon name="check" size={14} /> : i + 1}</span>
            <span className="lc-txt">
              <span className="lc-do"><b>{t('lc.do')}</b>{t(s.do)}</span>
              <span className="lc-see"><b>{t('lc.see')}</b>{t(s.see)}</span>
              {checks && <span className="lc-st">{ok ? t('lc.ok') : t('lc.wait')}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Diğer cihazdan gelen değişikliğin cümlesi: "Gemma Hale WR-48212 için yola çıktı" */
export function changeText(e: LiveEvent, engineers: Engineer[]) {
  const eng = engineers.find((x) => x.id === e.eng)?.name ?? '';
  // Durumu teknisyen değil ofis işaretlediyse: "Ellie Whitcombe WR-48212 için varışı işaretledi"
  const marked = e.by && eng && e.by !== eng && (e.kind === 'en_route' || e.kind === 'on_site' || e.kind === 'done');
  return { by: e.by ?? t('lv.someone'), what: t(`lv.${marked ? 'm' : 'c'}.${e.kind}` as Key, { id: e.job, eng }) };
}

export function LiveStatusLine() {
  const { live } = useStore();
  return (
    <span className={'lv-st is-' + live.status + (live.peers > 1 ? ' has-peers' : '')} role="status">
      <i aria-hidden="true" />
      {statusText(live.status, live.peers)}
    </span>
  );
}

export function LiveDialog({ onClose }: { onClose: () => void }) {
  const { live } = useStore();
  const { prefs } = usePrefs();
  const [copied, setCopied] = useState(false);
  // Oturum başlayınca 'Oturumu başlat' düğmesi kalkar; odak kaybolmasın (Esc ve klavye çalışsın)
  const copyBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (live.room) copyBtn.current?.focus({ preventScroll: true });
  }, [live.room]);

  // Telefona giden bağlantı: aynı oturum, aynı dil ve tema, doğrudan teknisyen uygulaması
  const link = useMemo(() => {
    if (!live.room) return '';
    const u = new URL(location.href);
    u.search = '';
    u.searchParams.set('room', live.room);
    u.searchParams.set('lang', getLang());
    u.searchParams.set('theme', prefs.theme);
    // telefon, teknisyen Gemma Hale'in hesabıyla açılır (rehbersiz, giriş ekranı olmadan)
    u.searchParams.set('as', LIVE_ENGINEER);
    u.hash = '#/field';
    return u.toString();
  }, [live.room, prefs.theme]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* pano izni yok: bağlantı ekranda zaten yazılı */
    }
  }

  return (
    <Dialog label={t('lv.title')} onClose={onClose} className="live">
      <div className="lv-head">
        <h2>{t('lv.title')}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t('close')} data-autofocus>
          <Icon name="close" />
        </button>
      </div>
      <p className="lv-text">{t('lv.text')}</p>

      {!live.room ? (
        <>
          <LiveChecks />
          <p className="lv-small">{t('lv.small')}</p>
          <div className="lv-foot">
            <button type="button" className="btn btn-primary lv-go" onClick={() => live.start()}>{t('lv.start')}</button>
          </div>
        </>
      ) : (
        <>
          <div className="lv-pair">
            <div className="lv-qr">
              <Qr text={link} />
              <span>{t('lv.scan')}</span>
            </div>
            <div className="lv-side">
              <LiveStatusLine />
              <p className="lv-link tnum">{link}</p>
              <div className="lv-actions">
                <button ref={copyBtn} type="button" className="btn" onClick={copy}>{copied ? t('lv.copied') : t('lv.copy')}</button>
                <button type="button" className="btn btn-primary" onClick={() => { go('dispatch'); onClose(); }}>{t('lv.board')}</button>
              </div>
            </div>
          </div>
          <section className="lv-checks" aria-labelledby="lv-checks-h">
            <h3 id="lv-checks-h">{t('gd.live.check')}</h3>
            <LiveChecks checks={live.checks} />
          </section>
          <div className="lv-foot">
            <p className="lv-small">{t('gd.live.nophone')} {t('lv.small')}</p>
            <button type="button" className="btn btn-quiet" onClick={() => { live.stop(); onClose(); }}>{t('lv.stop')}</button>
          </div>
        </>
      )}
    </Dialog>
  );
}

/** Oturumdayken içeriğin üstünde ince şerit */
export function LiveBar({ office = true }: { office?: boolean }) {
  const { live, state } = useStore();
  if (!live.room) return null;
  const engineers = state.phase === 'ready' ? state.data.engineers : [];
  const last = live.last ? changeText(live.last, engineers) : null;
  return (
    <div className="lv-bar">
      <b>{t('lv.bar')}</b>
      <LiveStatusLine />
      {last && live.last ? (
        // yeni olay gelince şerit kısa bir an vurgulanır (key ile yeniden kurulur)
        <span key={live.last.n} className="lv-bar-last" role="status">
          <span className="lv-bar-k">{t('lv.last')}</span> <b>{last.by}</b> {last.what} <span className="tnum lv-bar-t">{hhmm(live.last.at)}</span>
        </span>
      ) : (
        <span className="lv-bar-hint">{t('lv.bar.hint')}</span>
      )}
      {office && <button type="button" className="btn btn-quiet lv-bar-btn" onClick={openLive}>{t('lv.more')}</button>}
    </div>
  );
}
