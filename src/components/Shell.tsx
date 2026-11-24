import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Dialog } from './Dialog';
import { MAIN_NAV, MOBILE_TABS, routeById, type RouteId } from '../lib/routes';
import { useRoute } from '../lib/router';
import { demoDate, hhmm, useDemoMinute } from '../lib/clock';
import { resetDemo } from '../lib/storage';
import { openGuide } from './Guide';
import { openLive } from './Live';
import { openAccount } from './Account';
import { Copyright, openAbout } from './About';
import { t, usePrefs } from '../lib/i18n';
import { shortDate } from '../data/derive';

export function Monogram() {
  return (
    <span className="mono" aria-hidden="true">
      <i>&amp;</i>
    </span>
  );
}

function NavLink({ id, current }: { id: RouteId; current: boolean }) {
  const r = routeById(id);
  const label = t(r.label);
  return (
    <li>
      <a href={'#/' + id} className="nav-item" aria-current={current ? 'page' : undefined} data-tip={label}>
        <Icon name={r.icon} />
        <span className="nav-label">{label}</span>
      </a>
    </li>
  );
}

function Clock() {
  const min = useDemoMinute();
  return (
    <div className="clock tnum" title={t('clock.title')}>
      <span className="clock-day">{shortDate(demoDate())}</span>
      <span className="clock-time">{hhmm(min)}</span>
    </div>
  );
}

export function ConceptTag() {
  return (
    <span className="concept-tag" title={t('concept.text')}>
      {t('concept')}
    </span>
  );
}

/** Dil (EN/TR) ve tema düğmeleri */
export function PrefControls({ big = false }: { big?: boolean }) {
  const { prefs, set } = usePrefs();
  const dark = prefs.theme === 'dark';
  if (big) {
    return (
      <div className="prefs-big">
        <div className="pref-row">
          <span>{t('lang')}</span>
          <div className="seg" role="radiogroup" aria-label={t('lang')}>
            <button type="button" role="radio" aria-checked={prefs.lang === 'en'} onClick={() => set({ lang: 'en' })}>English</button>
            <button type="button" role="radio" aria-checked={prefs.lang === 'tr'} onClick={() => set({ lang: 'tr' })}>Türkçe</button>
          </div>
        </div>
        <div className="pref-row">
          <span>{t('theme')}</span>
          <div className="seg" role="radiogroup" aria-label={t('theme')}>
            <button type="button" role="radio" aria-checked={!dark} onClick={() => set({ theme: 'light' })}><Icon name="sun" /> {t('theme.light')}</button>
            <button type="button" role="radio" aria-checked={dark} onClick={() => set({ theme: 'dark' })}><Icon name="moon" /> {t('theme.dark')}</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="prefs">
      <div className="seg seg-sm" role="radiogroup" aria-label={t('lang')}>
        <button type="button" role="radio" aria-checked={prefs.lang === 'en'} onClick={() => set({ lang: 'en' })} lang="en">EN</button>
        <button type="button" role="radio" aria-checked={prefs.lang === 'tr'} onClick={() => set({ lang: 'tr' })} lang="tr">TR</button>
      </div>
      <button
        type="button"
        className="icon-btn theme-btn"
        onClick={() => set({ theme: dark ? 'light' : 'dark' })}
        aria-label={dark ? t('theme.toLight') : t('theme.toDark')}
        title={dark ? t('theme.toLight') : t('theme.toDark')}
      >
        <Icon name={dark ? 'sun' : 'moon'} />
      </button>
    </div>
  );
}

export function Rail({ onSearch }: { onSearch: () => void }) {
  const { route } = useRoute();
  return (
    <aside className="rail">
      <a className="brand" href="#/today">
        <Monogram />
        <span className="brand-text">
          <span className="wm">Whitcombe &amp; Rudd</span>
          <span className="ctx">{t('app.ops')}</span>
        </span>
      </a>

      <button type="button" className="rail-search" onClick={onSearch} data-tip={t('search')}>
        <Icon name="search" />
        <span className="nav-label">{t('search')}</span>
      </button>

      <nav aria-label="Main">
        <ul className="nav">
          {MAIN_NAV.map((id) => (
            <NavLink key={id} id={id} current={route === id} />
          ))}
        </ul>
        <ul className="nav nav-secondary">
          <NavLink id="field" current={route === 'field'} />
          <li>
            <button type="button" className="nav-item nav-guide" onClick={openGuide} data-tip={t('nav.guide')}>
              <Icon name="guide" />
              <span className="nav-label">{t('nav.guide')}</span>
            </button>
          </li>
          <li>
            <button type="button" className="nav-item nav-guide" onClick={openLive} data-tip={t('lv.nav')}>
              <Icon name="live" />
              <span className="nav-label">{t('lv.nav')}</span>
            </button>
          </li>
          <li>
            <button type="button" className="nav-item nav-guide" onClick={openAbout} data-tip={t('nav.about')}>
              <Icon name="info" />
              <span className="nav-label">{t('nav.about')}</span>
            </button>
          </li>
        </ul>
      </nav>

      <div className="rail-foot">
        <Clock />
        <span className="rail-concept">
          <ConceptTag />
        </span>
        <p className="concept">
          <b>{t('concept.bold')}</b> {t('concept.text')}
        </p>
        <PrefControls />
        <button type="button" className="me" onClick={openAccount} title={t('ac.title')}>
          <span className="avatar" aria-hidden="true">EW</span>
          <span className="me-text">
            Ellie Whitcombe
            <small>{t('me.role')}</small>
          </span>
        </button>
        <Copyright className="rail-copy" />
      </div>
    </aside>
  );
}

export function MobileTop({ title, onSearch }: { title: string; onSearch: () => void }) {
  return (
    <header className="mtop">
      <a href="#/today" aria-label={`Whitcombe & Rudd, ${t('nav.today')}`}>
        <Monogram />
      </a>
      <span className="mtop-title">{title}</span>
      <ConceptTag />
      <button type="button" className="icon-btn" onClick={onSearch} aria-label={t('search.long')}>
        <Icon name="search" size={18} />
      </button>
    </header>
  );
}

export function TabBar({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const { route } = useRoute();
  const inMore = !MOBILE_TABS.includes(route);
  return (
    <nav className="tabbar" aria-label="Main">
      {MOBILE_TABS.map((id) => {
        const r = routeById(id);
        return (
          <a key={id} href={'#/' + id} className="tab" aria-current={route === id ? 'page' : undefined}>
            <Icon name={r.icon} size={18} />
            <span>{t(r.label)}</span>
          </a>
        );
      })}
      <button type="button" className="tab" aria-expanded={moreOpen} aria-current={inMore ? 'page' : undefined} onClick={onMore}>
        <Icon name="more" size={18} />
        <span>{t('more')}</span>
      </button>
    </nav>
  );
}

export function MoreSheet({ onClose }: { onClose: () => void }) {
  const { route } = useRoute();
  const [armed, setArmed] = useState(false);
  const extra: RouteId[] = ['customers', 'invoices', 'reports', 'field'];
  return (
    <Dialog label={t('more')} onClose={onClose} className="sheet">
      <div className="sheet-head">
        <b>{t('more')}</b>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t('close')}>
          <Icon name="close" />
        </button>
      </div>
      <ul className="sheet-list">
        {extra.map((id) => {
          const r = routeById(id);
          return (
            <li key={id}>
              <a href={'#/' + id} onClick={onClose} aria-current={route === id ? 'page' : undefined}>
                <Icon name={r.icon} size={18} />
                {t(r.label)}
                <Icon name="chevron" className="sheet-chev" />
              </a>
            </li>
          );
        })}
      </ul>
      <ul className="sheet-list sheet-list-guide">
        <li>
          <button type="button" onClick={() => { onClose(); openGuide(); }}>
            <Icon name="guide" size={18} />
            {t('nav.guide')}
            <Icon name="chevron" className="sheet-chev" />
          </button>
        </li>
        <li>
          <button type="button" onClick={() => { onClose(); openLive(); }}>
            <Icon name="live" size={18} />
            {t('lv.nav')}
            <Icon name="chevron" className="sheet-chev" />
          </button>
        </li>
        <li>
          <button type="button" onClick={() => { onClose(); openAbout(); }}>
            <Icon name="info" size={18} />
            {t('nav.about')}
            <Icon name="chevron" className="sheet-chev" />
          </button>
        </li>
        <li>
          <button type="button" onClick={() => { onClose(); openAccount(); }}>
            <span className="avatar sheet-av" aria-hidden="true">EW</span>
            {t('ac.menu', { name: 'Ellie Whitcombe' })}
            <Icon name="chevron" className="sheet-chev" />
          </button>
        </li>
      </ul>
      <div className="sheet-prefs">
        <PrefControls big />
      </div>
      <button
        type="button"
        className={'sheet-reset' + (armed ? ' is-armed' : '')}
        onClick={() => {
          if (!armed) return setArmed(true);
          resetDemo();
          location.reload();
        }}
      >
        <Icon name="reset" size={18} />
        {armed ? t('reset.tap') : t('reset')}
      </button>
      <p className="sheet-note">
        <b>{t('concept.bold')}</b> {t('concept.text')}
      </p>
      <Copyright className="sheet-copy" />
    </Dialog>
  );
}

export function PageHeader({ title, meta, actions }: { title: string; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {meta && <p className="page-meta">{meta}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
