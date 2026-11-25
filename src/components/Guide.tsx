import { useCallback } from 'react';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { Monogram } from './Shell';
import { LiveChecks, openLive } from './Live';
import { enter } from './Account';
import { openAbout } from './About';
import { t, usePrefs } from '../lib/i18n';
import { LIVE_ENGINEER, useAccount } from '../lib/account';
import { go } from '../lib/router';
import { routeById, type RouteId } from '../lib/routes';
import type { Key } from '../lib/strings';

// The full guide: opens from the welcome card, "How it works" in the menu and the sign-in screen.
// It explains what the dashboard is for, what each screen does, what to try first,
// and what the two-device live session stands for and what to check in it.
// It does not list keyboard shortcuts on purpose: they work, but showing them only adds clutter.

const SCREENS: RouteId[] = ['today', 'jobs', 'dispatch', 'stock', 'customers', 'invoices', 'reports', 'field'];
const TRY: { text: Key; go: Key; route: RouteId | 'live' }[] = [
  { text: 'gd.t1', go: 'gd.t1.go', route: 'dispatch' },
  { text: 'gd.t2', go: 'gd.t2.go', route: 'field' },
  { text: 'gd.t3', go: 'gd.t3.go', route: 'invoices' },
  { text: 'gd.t4', go: 'gd.t4.go', route: 'live' }
];

/** Opens the guide from anywhere (the app's root listens; a language switch keeps it open) */
export const openGuide = () => window.dispatchEvent(new Event('wr:guide'));

export function Guide({ onClose }: { onClose: () => void }) {
  const { prefs, set } = usePrefs();
  const { account, signIn } = useAccount();
  const done = useCallback(() => {
    if (!prefs.chosen) set({ chosen: true });
    onClose();
  }, [prefs.chosen, set, onClose]);

  // The guide's buttons lead to office screens, so without an account, or with an engineer one, they sign in as the office
  const open = (r: RouteId | 'live') => {
    if (account?.role !== 'office') signIn({ role: 'office' });
    done();
    if (r === 'live') {
      go('dispatch');
      openLive();
      return;
    }
    go(r);
  };

  return (
    <Dialog label={t('nav.guide')} onClose={done} className="guide">
      <div className="gd-head">
        <Monogram />
        <div className="gd-brand">
          <div className="wm">Whitcombe &amp; Rudd</div>
          <div className="ctx">{t('nav.guide')}</div>
        </div>
        <div className="seg gd-lang" role="radiogroup" aria-label={t('lang')}>
          <button type="button" role="radio" aria-checked={prefs.lang === 'en'} onClick={() => set({ lang: 'en' })} lang="en">EN</button>
          <button type="button" role="radio" aria-checked={prefs.lang === 'tr'} onClick={() => set({ lang: 'tr' })} lang="tr">TR</button>
        </div>
        <button type="button" className="icon-btn gd-close" onClick={done} aria-label={t('close')} data-autofocus>
          <Icon name="close" />
        </button>
      </div>
      {prefs.lang === 'tr' && <p className="gd-trnote">{t('wel.trnote')}</p>}

      <section className="gd-sec" aria-labelledby="gd-what">
        <h2 id="gd-what">{t('gd.what')}</h2>
        <p>{t('gd.what.1')}</p>
        <p>{t('gd.what.2')}</p>
      </section>

      <section className="gd-sec" aria-labelledby="gd-where">
        <h2 id="gd-where">{t('gd.where')}</h2>
        <ul className="gd-screens">
          {SCREENS.map((id) => {
            const r = routeById(id);
            return (
              <li key={id}>
                <span className="gd-ico" aria-hidden="true"><Icon name={r.icon} /></span>
                <span>
                  <b>{t(r.label)}</b>
                  <span>{t(`gd.s.${id}`)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="gd-sec" aria-labelledby="gd-try">
        <h2 id="gd-try">{t('gd.try')}</h2>
        <ol className="gd-try">
          {TRY.map((x, i) => (
            <li key={x.route}>
              <span className="gd-n" aria-hidden="true">{i + 1}</span>
              <p>{t(x.text)}</p>
              <button type="button" className="btn gd-btn" onClick={() => open(x.route)}>
                {t(x.go)} <Icon name="chevron" size={14} />
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section className="gd-sec gd-live" aria-labelledby="gd-live">
        <h2 id="gd-live">{t('gd.live')}</h2>
        <p>{t('gd.live.1')}</p>
        <p>{t('gd.live.2')}</p>
        <h3>{t('gd.live.check')}</h3>
        <LiveChecks />
        <p className="gd-live-why">{t('gd.live.why')}</p>
        <div className="gd-live-foot">
          <span className="muted">{t('gd.live.nophone')}</span>
          <button type="button" className="btn gd-btn" onClick={() => open('live')}>
            {t('gd.live.go')} <Icon name="chevron" size={14} />
          </button>
        </div>
      </section>

      <p className="gd-note">{t('gd.note')}</p>
      <div className="gd-foot">
        <span className="gd-foot-l">
          <span className="muted">{t('gd.again')}</span>
          <button type="button" className="btn btn-quiet gd-about" onClick={() => { done(); openAbout(); }}>
            <Icon name="info" size={16} />
            {t('nav.about')}
          </button>
        </span>
        {account ? (
          <button type="button" className="btn btn-primary gd-go" onClick={done}>
            {t(account.role === 'engineer' ? 'gd.go.field' : 'gd.go.back')}
          </button>
        ) : (
          <span className="gd-go-pair">
            <button type="button" className="btn gd-go-eng" onClick={() => { done(); enter({ role: 'engineer', eng: LIVE_ENGINEER }, signIn); }}>
              {t('gd.go.eng')}
            </button>
            <button type="button" className="btn btn-primary gd-go" onClick={() => { done(); enter({ role: 'office' }, signIn); }}>
              {t('gd.go')}
            </button>
          </span>
        )}
      </div>
    </Dialog>
  );
}
