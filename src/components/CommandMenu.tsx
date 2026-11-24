import { useMemo, useState, type KeyboardEvent } from 'react';
import { Dialog } from './Dialog';
import { Icon, type IconName } from './Icon';
import { ROUTES, routeWords } from '../lib/routes';
import { go } from '../lib/router';
import { resetDemo } from '../lib/storage';
import { t, usePrefs } from '../lib/i18n';
import { openLive } from './Live';
import { openAbout } from './About';

interface Cmd {
  id: string;
  group: 'go' | 'act';
  label: string;
  icon: IconName;
  hint?: string[];
  words?: string;
  /** true dönerse menü açık kalır */
  run: () => boolean | void;
}

export function CommandMenu({ onClose, onHelp }: { onClose: () => void; onHelp: () => void }) {
  const { prefs, set } = usePrefs();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [armed, setArmed] = useState(false);
  const dark = prefs.theme === 'dark';

  const all: Cmd[] = useMemo(
    () => [
      ...ROUTES.map<Cmd>((r) => ({
        id: 'go-' + r.id,
        group: 'go',
        label: t(r.label),
        icon: r.icon,
        words: routeWords(r),
        run: () => go(r.id)
      })),
      { id: 'help', group: 'act', label: t('nav.guide'), icon: 'guide', words: 'help guide how rehber yardım nasıl', run: onHelp },
      { id: 'live', group: 'act', label: t('lv.nav'), icon: 'live', words: 'live phone qr session canlı telefon karekod oturum', run: openLive },
      { id: 'about', group: 'act', label: t('nav.about'), icon: 'info', words: 'about project licence license code github hakkında proje lisans kaynak kod', run: openAbout },
      { id: 'lang', group: 'act', label: t('lang.other'), icon: 'keyboard', words: 'language dil english türkçe turkish ingilizce', run: () => set({ lang: prefs.lang === 'en' ? 'tr' : 'en' }) },
      { id: 'theme', group: 'act', label: dark ? t('theme.toLight') : t('theme.toDark'), icon: dark ? 'sun' : 'moon', words: 'theme tema dark light koyu açık', run: () => set({ theme: dark ? 'light' : 'dark' }) },
      {
        id: 'reset',
        group: 'act',
        label: armed ? t('reset.enter') : t('reset'),
        icon: 'reset',
        words: 'clear restore start over sıfırla temizle',
        run: () => {
          if (!armed) {
            setArmed(true);
            return true;
          }
          resetDemo();
          location.reload();
        }
      }
    ],
    [armed, onHelp, prefs.lang, dark, set]
  );

  const list = useMemo(() => {
    const words = q.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return all.filter((c) => words.every((w) => (c.label + ' ' + (c.words ?? '')).toLocaleLowerCase().includes(w)));
  }, [all, q]);

  const idx = Math.min(active, Math.max(list.length - 1, 0));

  function run(c: Cmd) {
    if (c.run() !== true) onClose();
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((idx + 1) % Math.max(list.length, 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((idx - 1 + list.length) % Math.max(list.length, 1)); }
    if (e.key === 'Enter' && list[idx]) { e.preventDefault(); run(list[idx]); }
  }

  let lastGroup = '';
  return (
    <Dialog label={t('search.long')} onClose={onClose} className="cmd">
      <div className="cmd-input">
        <Icon name="search" />
        <input
          data-autofocus
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0); setArmed(false); }}
          onKeyDown={onKey}
          placeholder={t('cmd.ph')}
          role="combobox"
          aria-expanded="true"
          aria-controls="cmd-list"
          aria-activedescendant={list[idx] ? 'cmd-' + list[idx].id : undefined}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <ul className="cmd-list" id="cmd-list" role="listbox" aria-label={t('cmd.list')}>
        {list.length === 0 && <li className="cmd-empty">{t('cmd.none', { q })}</li>}
        {list.map((c, i) => {
          const head = c.group !== lastGroup ? c.group : null;
          lastGroup = c.group;
          return (
            <li key={c.id} role="presentation">
              {head && <div className="cmd-group" role="presentation">{head === 'go' ? t('cmd.goto') : t('cmd.actions')}</div>}
              <div
                id={'cmd-' + c.id}
                role="option"
                aria-selected={i === idx}
                className={'cmd-item' + (i === idx ? ' is-active' : '') + (c.id === 'reset' && armed ? ' is-armed' : '')}
                onMouseMove={() => i !== idx && setActive(i)}
                onClick={() => run(c)}
              >
                <Icon name={c.icon} />
                <span className="cmd-label">{c.label}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
