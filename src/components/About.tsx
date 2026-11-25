import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { Monogram } from './Shell';
import { openGuide } from './Guide';
import { getLang, t } from '../lib/i18n';
import type { Key } from '../lib/strings';

// "About this project": how to use it, what was built (each item tied to a real part of the code),
// languages and tools, what the same structure can be used for, source code and licence.
// Opens from the menu, the guide, the sign-in screen and the account dialog.

export const REPO = 'https://github.com/flouHAN-Software/whitcombe-rudd-operations';

/** Opens the dialog from anywhere (the app's root listens) */
export const openAbout = () => window.dispatchEvent(new Event('wr:about'));

const HOW: Key[] = ['ab.how.1', 'ab.how.2', 'ab.how.3', 'ab.how.4'];
const BUILT: [Key, Key][] = [
  ['ab.b.sync', 'ab.b.sync.t'],
  ['ab.b.api', 'ab.b.api.t'],
  ['ab.b.auto', 'ab.b.auto.t'],
  ['ab.b.data', 'ab.b.data.t'],
  ['ab.b.roles', 'ab.b.roles.t'],
  ['ab.b.ui', 'ab.b.ui.t'],
  ['ab.b.qa', 'ab.b.qa.t']
];
// Only what this project really uses
const TOOLS = ['TypeScript', 'React', 'Vite', 'CSS', 'JavaScript', 'Cloudflare Workers', 'Durable Objects', 'SQLite', 'WebSocket', 'Node.js', 'Playwright', 'axe-core', 'ffmpeg', 'Git'];
const CAN: Key[] = ['ab.can.acc', 'ab.can.sms', 'ab.can.map', 'ab.can.pay', 'ab.can.sso', 'ab.can.ai'];

/** The copyright line at the very bottom */
export function Copyright({ className = '' }: { className?: string }) {
  return <p className={'copy ' + className}>{t('copy')}</p>;
}

export function About({ onClose }: { onClose: () => void }) {
  const site = getLang() === 'tr' ? 'https://flouhan.com/tr/#contact' : 'https://flouhan.com/en/#contact';
  return (
    <Dialog label={t('nav.about')} onClose={onClose} className="about">
      <div className="gd-head">
        <Monogram />
        <div className="gd-brand">
          <div className="wm">Whitcombe &amp; Rudd</div>
          <div className="ctx">{t('nav.about')}</div>
        </div>
        <button type="button" className="icon-btn gd-close" onClick={onClose} aria-label={t('close')} data-autofocus>
          <Icon name="close" />
        </button>
      </div>
      <p className="ab-lead">{t('ab.lead')}</p>

      <section className="gd-sec" aria-labelledby="ab-how">
        <h2 id="ab-how">{t('ab.how')}</h2>
        <ol className="ab-how">
          {HOW.map((k, i) => (
            <li key={k}>
              <span className="lc-n" aria-hidden="true">{i + 1}</span>
              <p>{t(k)}</p>
            </li>
          ))}
        </ol>
        <button type="button" className="btn gd-btn ab-guide" onClick={() => { onClose(); openGuide(); }}>
          <Icon name="guide" size={16} />
          {t('ab.guide')}
        </button>
      </section>

      <section className="gd-sec" aria-labelledby="ab-built">
        <h2 id="ab-built">{t('ab.built')}</h2>
        <dl className="ab-built">
          {BUILT.map(([h, d]) => (
            <div key={h}>
              <dt>{t(h)}</dt>
              <dd>{t(d)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="gd-sec" aria-labelledby="ab-tools">
        <h2 id="ab-tools">{t('ab.tools')}</h2>
        <ul className="ab-tools">
          {TOOLS.map((x) => <li key={x}>{x}</li>)}
        </ul>
      </section>

      <section className="gd-sec" aria-labelledby="ab-can">
        <h2 id="ab-can">{t('ab.can')}</h2>
        <p>{t('ab.can.1')}</p>
        <ul className="ab-can">
          {CAN.map((k) => <li key={k}>{t(k)}</li>)}
        </ul>
        <p>{t('ab.can.2')}</p>
      </section>

      <section className="gd-sec" aria-labelledby="ab-src">
        <h2 id="ab-src">{t('ab.src')}</h2>
        <p className="ab-lic"><b>{t('copy')}</b> {t('ab.lic')}</p>
        <div className="ab-links">
          <a className="btn" href={REPO} target="_blank" rel="noopener">
            {t('ab.src.link')} <span aria-hidden="true">↗</span>
          </a>
          <a className="btn btn-primary" href={site} target="_blank" rel="noopener">
            {t('ab.quote')} <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>
    </Dialog>
  );
}
