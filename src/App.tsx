import { useCallback, useEffect, useState } from 'react';
import { ConceptTag, MobileTop, Monogram, MoreSheet, Rail, TabBar } from './components/Shell';
import { CommandMenu } from './components/CommandMenu';
import { openGuide } from './components/Guide';
import { LiveBar, LiveDialog, takeLive } from './components/Live';
import { AccountDialog } from './components/Account';
import { Copyright } from './components/About';
import { JobsPage } from './pages/jobs/JobsPage';
import { DispatchPage } from './pages/dispatch/DispatchPage';
import { StockPage } from './pages/stock/StockPage';
import { CustomersPage } from './pages/customers/CustomersPage';
import { InvoicesPage } from './pages/invoices/InvoicesPage';
import { TodayPage } from './pages/today/TodayPage';
import { FieldPage } from './pages/field/FieldPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { ROUTES, routeLabel } from './lib/routes';
import { go, useRoute } from './lib/router';
import { t } from './lib/i18n';
import { engineerOf, useAccount } from './lib/account';
import { useStore } from './data/store';

type Layer = null | 'cmd' | 'more' | 'live' | 'account';

/** Events that open dialogs from anywhere (guide, menu, account button) */
function useLayerEvents(setLayer: (l: Layer) => void) {
  useEffect(() => {
    const live = () => { takeLive(); setLayer('live'); };
    const acct = () => setLayer('account');
    window.addEventListener('wr:live', live);
    window.addEventListener('wr:account', acct);
    if (takeLive()) setLayer('live');
    return () => {
      window.removeEventListener('wr:live', live);
      window.removeEventListener('wr:account', acct);
    };
  }, [setLayer]);
}

export default function App() {
  const { account } = useAccount();
  const eng = engineerOf(account);
  return eng ? <EngineerApp eng={eng} /> : <OfficeApp />;
}

/** Engineer account: their own day only. Office screens stay closed, even if the address is typed in. */
function EngineerApp({ eng }: { eng: string }) {
  const { route } = useRoute();
  const { state } = useStore();
  const [layer, setLayer] = useState<Layer>(null);
  const close = useCallback(() => setLayer(null), []);
  useLayerEvents(setLayer);
  const me = state.phase === 'ready' ? state.data.engineers.find((e) => e.id === eng) : undefined;

  useEffect(() => {
    if (route !== 'field') go('field');
  }, [route]);
  useEffect(() => {
    document.title = `${t('nav.field')} · Whitcombe & Rudd`;
  }, []);

  return (
    <div className="app app-eng">
      <a className="skip" href="#main">{t('skip')}</a>
      <header className="etop">
        <span className="etop-brand">
          <Monogram />
          <span className="si-bt">
            <span className="wm">Whitcombe &amp; Rudd</span>
            <span className="ctx">{t('nav.field')}</span>
          </span>
        </span>
        <span className="etop-end">
          <ConceptTag />
          <button type="button" className="etop-me" onClick={() => setLayer('account')} aria-label={t('ac.menu', { name: me?.name ?? '' })}>
            <span className="avatar" aria-hidden="true">{me?.initials ?? ''}</span>
            <span className="etop-name">{me?.name}</span>
          </button>
        </span>
      </header>
      <main id="main" className="main" tabIndex={-1}>
        <LiveBar office={false} />
        <FieldPage />
        <Copyright className="eng-copy" />
      </main>
      {/* the guide opens here too; the live-session dialog belongs to the office account */}
      {layer === 'account' && <AccountDialog onClose={close} />}
    </div>
  );
}

function OfficeApp() {
  const { route } = useRoute();
  const { live } = useStore();
  const [layer, setLayer] = useState<Layer>(null);
  const close = useCallback(() => setLayer(null), []);
  const openCmd = useCallback(() => setLayer('cmd'), []);
  const openHelp = useCallback(() => { setLayer(null); openGuide(); }, []);
  useLayerEvents(setLayer);

  const label = routeLabel(route);

  useEffect(() => {
    document.title = `${label} · Whitcombe & Rudd`;
  }, [label]);

  // "Try it on two devices" on the case page (?live=1): the session starts at once and the QR code opens
  useEffect(() => {
    const u = new URL(location.href);
    if (!u.searchParams.has('live')) return;
    u.searchParams.delete('live');
    history.replaceState(null, '', u.toString());
    if (!live.room) live.start();
    setLayer('live');
    // once, on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts (not shown on screen): Ctrl/⌘ K, /, ?, and G then a letter
  useEffect(() => {
    let gAt = 0;
    function onKey(e: KeyboardEvent) {
      const otherDialog = !layer && document.querySelector('.scrim');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (otherDialog) return;
        e.preventDefault();
        setLayer((l) => (l === 'cmd' ? null : 'cmd'));
        return;
      }
      const target = e.target as HTMLElement;
      if (layer || otherDialog || e.metaKey || e.ctrlKey || e.altKey) return;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === '?') { e.preventDefault(); openGuide(); return; }
      if (e.key === '/') { e.preventDefault(); setLayer('cmd'); return; }
      if (e.key === 'g' || e.key === 'G') { gAt = Date.now(); return; }
      if (Date.now() - gAt < 1200) {
        const hit = ROUTES.find((x) => x.key === e.key.toLowerCase());
        gAt = 0;
        if (hit) { e.preventDefault(); go(hit.id); }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [layer]);

  return (
    <div className="app">
      <a className="skip" href="#main">{t('skip')}</a>
      <Rail onSearch={openCmd} />
      <MobileTop title={label} onSearch={openCmd} />
      <main id="main" className="main" tabIndex={-1}>
        <LiveBar />
        {route === 'today' ? <TodayPage /> : route === 'jobs' ? <JobsPage /> : route === 'dispatch' ? <DispatchPage /> : route === 'stock' ? <StockPage /> : route === 'customers' ? <CustomersPage /> : route === 'invoices' ? <InvoicesPage /> : route === 'reports' ? <ReportsPage /> : <FieldPage />}
        <Copyright className="main-copy" />
      </main>
      <TabBar onMore={() => setLayer('more')} moreOpen={layer === 'more'} />

      {layer === 'cmd' && <CommandMenu onClose={close} onHelp={openHelp} />}
      {layer === 'more' && <MoreSheet onClose={close} />}
      {layer === 'live' && <LiveDialog onClose={close} />}
      {layer === 'account' && <AccountDialog onClose={close} />}
    </div>
  );
}
