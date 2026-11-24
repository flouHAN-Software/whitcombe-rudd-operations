import { useState } from 'react';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { ConceptTag, Monogram, PrefControls } from './Shell';
import { openGuide } from './Guide';
import { Copyright, openAbout } from './About';
import { useStore } from '../data/store';
import { LIVE_ENGINEER, engineerOf, useAccount, type Account } from '../lib/account';
import { t, td } from '../lib/i18n';
import { go } from '../lib/router';
import type { Engineer } from '../data/types';

// Giriş ekranı (hesap seçilmemişse) ve hesap penceresi (kim giriş yaptı, hesap değiştir, çıkış).
// Demo hesapları parola istemez; yetki rolden gelir: ofis her ekranı, teknisyen yalnızca kendi gününü görür.

export const OFFICE = { name: 'Ellie Whitcombe', initials: 'EW' };

/** Hesap penceresini her yerden açar (App dinler) */
export const openAccount = () => window.dispatchEvent(new Event('wr:account'));

/** Hesaba göre açılış ekranı: ofis Bugün'e, teknisyen kendi uygulamasına */
export function enter(a: Account, signIn: (a: Account) => void) {
  signIn(a);
  go(a.role === 'engineer' ? 'field' : 'today');
}

function Row({ initials, name, role, sees, onPick }: { initials: string; name: string; role: string; sees: string; onPick: () => void }) {
  return (
    <li>
      <button type="button" className="si-acc" onClick={onPick}>
        <span className="avatar si-av" aria-hidden="true">{initials}</span>
        <span className="si-txt">
          <b>{name}</b>
          <span className="si-role">{role}</span>
          <span className="si-sees">{sees}</span>
        </span>
        <Icon name="chevron" className="si-chev" />
      </button>
    </li>
  );
}

export function SignIn() {
  const { state } = useStore();
  const { signIn } = useAccount();
  const [more, setMore] = useState(false);
  const engineers: Engineer[] = state.phase === 'ready' ? state.data.engineers.filter((e) => !e.off) : [];
  const main = engineers.find((e) => e.id === LIVE_ENGINEER);
  const others = engineers.filter((e) => e.id !== LIVE_ENGINEER);

  return (
    <div className="si">
      <main className="si-box" id="main">
        <div className="si-brand">
          <Monogram />
          <span className="si-bt">
            <span className="wm">Whitcombe &amp; Rudd</span>
            <span className="ctx">{t('app.ops')}</span>
          </span>
        </div>
        <h1>{t('si.title')}</h1>
        <p className="si-sub">{t('si.sub')}</p>

        <ul className="si-list" aria-busy={!main}>
          <Row initials={OFFICE.initials} name={OFFICE.name} role={t('si.office.role')} sees={t('si.office.sees')} onPick={() => enter({ role: 'office' }, signIn)} />
          {main ? (
            <Row
              initials={main.initials}
              name={main.name}
              role={t('si.eng.role', { skill: td(main.skills) })}
              sees={t('si.eng.sees')}
              onPick={() => enter({ role: 'engineer', eng: main.id }, signIn)}
            />
          ) : (
            <li className="si-wait" aria-hidden="true" />
          )}
        </ul>

        {others.length > 0 && (
          <div className="si-more">
            <button type="button" className="btn btn-quiet si-more-btn" aria-expanded={more} onClick={() => setMore(!more)}>
              {t('si.other')}
              <Icon name="chevron" className={more ? 'is-open' : ''} />
            </button>
            {more && (
              <ul className="si-others">
                {others.map((e) => (
                  <li key={e.id}>
                    <button type="button" onClick={() => enter({ role: 'engineer', eng: e.id }, signIn)}>
                      <span className="avatar" aria-hidden="true">{e.initials}</span>
                      <b>{e.name}</b>
                      <span>{td(e.skills)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="si-note">{t('si.note')}</p>

        <div className="si-foot">
          <span className="si-foot-l">
            <button type="button" className="btn si-guide" onClick={openGuide}>
              <Icon name="guide" size={16} />
              {t('nav.guide')}
            </button>
            <button type="button" className="btn btn-quiet si-guide" onClick={openAbout}>
              <Icon name="info" size={16} />
              {t('nav.about')}
            </button>
          </span>
          <PrefControls />
        </div>
        <p className="si-concept">
          <ConceptTag /> <span>{t('concept.text')}</span>
        </p>
        <Copyright className="si-copy" />
      </main>
    </div>
  );
}

export function AccountDialog({ onClose }: { onClose: () => void }) {
  const { state } = useStore();
  const { account, signIn, signOut } = useAccount();
  const engId = engineerOf(account);
  const engineers = state.phase === 'ready' ? state.data.engineers : [];
  const eng = engId ? engineers.find((e) => e.id === engId) : null;
  const gemma = engineers.find((e) => e.id === LIVE_ENGINEER);

  const me = eng ? { initials: eng.initials, name: eng.name, role: t('si.eng.role', { skill: td(eng.skills) }), sees: t('si.eng.sees') } : { ...OFFICE, role: t('si.office.role'), sees: t('si.office.sees') };

  return (
    <Dialog label={t('ac.title')} onClose={onClose} className="acct">
      <div className="lv-head">
        <h2>{t('ac.title')}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t('close')} data-autofocus>
          <Icon name="close" />
        </button>
      </div>
      <p className="ac-label">{t('ac.signed')}</p>
      <div className="ac-me">
        <span className="avatar si-av" aria-hidden="true">{me.initials}</span>
        <span className="si-txt">
          <b>{me.name}</b>
          <span className="si-role">{me.role}</span>
          <span className="si-sees">{me.sees}</span>
        </span>
      </div>
      <div className="ac-actions">
        {eng ? (
          <button type="button" className="btn" onClick={() => { onClose(); enter({ role: 'office' }, signIn); }}>
            {t('ac.toOffice')}
          </button>
        ) : (
          gemma && (
            <button type="button" className="btn" onClick={() => { onClose(); enter({ role: 'engineer', eng: gemma.id }, signIn); }}>
              {t('ac.toEng', { name: gemma.name })}
            </button>
          )
        )}
        <button type="button" className="btn btn-quiet" onClick={() => { onClose(); signOut(); }}>
          <Icon name="signout" size={16} />
          {t('ac.out')}
        </button>
      </div>
      <p className="lv-small">{t('si.note')}</p>
      {/* teknisyen kabuğunda sol menü yok: dil, tema ve rehber buradan */}
      <div className="ac-prefs">
        <span className="ac-prefs-l">
          <button type="button" className="btn btn-quiet" onClick={() => { onClose(); openGuide(); }}>
            <Icon name="guide" size={16} />
            {t('nav.guide')}
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => { onClose(); openAbout(); }}>
            <Icon name="info" size={16} />
            {t('nav.about')}
          </button>
        </span>
        <PrefControls />
      </div>
    </Dialog>
  );
}
