import { useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { openGuide } from './Guide';
import { openLive } from './Live';
import { enter } from './Account';
import { t, usePrefs } from '../lib/i18n';
import { LIVE_ENGINEER, useAccount } from '../lib/account';
import { go } from '../lib/router';
import type { Key } from '../lib/strings';

// First-visit welcome: a small card over the live product instead of a full-screen guide.
// It says what the app is, what to try first, and links to the full guide (every screen explained)
// and to the engineer account. It is not modal: the dashboard behind it stays usable.

// Each step has a long label for wider screens and a short one for phones (CSS picks one).
const TRY: { text: Key; short: Key; run: () => void }[] = [
  { text: 'wc.t1', short: 'wc.t1.s', run: () => go('dispatch') },
  { text: 'wc.t2', short: 'wc.t2.s', run: () => go('field') },
  { text: 'wc.t3', short: 'wc.t3.s', run: () => { go('dispatch'); openLive(); } }
];

export function Welcome() {
  const { set } = usePrefs();
  const { signIn } = useAccount();
  const box = useRef<HTMLElement>(null);
  const done = () => set({ chosen: true });

  // Escape closes the card when focus is inside it
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); set({ chosen: true }); } };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, [set]);

  return (
    <section ref={box} className="wc" aria-labelledby="wc-title">
      <div className="wc-head">
        <span className="wc-tag">{t('wc.tag')}</span>
        <button type="button" className="icon-btn wc-x" onClick={done} aria-label={t('wc.close')}>
          <Icon name="close" />
        </button>
      </div>
      <h2 id="wc-title">{t('wc.title')}</h2>
      <p className="wc-text"><span className="wc-l">{t('wc.text')}</span><span className="wc-s">{t('wc.text.s')}</span></p>
      <h3>{t('wc.try')}</h3>
      <ol className="wc-try">
        {TRY.map((x, i) => (
          <li key={x.text}>
            <button type="button" onClick={() => { done(); x.run(); }}>
              <span className="wc-n" aria-hidden="true">{i + 1}</span>
              <span><span className="wc-l">{t(x.text)}</span><span className="wc-s">{t(x.short)}</span></span>
              <Icon name="chevron" size={14} />
            </button>
          </li>
        ))}
      </ol>
      <div className="wc-foot">
        <button type="button" className="btn btn-quiet" onClick={() => { done(); openGuide(); }}>
          <Icon name="guide" size={16} />
          {t('wc.guide')}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => { done(); enter({ role: 'engineer', eng: LIVE_ENGINEER }, signIn); }}>
          <Icon name="field" size={16} />
          {t('wc.eng')}
        </button>
      </div>
    </section>
  );
}
